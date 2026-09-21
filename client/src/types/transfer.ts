export type TransferState =
  | 'IDLE'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'TRANSFERRING'
  | 'COMPLETED'
  | 'ERROR';

export interface FileHeaderPayload {
  type: 'header';
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  totalChunks: number;
  chunkSize: number;
  batchIndex?: number;
  batchTotal?: number;
}

export interface FileAckPayload {
  type: 'file-ack';
  fileId: string;
}

export interface TextDropPayload {
  type: 'text-drop';
  id: string;
  content: string;
  timestamp: number;
}

export type DataChannelControlMessage =
  | FileHeaderPayload
  | FileAckPayload
  | TextDropPayload;

export interface TransferProgress {
  fileId: string;
  name: string;
  size: number;
  mimeType?: string;
  bytesTransferred: number;
  totalChunks: number;
  currentChunk: number;
  speedBytesPerSec: number;
  percent: number;
  direction: 'send' | 'receive';
  status: TransferState;
  error?: string;
  blobUrl?: string;
  blob?: Blob;
  batchIndex?: number;
  batchTotal?: number;
}

export interface ReceivedText {
  id: string;
  content: string;
  timestamp: number;
  sender: 'local' | 'remote';
}
