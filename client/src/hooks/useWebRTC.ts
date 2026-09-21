import { useState, useEffect, useRef, useCallback } from 'react';
import type { PeerConnectionState } from '../types/webrtc';
import type {
  TransferProgress,
  ReceivedText,
  FileHeaderPayload,
  DataChannelControlMessage,
} from '../types/transfer';
import { generateUUID } from '../utils/formatters';

const CHUNK_SIZE = 64 * 1024; // 64KB chunk slice stream
const BUFFERED_AMOUNT_LOW_THRESHOLD = 64 * 1024; // 64KB threshold for backpressure

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

interface UseWebRTCOptions {
  localPeerId: string | null;
  remotePeerId: string | null;
  isHost: boolean;
  sendSignal: (targetId: string, data: RTCSessionDescriptionInit | RTCIceCandidateInit) => void;
}

interface ReceivingFileState {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  totalChunks: number;
  receivedChunks: ArrayBuffer[];
  bytesReceived: number;
  startTime: number;
  lastProgressUpdate: number;
  lastBytesReceived: number;
  batchIndex?: number;
  batchTotal?: number;
}

interface QueueItem {
  file: File;
  batchIndex: number;
  batchTotal: number;
}

export function useWebRTC({
  localPeerId: _localPeerId,
  remotePeerId,
  isHost,
  sendSignal,
}: UseWebRTCOptions) {
  const [connectionState, setConnectionState] = useState<PeerConnectionState>('disconnected');
  const [activeTransfer, setActiveTransfer] = useState<TransferProgress | null>(null);
  const [transferHistory, setTransferHistory] = useState<TransferProgress[]>([]);
  const [receivedTexts, setReceivedTexts] = useState<ReceivedText[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const receivingFileRef = useRef<ReceivingFileState | null>(null);
  const cancelTransferRef = useRef<boolean>(false);
  const activeBlobUrlsRef = useRef<string[]>([]);
  const sendQueueRef = useRef<QueueItem[]>([]);
  const isProcessingQueueRef = useRef<boolean>(false);
  const pendingAckResolveRef = useRef<(() => void) | null>(null);

  // Keep references updated for async callbacks
  const remotePeerIdRef = useRef(remotePeerId);
  useEffect(() => {
    remotePeerIdRef.current = remotePeerId;
  }, [remotePeerId]);

  const sendSignalRef = useRef(sendSignal);
  useEffect(() => {
    sendSignalRef.current = sendSignal;
  }, [sendSignal]);

  const triggerDownload = useCallback((blob: Blob, fileName: string) => {
    try {
      const url = URL.createObjectURL(blob);
      activeBlobUrlsRef.current.push(url);

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
      }, 5000);
      return url;
    } catch (err) {
      console.error('[WebRTC] Auto-download failed:', err);
      return undefined;
    }
  }, []);

  const processIncomingChunk = useCallback(
    (chunkBuffer: ArrayBuffer, channel: RTCDataChannel) => {
      const fileState = receivingFileRef.current;
      if (!fileState) {
        console.warn('[WebRTC] Received chunk without active file header.');
        return;
      }

      fileState.receivedChunks.push(chunkBuffer);
      fileState.bytesReceived += chunkBuffer.byteLength;
      const currentChunk = fileState.receivedChunks.length;

      // Calculate transfer speed periodically (every 250ms) or at completion
      const now = Date.now();
      const timeDiff = (now - fileState.lastProgressUpdate) / 1000;
      let speed = 0;

      if (timeDiff >= 0.25 || currentChunk === fileState.totalChunks) {
        const bytesDiff = fileState.bytesReceived - fileState.lastBytesReceived;
        speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
        fileState.lastProgressUpdate = now;
        fileState.lastBytesReceived = fileState.bytesReceived;
      }

      const percent = Math.min(100, Math.round((fileState.bytesReceived / fileState.size) * 100));

      setActiveTransfer({
        fileId: fileState.fileId,
        name: fileState.name,
        size: fileState.size,
        mimeType: fileState.mimeType,
        bytesTransferred: fileState.bytesReceived,
        totalChunks: fileState.totalChunks,
        currentChunk,
        speedBytesPerSec: speed,
        percent,
        direction: 'receive',
        status: currentChunk >= fileState.totalChunks ? 'COMPLETED' : 'TRANSFERRING',
        batchIndex: fileState.batchIndex,
        batchTotal: fileState.batchTotal,
      });

      // If file transfer completed
      if (currentChunk >= fileState.totalChunks) {
        console.log(`[WebRTC] File download complete: ${fileState.name} (${fileState.size} bytes)`);
        const blob = new Blob(fileState.receivedChunks, {
          type: fileState.mimeType || 'application/octet-stream',
        });

        // Trigger browser auto-download
        const downloadUrl = triggerDownload(blob, fileState.name);

        // Send acknowledgment back to sender
        if (channel.readyState === 'open') {
          channel.send(
            JSON.stringify({
              type: 'file-ack',
              fileId: fileState.fileId,
            })
          );
        }

        const completedRecord: TransferProgress = {
          fileId: fileState.fileId,
          name: fileState.name,
          size: fileState.size,
          mimeType: fileState.mimeType,
          bytesTransferred: fileState.size,
          totalChunks: fileState.totalChunks,
          currentChunk: fileState.totalChunks,
          speedBytesPerSec: 0,
          percent: 100,
          direction: 'receive',
          status: 'COMPLETED',
          blobUrl: downloadUrl,
          blob: blob,
          batchIndex: fileState.batchIndex,
          batchTotal: fileState.batchTotal,
        };

        setActiveTransfer(completedRecord);
        setTransferHistory((h) => [completedRecord, ...h]);
        receivingFileRef.current = null;
      }
    },
    [triggerDownload]
  );

  const setupDataChannel = useCallback(
    (channel: RTCDataChannel) => {
      dataChannelRef.current = channel;
      channel.binaryType = 'arraybuffer';
      channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;

      const handleOpen = () => {
        console.log('[WebRTC] DataChannel open');
        setConnectionState('connected');
        setError(null);
      };

      channel.onopen = handleOpen;
      // If already open (common in Joiner when ondatachannel fires), activate immediately
      if (channel.readyState === 'open') {
        handleOpen();
      }

      channel.onclose = () => {
        console.log('[WebRTC] DataChannel closed');
        setConnectionState('disconnected');
      };

      channel.onerror = (e) => {
        console.error('[WebRTC] DataChannel error:', e);
        setError('Data transfer channel encountered an error.');
      };

      channel.onmessage = (event: MessageEvent) => {
        // 1. Text or JSON Control Message
        if (typeof event.data === 'string') {
          try {
            const message = JSON.parse(event.data) as DataChannelControlMessage;

            if (message.type === 'header') {
              // Incoming file header: initialize receiver
              const header = message as FileHeaderPayload;
              console.log(
                `[WebRTC] Incoming file header (${header.batchIndex || 1}/${header.batchTotal || 1}): ${header.name} (${header.size} bytes)`
              );
              receivingFileRef.current = {
                fileId: header.fileId,
                name: header.name,
                size: header.size,
                mimeType: header.mimeType,
                totalChunks: header.totalChunks,
                receivedChunks: [],
                bytesReceived: 0,
                startTime: Date.now(),
                lastProgressUpdate: Date.now(),
                lastBytesReceived: 0,
                batchIndex: header.batchIndex,
                batchTotal: header.batchTotal,
              };

              setActiveTransfer({
                fileId: header.fileId,
                name: header.name,
                size: header.size,
                mimeType: header.mimeType,
                bytesTransferred: 0,
                totalChunks: header.totalChunks,
                currentChunk: 0,
                speedBytesPerSec: 0,
                percent: 0,
                direction: 'receive',
                status: 'TRANSFERRING',
                batchIndex: header.batchIndex,
                batchTotal: header.batchTotal,
              });
            } else if (message.type === 'file-ack') {
              console.log(`[WebRTC] Peer confirmed file received: ${message.fileId}`);
              if (pendingAckResolveRef.current) {
                pendingAckResolveRef.current();
              }
              setActiveTransfer((prev) => {
                if (prev && prev.fileId === message.fileId) {
                  const completed: TransferProgress = {
                    ...prev,
                    bytesTransferred: prev.size,
                    currentChunk: prev.totalChunks,
                    percent: 100,
                    speedBytesPerSec: 0,
                    status: 'COMPLETED',
                  };
                  setTransferHistory((h) => {
                    if (h.some((x) => x.fileId === message.fileId)) return h;
                    return [completed, ...h];
                  });
                  return null;
                }
                return prev;
              });
            } else if (message.type === 'text-drop') {
              console.log(`[WebRTC] Received text drop: "${message.content}"`);
              const textItem: ReceivedText = {
                id: message.id,
                content: message.content,
                timestamp: message.timestamp,
                sender: 'remote',
              };
              setReceivedTexts((prev) => [textItem, ...prev]);
            }
          } catch (err) {
            console.error('[WebRTC] Failed to parse control message:', err);
          }
          return;
        }

        // 2. Binary ArrayBuffer or Blob (incoming file slice)
        if (event.data instanceof ArrayBuffer) {
          processIncomingChunk(event.data, channel);
        } else if (typeof Blob !== 'undefined' && event.data instanceof Blob) {
          event.data
            .arrayBuffer()
            .then((buf) => {
              processIncomingChunk(buf, channel);
            })
            .catch((err) => {
              console.error('[WebRTC] Failed to read blob chunk:', err);
            });
        }
      };
    },
    [processIncomingChunk]
  );

  // Initialize RTCPeerConnection
  const initPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    console.log('[WebRTC] Initializing new RTCPeerConnection (isHost:', isHost, ')');
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;
    pendingIceCandidatesRef.current = [];

    pc.onicecandidate = (event) => {
      if (event.candidate && event.candidate.candidate && remotePeerIdRef.current) {
        sendSignalRef.current(remotePeerIdRef.current, event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Peer connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        // Wait for dataChannel to also confirm
        if (dataChannelRef.current?.readyState === 'open') {
          setConnectionState('connected');
        }
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnectionState(pc.connectionState);
      } else if (pc.connectionState === 'closed') {
        setConnectionState('disconnected');
      }
    };

    if (isHost) {
      // Host creates the primary DataChannel
      const dc = pc.createDataChannel('airshare-data', { ordered: true });
      setupDataChannel(dc);
    } else {
      // Joiner listens for incoming DataChannel
      pc.ondatachannel = (event) => {
        console.log('[WebRTC] Joiner ondatachannel fired');
        setupDataChannel(event.channel);
      };
    }

    return pc;
  }, [isHost, setupDataChannel]);

  // Create WebRTC Offer (initiated by Host when peer joins)
  const createOffer = useCallback(async () => {
    const targetPeerId = remotePeerIdRef.current;
    if (!targetPeerId) {
      console.warn('[WebRTC] Cannot create offer: remotePeerId is null.');
      return;
    }

    try {
      console.log('[WebRTC] Creating SDP Offer for peer:', targetPeerId);
      setConnectionState('connecting');
      const pc = initPeerConnection();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignalRef.current(targetPeerId, offer);
    } catch (err) {
      console.error('[WebRTC] Create offer failed:', err);
      setError('Failed to initiate WebRTC connection.');
      setConnectionState('failed');
    }
  }, [initPeerConnection]);

  // Handle incoming signaling messages (Offer, Answer, ICE Candidate)
  const handleSignal = useCallback(
    async (senderId: string, data: RTCSessionDescriptionInit | RTCIceCandidateInit) => {
      let pc = pcRef.current;

      try {
        if ('type' in data && (data.type === 'offer' || data.type === 'answer')) {
          const sdp = data as RTCSessionDescriptionInit;

          if (sdp.type === 'offer') {
            console.log('[WebRTC] Received SDP Offer from:', senderId);
            if (!pc) {
              pc = initPeerConnection();
            }
            setConnectionState('connecting');
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));

            // Apply queued ICE candidates
            while (pendingIceCandidatesRef.current.length > 0) {
              const candidate = pendingIceCandidatesRef.current.shift();
              if (candidate && candidate.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              }
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignalRef.current(senderId, answer);
            console.log('[WebRTC] Sent SDP Answer to:', senderId);
          } else if (sdp.type === 'answer') {
            console.log('[WebRTC] Received SDP Answer from:', senderId);
            if (pc) {
              await pc.setRemoteDescription(new RTCSessionDescription(sdp));

              // Apply queued ICE candidates
              while (pendingIceCandidatesRef.current.length > 0) {
                const candidate = pendingIceCandidatesRef.current.shift();
                if (candidate && candidate.candidate) {
                  await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
              }
            }
          }
        } else if ('candidate' in data) {
          const candidateInit = data as RTCIceCandidateInit;
          if (candidateInit && candidateInit.candidate) {
            if (pc && pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
            } else {
              pendingIceCandidatesRef.current.push(candidateInit);
            }
          }
        }
      } catch (err) {
        console.error('[WebRTC] Error handling signal:', err);
        setError('Signaling negotiation failed.');
      }
    },
    [initPeerConnection]
  );

  // Send a single file over the DataChannel and wait for peer acknowledgment
  const sendSingleFile = useCallback(
    async (file: File, batchIndex?: number, batchTotal?: number): Promise<boolean> => {
      const dc = dataChannelRef.current;
      if (!dc || dc.readyState !== 'open') {
        const msg = `Cannot send file: P2P DataChannel is not open (status: ${dc ? dc.readyState : 'closed'}).`;
        console.error('[WebRTC]', msg);
        setError(msg);
        return false;
      }

      cancelTransferRef.current = false;
      const fileId = generateUUID();
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      console.log(
        `[WebRTC] Starting file transfer (${batchIndex || 1}/${batchTotal || 1}): ${file.name} (${file.size} bytes, ${totalChunks} chunks)`
      );

      // 1. Send Header Message
      const header: FileHeaderPayload = {
        type: 'header',
        fileId,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        totalChunks,
        chunkSize: CHUNK_SIZE,
        batchIndex,
        batchTotal,
      };

      dc.send(JSON.stringify(header));

      const transferInfo: TransferProgress = {
        fileId,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        bytesTransferred: 0,
        totalChunks,
        currentChunk: 0,
        speedBytesPerSec: 0,
        percent: 0,
        direction: 'send',
        status: 'TRANSFERRING',
        batchIndex,
        batchTotal,
      };
      setActiveTransfer(transferInfo);

      let offset = 0;
      let chunkIndex = 0;
      let lastProgressUpdate = Date.now();
      let lastBytesSent = 0;

      try {
        while (offset < file.size) {
          if (cancelTransferRef.current) {
            setActiveTransfer((prev) => (prev ? { ...prev, status: 'ERROR', error: 'Transfer cancelled' } : null));
            return false;
          }

          // Backpressure check: wait if bufferedAmount exceeds threshold (64KB), with safeguard timeout
          if (dc.bufferedAmount > BUFFERED_AMOUNT_LOW_THRESHOLD) {
            await new Promise<void>((resolve) => {
              let timeoutId: ReturnType<typeof setTimeout>;
              const onLow = () => {
                clearTimeout(timeoutId);
                dc.removeEventListener('bufferedamountlow', onLow);
                resolve();
              };
              timeoutId = setTimeout(onLow, 100);
              dc.addEventListener('bufferedamountlow', onLow);
            });
          }

          // Read exactly one 64KB slice from Blob
          const slice = file.slice(offset, offset + CHUNK_SIZE);
          const buffer = await slice.arrayBuffer();

          dc.send(buffer);

          offset += buffer.byteLength;
          chunkIndex++;

          // Calculate transfer speed periodically (every 250ms)
          const now = Date.now();
          const timeDiff = (now - lastProgressUpdate) / 1000;
          let speed = 0;

          if (timeDiff >= 0.25 || offset >= file.size) {
            const bytesDiff = offset - lastBytesSent;
            speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
            lastProgressUpdate = now;
            lastBytesSent = offset;
          }

          const percent = Math.min(100, Math.round((offset / file.size) * 100));

          setActiveTransfer({
            fileId,
            name: file.name,
            size: file.size,
            mimeType: file.type || 'application/octet-stream',
            bytesTransferred: offset,
            totalChunks,
            currentChunk: chunkIndex,
            speedBytesPerSec: speed,
            percent,
            direction: 'send',
            status: 'TRANSFERRING',
            batchIndex,
            batchTotal,
          });
        }

        console.log(`[WebRTC] All chunks sent for: ${file.name}. Awaiting peer acknowledgment...`);

        // Wait for peer acknowledgment or timeout before releasing for the next file
        await new Promise<void>((resolve) => {
          let timeoutId: ReturnType<typeof setTimeout>;
          const done = () => {
            clearTimeout(timeoutId);
            pendingAckResolveRef.current = null;
            resolve();
          };
          pendingAckResolveRef.current = done;
          timeoutId = setTimeout(done, 5000);
        });

        // Ensure record is saved to history if not already processed by ack
        setActiveTransfer((prev) => {
          if (prev && prev.fileId === fileId) {
            const completed: TransferProgress = {
              ...prev,
              bytesTransferred: file.size,
              currentChunk: totalChunks,
              percent: 100,
              speedBytesPerSec: 0,
              status: 'COMPLETED',
            };
            setTransferHistory((h) => {
              if (h.some((x) => x.fileId === fileId)) return h;
              return [completed, ...h];
            });
            return null;
          }
          return prev;
        });

        return true;
      } catch (err) {
        console.error('[WebRTC] File chunk transfer failed:', err);
        setActiveTransfer((prev) =>
          prev
            ? {
                ...prev,
                status: 'ERROR',
                error: 'Failed to send file chunk.',
              }
            : null
        );
        setError('File transfer interrupted.');
        return false;
      }
    },
    []
  );

  // Background queue processor: streams files sequentially one-by-one
  const processQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;

    try {
      while (sendQueueRef.current.length > 0) {
        if (cancelTransferRef.current) {
          sendQueueRef.current = [];
          break;
        }

        const next = sendQueueRef.current.shift();
        if (!next) break;

        const success = await sendSingleFile(next.file, next.batchIndex, next.batchTotal);
        if (!success || cancelTransferRef.current) {
          sendQueueRef.current = [];
          break;
        }

        // Brief delay between files so channels and buffers settle cleanly
        if (sendQueueRef.current.length > 0) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    } finally {
      isProcessingQueueRef.current = false;
    }
  }, [sendSingleFile]);

  // Send multiple files sequentially via queue
  const sendFiles = useCallback(
    async (files: File[]) => {
      if (!files || files.length === 0) return false;

      const dc = dataChannelRef.current;
      if (!dc || dc.readyState !== 'open') {
        const msg = `Cannot send files: P2P DataChannel is not open (status: ${dc ? dc.readyState : 'closed'}).`;
        console.error('[WebRTC]', msg);
        setError(msg);
        return false;
      }

      cancelTransferRef.current = false;
      const total = files.length;
      const queueItems: QueueItem[] = files.map((file, idx) => ({
        file,
        batchIndex: idx + 1,
        batchTotal: total,
      }));

      sendQueueRef.current.push(...queueItems);
      processQueue();
      return true;
    },
    [processQueue]
  );

  // Single file shortcut
  const sendFile = useCallback(
    async (file: File) => {
      return sendFiles([file]);
    },
    [sendFiles]
  );

  // Send instant Text Drop
  const sendText = useCallback((content: string) => {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== 'open') {
      const msg = `Cannot send text: peer is not connected (status: ${dc ? dc.readyState : 'closed'}).`;
      console.error('[WebRTC]', msg);
      setError(msg);
      return false;
    }

    const trimmed = content.trim();
    if (!trimmed) return false;

    // Use universal generateUUID that works even on insecure origins (HTTP local IP on mobile)
    const payload = {
      type: 'text-drop' as const,
      id: generateUUID(),
      content: trimmed,
      timestamp: Date.now(),
    };

    console.log('[WebRTC] Sending text drop:', payload.content);
    dc.send(JSON.stringify(payload));

    const localItem: ReceivedText = {
      id: payload.id,
      content: payload.content,
      timestamp: payload.timestamp,
      sender: 'local',
    };

    setReceivedTexts((prev) => [localItem, ...prev]);
    return true;
  }, []);

  // Cancel ongoing transfer
  const cancelActiveTransfer = useCallback(() => {
    cancelTransferRef.current = true;
    sendQueueRef.current = [];
    if (pendingAckResolveRef.current) {
      pendingAckResolveRef.current();
    }
    setActiveTransfer(null);
  }, []);

  // Reset WebRTC connection
  const disconnect = useCallback(() => {
    cancelTransferRef.current = true;
    sendQueueRef.current = [];
    if (pendingAckResolveRef.current) {
      pendingAckResolveRef.current();
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    pendingIceCandidatesRef.current = [];
    receivingFileRef.current = null;
    setConnectionState('disconnected');
    setActiveTransfer(null);

    // Revoke object URLs on disconnect
    for (const url of activeBlobUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    activeBlobUrlsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connectionState,
    activeTransfer,
    transferHistory,
    receivedTexts,
    error,
    createOffer,
    handleSignal,
    sendFile,
    sendFiles,
    sendText,
    cancelActiveTransfer,
    disconnect,
    clearError: () => setError(null),
  };
}
