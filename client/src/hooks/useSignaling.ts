import { useState, useEffect, useRef, useCallback } from 'react';
import mqtt, { type MqttClient } from 'mqtt';
import type { SignalingStatus, RoomState } from '../types/webrtc';
import { generateUUID, generateRoomId, generatePin } from '../utils/formatters';

const PUBLIC_MQTT_BROKER = 'wss://broker.emqx.io:8084/mqtt';

interface UseSignalingOptions {
  serverUrl?: string;
  onSignal?: (senderId: string, data: RTCSessionDescriptionInit | RTCIceCandidateInit) => void;
  onPeerJoined?: (peerId: string) => void;
  onPeerLeft?: (peerId: string) => void;
}

export function useSignaling(options: UseSignalingOptions = {}) {
  const { onSignal, onPeerJoined, onPeerLeft } = options;

  const [status, setStatus] = useState<SignalingStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState>({
    roomId: null,
    pin: null,
    isHost: false,
    localPeerId: null,
    remotePeerId: null,
  });

  const clientRef = useRef<MqttClient | null>(null);
  const roomStateRef = useRef<RoomState>(roomState);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDestroyedRef = useRef(false);

  const onSignalRef = useRef(onSignal);
  const onPeerJoinedRef = useRef(onPeerJoined);
  const onPeerLeftRef = useRef(onPeerLeft);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  useEffect(() => {
    onSignalRef.current = onSignal;
    onPeerJoinedRef.current = onPeerJoined;
    onPeerLeftRef.current = onPeerLeft;
  });

  const connect = useCallback(() => {
    if (isDestroyedRef.current) return;
    if (clientRef.current && clientRef.current.connected) return;

    setStatus('connecting');
    setError(null);

    const brokerUrl = options.serverUrl || import.meta.env.VITE_SIGNALING_URL || PUBLIC_MQTT_BROKER;
    console.log(`[Signaling] Connecting to cloud signaling relay: ${brokerUrl}`);

    try {
      const client = mqtt.connect(brokerUrl, {
        keepalive: 60,
        reconnectPeriod: 3000,
        connectTimeout: 10000,
        clean: true,
      });

      clientRef.current = client;

      client.on('connect', () => {
        if (clientRef.current !== client) return;
        console.log('[Signaling] Cloud signaling relay connected.');
        setStatus('connected');
        setError(null);
      });

      client.on('message', (topic: string, payloadBuffer: Buffer) => {
        try {
          const raw = payloadBuffer.toString();
          const msg = JSON.parse(raw);
          const currentRoom = roomStateRef.current;

          console.log(`[Signaling] Message on topic ${topic}:`, msg.type);

          switch (msg.type) {
            case 'join-request': {
              // Host receives join request from client
              if (!currentRoom.isHost || !currentRoom.roomId) return;

              if (msg.pin !== currentRoom.pin) {
                console.warn('[Signaling] Client sent invalid PIN:', msg.pin);
                const rejectTopic = `airshare/v1/${currentRoom.roomId}/to_client`;
                client.publish(
                  rejectTopic,
                  JSON.stringify({
                    type: 'error',
                    message: 'PIN 4 digit salah untuk room ini.',
                  })
                );
                return;
              }

              // Valid PIN: Accept joiner
              console.log(`[Signaling] Peer ${msg.peerId} successfully authenticated with PIN.`);
              setRoomState((prev) => ({
                ...prev,
                remotePeerId: msg.peerId,
              }));

              const acceptTopic = `airshare/v1/${currentRoom.roomId}/to_client`;
              client.publish(
                acceptTopic,
                JSON.stringify({
                  type: 'joined',
                  roomId: currentRoom.roomId,
                  peerId: msg.peerId,
                  remotePeerId: currentRoom.localPeerId,
                })
              );

              if (onPeerJoinedRef.current) {
                onPeerJoinedRef.current(msg.peerId);
              }
              break;
            }

            case 'joined': {
              // Joiner receives confirmation from host
              if (joinTimeoutRef.current) {
                clearTimeout(joinTimeoutRef.current);
                joinTimeoutRef.current = null;
              }

              console.log('[Signaling] Joined room confirmed by host:', msg.remotePeerId);
              setRoomState((prev) => ({
                ...prev,
                roomId: msg.roomId,
                remotePeerId: msg.remotePeerId,
              }));
              setError(null);

              if (onPeerJoinedRef.current) {
                onPeerJoinedRef.current(msg.remotePeerId);
              }
              break;
            }

            case 'signal': {
              // Ignore own signals
              if (msg.senderId === currentRoom.localPeerId) return;

              if (onSignalRef.current) {
                onSignalRef.current(msg.senderId, msg.data);
              }
              break;
            }

            case 'peer-left': {
              if (msg.peerId === currentRoom.localPeerId) return;
              console.log(`[Signaling] Peer ${msg.peerId} left the room.`);
              setRoomState((prev) => ({
                ...prev,
                remotePeerId: null,
              }));
              if (onPeerLeftRef.current) {
                onPeerLeftRef.current(msg.peerId);
              }
              break;
            }

            case 'error': {
              if (joinTimeoutRef.current) {
                clearTimeout(joinTimeoutRef.current);
                joinTimeoutRef.current = null;
              }
              console.error('[Signaling Server Error]:', msg.message);
              setError(msg.message);
              break;
            }

            default:
              break;
          }
        } catch (err) {
          console.error('[Signaling] Failed to parse message:', err);
        }
      });

      client.on('error', (err) => {
        console.error('[Signaling] Relay error:', err);
        if (clientRef.current === client) {
          setStatus('error');
          setError('Relay signaling sedang menyambungkan kembali...');
        }
      });

      client.on('close', () => {
        if (clientRef.current === client) {
          setStatus('disconnected');
        }
      });

      client.on('reconnect', () => {
        setStatus('connecting');
      });
    } catch (err) {
      console.error('[Signaling] Failed to initialize connection:', err);
      setStatus('error');
    }
  }, [options.serverUrl]);

  useEffect(() => {
    isDestroyedRef.current = false;
    connect();

    return () => {
      isDestroyedRef.current = true;
      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
      }
      if (clientRef.current) {
        clientRef.current.end(true);
        clientRef.current = null;
      }
    };
  }, [connect]);

  const createRoom = useCallback(() => {
    setError(null);
    const client = clientRef.current;
    if (!client) {
      connect();
      return;
    }

    const roomId = generateRoomId();
    const pin = generatePin();
    const localPeerId = generateUUID();

    const hostTopic = `airshare/v1/${roomId}/to_host`;
    client.subscribe(hostTopic, (err) => {
      if (err) {
        console.error('[Signaling] Failed to subscribe to host topic:', err);
        setError('Gagal membuat room. Coba beberapa saat lagi.');
        return;
      }

      console.log(`[Signaling] Room ${roomId} created with PIN ${pin}`);
      setRoomState({
        roomId,
        pin,
        isHost: true,
        localPeerId,
        remotePeerId: null,
      });
      setError(null);
    });
  }, [connect]);

  const joinRoom = useCallback(
    (roomId: string, pin: string) => {
      setError(null);
      const cleanRoomId = roomId.trim().toUpperCase();
      const cleanPin = pin.trim();

      if (!cleanRoomId || !cleanPin) {
        setError('Room ID dan PIN 4-digit harus diisi.');
        return;
      }

      const client = clientRef.current;
      if (!client) {
        connect();
        return;
      }

      const localPeerId = generateUUID();
      const clientTopic = `airshare/v1/${cleanRoomId}/to_client`;
      const hostTopic = `airshare/v1/${cleanRoomId}/to_host`;

      setRoomState({
        roomId: cleanRoomId,
        pin: null,
        isHost: false,
        localPeerId,
        remotePeerId: null,
      });

      client.subscribe(clientTopic, (err) => {
        if (err) {
          console.error('[Signaling] Failed to subscribe to client topic:', err);
          setError('Gagal bergabung ke room.');
          return;
        }

        console.log(`[Signaling] Sending join request to room ${cleanRoomId}...`);
        client.publish(
          hostTopic,
          JSON.stringify({
            type: 'join-request',
            pin: cleanPin,
            peerId: localPeerId,
          })
        );

        // Timeout if host doesn't respond
        if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
        joinTimeoutRef.current = setTimeout(() => {
          setError(`Room "${cleanRoomId}" tidak ditemukan atau host sedang offline.`);
          setRoomState({
            roomId: null,
            pin: null,
            isHost: false,
            localPeerId: null,
            remotePeerId: null,
          });
        }, 8000);
      });
    },
    [connect]
  );

  const sendSignal = useCallback(
    (_targetId: string, data: RTCSessionDescriptionInit | RTCIceCandidateInit) => {
      const client = clientRef.current;
      const currentRoom = roomStateRef.current;
      if (!client || !currentRoom.roomId || !currentRoom.localPeerId) return;

      const targetTopic = currentRoom.isHost
        ? `airshare/v1/${currentRoom.roomId}/to_client`
        : `airshare/v1/${currentRoom.roomId}/to_host`;

      client.publish(
        targetTopic,
        JSON.stringify({
          type: 'signal',
          senderId: currentRoom.localPeerId,
          data,
        })
      );
    },
    []
  );

  const leaveRoom = useCallback(() => {
    const client = clientRef.current;
    const currentRoom = roomStateRef.current;

    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }

    if (client && currentRoom.roomId) {
      const targetTopic = currentRoom.isHost
        ? `airshare/v1/${currentRoom.roomId}/to_client`
        : `airshare/v1/${currentRoom.roomId}/to_host`;

      client.publish(
        targetTopic,
        JSON.stringify({
          type: 'peer-left',
          peerId: currentRoom.localPeerId,
        })
      );

      const topicToUnsub = currentRoom.isHost
        ? `airshare/v1/${currentRoom.roomId}/to_host`
        : `airshare/v1/${currentRoom.roomId}/to_client`;

      client.unsubscribe(topicToUnsub);
    }

    setRoomState({
      roomId: null,
      pin: null,
      isHost: false,
      localPeerId: null,
      remotePeerId: null,
    });
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    status,
    error,
    roomState,
    connect,
    createRoom,
    joinRoom,
    sendSignal,
    leaveRoom,
    clearError,
  };
}
