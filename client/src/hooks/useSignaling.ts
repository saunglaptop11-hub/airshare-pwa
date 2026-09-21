import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  SignalingStatus,
  RoomState,
  InboundSignalingMessage,
  OutboundSignalingMessage,
} from '../types/webrtc';

interface UseSignalingOptions {
  serverUrl?: string;
  onSignal?: (senderId: string, data: RTCSessionDescriptionInit | RTCIceCandidateInit) => void;
  onPeerJoined?: (peerId: string) => void;
  onPeerLeft?: (peerId: string) => void;
}

export function useSignaling(options: UseSignalingOptions = {}) {
  const { onSignal, onPeerJoined, onPeerLeft } = options;

  // Determine WebSocket URL:
  // 1. If options.serverUrl is explicitly provided, use it.
  // 2. If VITE_SIGNALING_URL is configured (e.g. on Vercel), connect directly to the signaling server.
  // 3. Otherwise use the same host via /ws proxy (which works for localhost AND LAN IP on port 5173).
  // 4. Fallback to :8080 if not running in a browser.
  const resolveServerUrl = () => {
    if (options.serverUrl) return options.serverUrl;
    if (import.meta.env.VITE_SIGNALING_URL) {
      return import.meta.env.VITE_SIGNALING_URL;
    }
    if (typeof window !== 'undefined') {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Use the Vite proxy path /ws on the same host & port (bypasses Windows firewall for port 8080)
      return `${wsProtocol}//${window.location.host}/ws`;
    }
    return 'ws://localhost:8080';
  };

  const [status, setStatus] = useState<SignalingStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState>({
    roomId: null,
    pin: null,
    isHost: false,
    localPeerId: null,
    remotePeerId: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const pendingActionRef = useRef<OutboundSignalingMessage | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDestroyedRef = useRef(false);

  const onSignalRef = useRef(onSignal);
  const onPeerJoinedRef = useRef(onPeerJoined);
  const onPeerLeftRef = useRef(onPeerLeft);

  useEffect(() => {
    onSignalRef.current = onSignal;
    onPeerJoinedRef.current = onPeerJoined;
    onPeerLeftRef.current = onPeerLeft;
  });

  const send = useCallback((message: OutboundSignalingMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    console.warn('[Signaling] WebSocket is not open. Queueing message:', message.type);
    pendingActionRef.current = message;
    return false;
  }, []);

  const connect = useCallback(() => {
    if (isDestroyedRef.current) return;

    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const url = resolveServerUrl();
    setStatus('connecting');
    setError(null);

    try {
      console.log(`[Signaling] Connecting to ${url}...`);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        console.log('[Signaling] Connected successfully.');
        setStatus('connected');
        setError(null);

        // Process any queued pending action
        if (pendingActionRef.current) {
          const action = pendingActionRef.current;
          pendingActionRef.current = null;
          console.log('[Signaling] Dispatching queued action:', action.type);
          ws.send(JSON.stringify(action));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as InboundSignalingMessage;

          switch (msg.type) {
            case 'room-created': {
              setRoomState({
                roomId: msg.roomId,
                pin: msg.pin,
                isHost: true,
                localPeerId: msg.peerId,
                remotePeerId: null,
              });
              setError(null);
              break;
            }

            case 'joined': {
              setRoomState({
                roomId: msg.roomId,
                pin: null,
                isHost: false,
                localPeerId: msg.peerId,
                remotePeerId: msg.remotePeerId || null,
              });
              setError(null);
              if (msg.remotePeerId && onPeerJoinedRef.current) {
                onPeerJoinedRef.current(msg.remotePeerId);
              }
              break;
            }

            case 'peer-joined': {
              setRoomState((prev) => ({
                ...prev,
                remotePeerId: msg.peerId,
              }));
              if (onPeerJoinedRef.current) {
                onPeerJoinedRef.current(msg.peerId);
              }
              break;
            }

            case 'signal': {
              if (onSignalRef.current) {
                onSignalRef.current(msg.senderId, msg.data);
              }
              break;
            }

            case 'peer-left': {
              setRoomState((prev) => ({
                ...prev,
                remotePeerId: null,
              }));
              if (onPeerLeftRef.current) {
                onPeerLeftRef.current(msg.peerId);
              }
              break;
            }

            case 'left': {
              setRoomState({
                roomId: null,
                pin: null,
                isHost: false,
                localPeerId: null,
                remotePeerId: null,
              });
              break;
            }

            case 'error': {
              console.error('[Signaling Server Error]:', msg.message);
              setError(msg.message);
              break;
            }

            default:
              break;
          }
        } catch (parseErr) {
          console.error('[Signaling] Failed to parse message:', parseErr);
        }
      };

      ws.onerror = (e) => {
        console.error('[Signaling] WebSocket error:', e);
        if (wsRef.current === ws) {
          setStatus('error');
          setError('Signaling server unreachable. Retrying automatically...');
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          console.warn('[Signaling] WebSocket closed.');
          setStatus('disconnected');
          wsRef.current = null;

          // Automatically schedule reconnect
          if (!isDestroyedRef.current) {
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, 2000);
          }
        }
      };
    } catch (err) {
      console.error('[Signaling] Connection initialization failed:', err);
      setStatus('error');
      setError('Failed to initiate WebSocket connection. Retrying...');
      if (!isDestroyedRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 2000);
      }
    }
  }, []);

  useEffect(() => {
    isDestroyedRef.current = false;
    connect();

    return () => {
      isDestroyedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const createRoom = useCallback(() => {
    setError(null);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      send({ type: 'create-room' });
    } else {
      console.log('[Signaling] Connecting and queueing create-room...');
      pendingActionRef.current = { type: 'create-room' };
      connect();
    }
  }, [send, connect]);

  const joinRoom = useCallback(
    (roomId: string, pin: string) => {
      setError(null);
      const msg: OutboundSignalingMessage = {
        type: 'join-room',
        roomId: roomId.trim().toUpperCase(),
        pin: pin.trim(),
      };
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        send(msg);
      } else {
        console.log('[Signaling] Connecting and queueing join-room...');
        pendingActionRef.current = msg;
        connect();
      }
    },
    [send, connect]
  );

  const sendSignal = useCallback(
    (targetId: string, data: RTCSessionDescriptionInit | RTCIceCandidateInit) => {
      send({
        type: 'signal',
        targetId,
        data,
      });
    },
    [send]
  );

  const leaveRoom = useCallback(() => {
    send({ type: 'leave-room' });
    setRoomState({
      roomId: null,
      pin: null,
      isHost: false,
      localPeerId: null,
      remotePeerId: null,
    });
  }, [send]);

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
