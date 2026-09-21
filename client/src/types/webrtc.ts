export type SignalingStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export type PeerConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'closed';

// Client to Server Signaling Messages
export interface CreateRoomMessage {
  type: 'create-room';
}

export interface JoinRoomMessage {
  type: 'join-room';
  roomId: string;
  pin: string;
}

export interface SignalMessage {
  type: 'signal';
  roomId?: string;
  targetId?: string;
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

export interface LeaveRoomMessage {
  type: 'leave-room';
  roomId?: string;
}

export type OutboundSignalingMessage =
  | CreateRoomMessage
  | JoinRoomMessage
  | SignalMessage
  | LeaveRoomMessage;

// Server to Client Signaling Messages
export interface RoomCreatedEvent {
  type: 'room-created';
  roomId: string;
  pin: string;
  peerId: string;
}

export interface JoinedEvent {
  type: 'joined';
  roomId: string;
  peerId: string;
  remotePeerId?: string;
}

export interface PeerJoinedEvent {
  type: 'peer-joined';
  peerId: string;
}

export interface SignalForwardEvent {
  type: 'signal';
  senderId: string;
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

export interface PeerLeftEvent {
  type: 'peer-left';
  peerId: string;
}

export interface LeftEvent {
  type: 'left';
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type InboundSignalingMessage =
  | RoomCreatedEvent
  | JoinedEvent
  | PeerJoinedEvent
  | SignalForwardEvent
  | PeerLeftEvent
  | LeftEvent
  | ErrorEvent;

export interface RoomState {
  roomId: string | null;
  pin: string | null;
  isHost: boolean;
  localPeerId: string | null;
  remotePeerId: string | null;
}
