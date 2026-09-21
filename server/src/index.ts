import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';

interface Peer {
  id: string;
  ws: WebSocket;
  isAlive: boolean;
  joinedAt: number;
}

interface Room {
  id: string;
  pin: string;
  peers: Map<string, Peer>;
  createdAt: number;
}

interface InboundMessage {
  type: string;
  roomId?: string;
  pin?: string;
  targetId?: string;
  data?: unknown;
}

const PORT = parseInt(process.env.PORT || '8080', 10);
const wss = new WebSocketServer({ port: PORT });

// Ephemeral in-memory storage for rooms and reverse lookup for sockets
const rooms = new Map<string, Room>();
const socketToPeer = new Map<WebSocket, { roomId: string; peerId: string }>();

// Alphabet for clean 6-character room codes (avoiding ambiguous chars: 0, O, 1, I)
const ROOM_ID_CHARACTERS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateRoomId(): string {
  let roomId = '';
  for (let i = 0; i < 6; i++) {
    const randomIndex = crypto.randomInt(0, ROOM_ID_CHARACTERS.length);
    roomId += ROOM_ID_CHARACTERS[randomIndex];
  }
  return roomId;
}

function generatePin(): string {
  return crypto.randomInt(1000, 10000).toString();
}

function safeSend(ws: WebSocket, payload: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function removePeerFromRoom(ws: WebSocket): void {
  const peerInfo = socketToPeer.get(ws);
  if (!peerInfo) return;

  const { roomId, peerId } = peerInfo;
  socketToPeer.delete(ws);

  const room = rooms.get(roomId);
  if (!room) return;

  room.peers.delete(peerId);

  // Notify any remaining peers in the room
  for (const remainingPeer of room.peers.values()) {
    safeSend(remainingPeer.ws, {
      type: 'peer-left',
      peerId,
    });
  }

  // Prune room if empty
  if (room.peers.size === 0) {
    rooms.delete(roomId);
    console.log(`[Signaling] Room ${roomId} destroyed (all peers left).`);
  }
}

wss.on('connection', (ws: WebSocket) => {
  const peerId = crypto.randomUUID();
  let peerRef: Peer = {
    id: peerId,
    ws,
    isAlive: true,
    joinedAt: Date.now(),
  };

  ws.on('pong', () => {
    peerRef.isAlive = true;
  });

  ws.on('message', (rawData: Buffer | string) => {
    try {
      const message = JSON.parse(rawData.toString()) as InboundMessage;

      switch (message.type) {
        case 'create-room': {
          // If already in a room, leave it first
          removePeerFromRoom(ws);

          // Generate unique 6-character Room ID
          let roomId = generateRoomId();
          let attempts = 0;
          while (rooms.has(roomId) && attempts < 10) {
            roomId = generateRoomId();
            attempts++;
          }

          const pin = generatePin();
          const newRoom: Room = {
            id: roomId,
            pin,
            peers: new Map(),
            createdAt: Date.now(),
          };

          peerRef = {
            id: peerId,
            ws,
            isAlive: true,
            joinedAt: Date.now(),
          };

          newRoom.peers.set(peerId, peerRef);
          rooms.set(roomId, newRoom);
          socketToPeer.set(ws, { roomId, peerId });

          console.log(`[Signaling] Room ${roomId} created with PIN ${pin} by peer ${peerId}`);

          safeSend(ws, {
            type: 'room-created',
            roomId,
            pin,
            peerId,
          });
          break;
        }

        case 'join-room': {
          const targetRoomId = message.roomId ? message.roomId.trim().toUpperCase() : '';
          const pin = message.pin ? message.pin.trim() : '';

          if (!targetRoomId || !pin) {
            safeSend(ws, {
              type: 'error',
              message: 'Room ID and 4-digit PIN are required.',
            });
            return;
          }

          const room = rooms.get(targetRoomId);
          if (!room) {
            safeSend(ws, {
              type: 'error',
              message: `Room "${targetRoomId}" does not exist or has expired.`,
            });
            return;
          }

          if (room.pin !== pin) {
            safeSend(ws, {
              type: 'error',
              message: 'Invalid 4-digit PIN for this room.',
            });
            return;
          }

          if (room.peers.size >= 2) {
            safeSend(ws, {
              type: 'error',
              message: 'Room is full. AirShare supports a maximum of 2 devices per room.',
            });
            return;
          }

          // Leave existing room if any
          removePeerFromRoom(ws);

          peerRef = {
            id: peerId,
            ws,
            isAlive: true,
            joinedAt: Date.now(),
          };

          // Find the existing host peer ID
          const existingPeerIds = Array.from(room.peers.keys());
          const hostPeerId = existingPeerIds[0];

          room.peers.set(peerId, peerRef);
          socketToPeer.set(ws, { roomId: targetRoomId, peerId });

          console.log(`[Signaling] Peer ${peerId} joined room ${targetRoomId}`);

          // Confirm join to joiner with host info
          safeSend(ws, {
            type: 'joined',
            roomId: targetRoomId,
            peerId,
            remotePeerId: hostPeerId,
          });

          // Inform the host peer about the new peer
          if (hostPeerId) {
            const hostPeer = room.peers.get(hostPeerId);
            if (hostPeer) {
              safeSend(hostPeer.ws, {
                type: 'peer-joined',
                peerId,
              });
            }
          }
          break;
        }

        case 'signal': {
          const peerInfo = socketToPeer.get(ws);
          if (!peerInfo) {
            safeSend(ws, {
              type: 'error',
              message: 'You must be in a room to exchange WebRTC signals.',
            });
            return;
          }

          const { roomId, peerId: senderId } = peerInfo;
          const room = rooms.get(roomId);
          if (!room) {
            safeSend(ws, {
              type: 'error',
              message: 'Room not found.',
            });
            return;
          }

          const targetId = message.targetId;
          if (!targetId) {
            // Forward to the other peer in the room if target not specified
            for (const [id, peer] of room.peers.entries()) {
              if (id !== senderId) {
                safeSend(peer.ws, {
                  type: 'signal',
                  senderId,
                  data: message.data,
                });
              }
            }
            return;
          }

          const targetPeer = room.peers.get(targetId);
          if (targetPeer) {
            safeSend(targetPeer.ws, {
              type: 'signal',
              senderId,
              data: message.data,
            });
          } else {
            safeSend(ws, {
              type: 'error',
              message: `Target peer ${targetId} not found in room.`,
            });
          }
          break;
        }

        case 'leave-room': {
          removePeerFromRoom(ws);
          safeSend(ws, {
            type: 'left',
          });
          break;
        }

        default:
          console.warn(`[Signaling] Unrecognized message type: ${message.type}`);
          safeSend(ws, {
            type: 'error',
            message: `Unknown message type: ${message.type}`,
          });
          break;
      }
    } catch (err) {
      console.error('[Signaling] Failed to process message:', err);
      safeSend(ws, {
        type: 'error',
        message: 'Malformed JSON message payload.',
      });
    }
  });

  ws.on('close', () => {
    removePeerFromRoom(ws);
  });

  ws.on('error', (err) => {
    console.error(`[Signaling] Socket error on peer ${peerId}:`, err);
    removePeerFromRoom(ws);
  });
});

// Periodic heartbeat to terminate dead / zombie sockets
const heartbeatInterval = setInterval(() => {
  for (const client of wss.clients) {
    const peerInfo = socketToPeer.get(client);
    if (!peerInfo) continue;

    const room = rooms.get(peerInfo.roomId);
    const peer = room?.peers.get(peerInfo.peerId);

    if (peer) {
      if (!peer.isAlive) {
        console.log(`[Signaling] Terminating dead connection for peer ${peer.id}`);
        client.terminate();
        removePeerFromRoom(client);
        continue;
      }
      peer.isAlive = false;
      client.ping();
    }
  }
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

console.log(`[AirShare Signaling Server] Running on ws://localhost:${PORT}`);
