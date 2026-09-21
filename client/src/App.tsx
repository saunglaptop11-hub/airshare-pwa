import React, { useState, useEffect, useCallback } from 'react';
import {
  Share2,
  Moon,
  Sun,
  Download,
  WifiOff,
  LogOut,
  Files,
  MessageSquare,
  Shield,
  CheckCircle2,
} from 'lucide-react';
import { useSignaling } from './hooks/useSignaling';
import { useWebRTC } from './hooks/useWebRTC';
import { RoomLobby } from './components/pairing/RoomLobby';
import { DropZone } from './components/transfer/DropZone';
import { ProgressBar } from './components/transfer/ProgressBar';
import { TextDrop } from './components/transfer/TextDrop';
import { Button } from './components/common/Button';
import { Modal } from './components/common/Modal';
import { formatBytes, downloadOrShareFile } from './utils/formatters';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const App: React.FC = () => {
  // Theme state
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  // Active workspace tab when connected: 'files' | 'text'
  const [activeTab, setActiveTab] = useState<'files' | 'text'>('files');

  // PWA install prompt deferred event
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // Leave room confirmation modal state
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  // PWA install prompt listener
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult.outcome === 'accepted') {
      console.log('User accepted PWA installation');
    }
    setDeferredPrompt(null);
  };

  // Toggle Theme
  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    if (newDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('airshare-theme', 'dark');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#09090b');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('airshare-theme', 'light');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#ffffff');
    }
  };

  // Signaling Hook
  const {
    status: signalingStatus,
    error: signalingError,
    roomState,
    createRoom,
    joinRoom,
    sendSignal,
    leaveRoom,
  } = useSignaling({
    onPeerJoined: () => {
      // If host, initiate WebRTC offer
      if (roomState.isHost) {
        webrtc.createOffer();
      }
    },
    onSignal: (_senderId, data) => {
      webrtc.handleSignal(_senderId, data);
    },
    onPeerLeft: () => {
      webrtc.disconnect();
    },
  });

  // WebRTC Hook
  const webrtc = useWebRTC({
    localPeerId: roomState.localPeerId,
    remotePeerId: roomState.remotePeerId,
    isHost: roomState.isHost,
    sendSignal,
  });

  // Automatically initiate offer when host and remotePeerId becomes known
  useEffect(() => {
    if (roomState.isHost && roomState.remotePeerId && webrtc.connectionState === 'disconnected') {
      webrtc.createOffer();
    }
  }, [roomState.isHost, roomState.remotePeerId, webrtc]);

  // Handle URL query parameters for quick joining (e.g. ?room=XYZ999&pin=1234)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const pinParam = params.get('pin');

    if (roomParam && pinParam && signalingStatus === 'connected' && !roomState.roomId) {
      joinRoom(roomParam, pinParam);
      // Clean query params from URL without reload
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [signalingStatus, roomState.roomId, joinRoom]);

  const handleDisconnect = useCallback(() => {
    webrtc.disconnect();
    leaveRoom();
    setShowLeaveModal(false);
  }, [webrtc, leaveRoom]);

  const isConnected = webrtc.connectionState === 'connected';

  return (
    <div className="min-h-screen flex flex-col justify-between bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans transition-colors duration-200">
      {/* HEADER NAVBAR */}
      <header className="sticky top-0 z-40 w-full border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-950 flex items-center justify-center shadow-xs">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-zinc-900 dark:text-zinc-50">
                  AirShare <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">by K2C</span>
                </span>
                <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  P2P PWA
                </span>
              </div>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Install PWA Button */}
            {deferredPrompt && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Download className="w-3.5 h-3.5" />}
                onClick={handleInstallClick}
                className="hidden sm:inline-flex"
              >
                Install App
              </Button>
            )}

            {/* Signaling Server Status Badge */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900"
              title={`Signaling: ${signalingStatus}`}
            >
              {signalingStatus === 'connected' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="hidden md:inline text-zinc-600 dark:text-zinc-300">Online</span>
                </>
              ) : signalingStatus === 'connecting' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  <span className="hidden md:inline text-zinc-600 dark:text-zinc-300">Connecting</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-red-500" />
                  <span className="hidden md:inline text-red-600 dark:text-red-400">Signaling Offline</span>
                </>
              )}
            </div>

            {/* Leave Room Button if in Room */}
            {roomState.roomId && (
              <button
                onClick={() => {
                  if (webrtc.activeTransfer && webrtc.activeTransfer.status === 'TRANSFERRING') {
                    setShowLeaveModal(true);
                  } else {
                    handleDisconnect();
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                title="Leave room"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Leave</span>
              </button>
            )}

            {/* Dark / Light Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN BODY CONTENT */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* VIEW A: Not connected to peer -> Show Lobby */}
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)]">
            <RoomLobby
              signalingStatus={signalingStatus}
              roomState={roomState}
              errorMessage={signalingError || webrtc.error}
              onCreateRoom={createRoom}
              onJoinRoom={joinRoom}
              onLeaveRoom={leaveRoom}
            />
          </div>
        ) : (
          /* VIEW B: Connected to peer -> Full Transfer Workspace */
          <div className="space-y-6">
            {/* Error Banner in Workspace */}
            {webrtc.error && (
              <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 flex items-center justify-between shadow-xs">
                <span>{webrtc.error}</span>
                <button
                  onClick={webrtc.clearError}
                  className="px-2.5 py-1 rounded-lg bg-red-100 dark:bg-red-900/50 hover:bg-red-200 text-[11px] font-medium transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Peer Connected Status Bar */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      Paired & Encrypted
                    </h3>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                      <Shield className="w-3 h-3" />
                      WebRTC RTCDataChannel
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Room <span className="font-mono font-semibold">{roomState.roomId}</span> •{' '}
                    {roomState.isHost ? 'Host Device' : 'Client Device'}
                  </p>
                </div>
              </div>

              {/* Workspace Tab Switcher */}
              <div className="flex p-1 bg-zinc-100 dark:bg-zinc-950 rounded-xl self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('files')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    activeTab === 'files'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <Files className="w-3.5 h-3.5" />
                  <span>Files</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('text')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    activeTab === 'text'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Text Drop</span>
                  {webrtc.receivedTexts.length > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-mono">
                      {webrtc.receivedTexts.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* TAB CONTENT: FILES */}
            {activeTab === 'files' && (
              <div className="space-y-6">
                {/* Active Transfer Progress Banner */}
                {webrtc.activeTransfer && (
                  <ProgressBar
                    transfer={webrtc.activeTransfer}
                    onCancel={webrtc.cancelActiveTransfer}
                  />
                )}

                {/* DropZone for selecting and streaming files */}
                <DropZone
                  onFilesSelected={(files) => webrtc.sendFiles(files)}
                  disabled={!isConnected}
                  isTransferring={webrtc.activeTransfer?.status === 'TRANSFERRING'}
                />

                {/* Transfer History Table */}
                {webrtc.transferHistory.length > 0 && (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                      Session Transfer History
                    </h3>
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                      {webrtc.transferHistory.map((item) => (
                        <div
                          key={item.fileId}
                          className="py-3 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                              {item.name}
                            </p>
                            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                              {item.direction === 'send' ? 'Sent' : 'Received'} • {formatBytes(item.size)} •{' '}
                              {item.totalChunks} chunks (64KB)
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Selesai
                            </span>

                            {(item.blob || item.blobUrl) && (
                              <Button
                                size="sm"
                                variant="outline"
                                leftIcon={<Download className="w-3.5 h-3.5" />}
                                onClick={async () => {
                                  if (item.blob) {
                                    await downloadOrShareFile(item.blob, item.name, item.mimeType);
                                  } else if (item.blobUrl) {
                                    const a = document.createElement('a');
                                    a.style.display = 'none';
                                    a.href = item.blobUrl;
                                    a.download = item.name;
                                    a.target = '_blank';
                                    document.body.appendChild(a);
                                    a.click();
                                    setTimeout(() => document.body.removeChild(a), 1000);
                                  }
                                }}
                              >
                                Simpan
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: TEXT DROP */}
            {activeTab === 'text' && (
              <TextDrop
                texts={webrtc.receivedTexts}
                onSendText={webrtc.sendText}
                disabled={!isConnected}
              />
            )}
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="w-full border-t border-zinc-200/60 dark:border-zinc-800/60 py-4 text-center text-xs text-zinc-400 dark:text-zinc-600">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>AirShare by K2C — Zero-Storage Peer-to-Peer Transfer</span>
          <div className="flex items-center gap-3">
            <span>RTCDataChannel 64KB Slices</span>
            <span>•</span>
            <span>No Cloud Relay</span>
          </div>
        </div>
      </footer>

      {/* CONFIRMATION LEAVE MODAL */}
      <Modal
        isOpen={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        title="Leave Transfer Room?"
        description="A file transfer is currently in progress. Leaving now will interrupt the stream."
      >
        <div className="flex items-center justify-end gap-3 mt-4">
          <Button variant="outline" onClick={() => setShowLeaveModal(false)}>
            Stay in Room
          </Button>
          <Button variant="danger" onClick={handleDisconnect}>
            Leave Room
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default App;
