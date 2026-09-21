import React, { useState } from 'react';
import { Copy, Check, Radio, ArrowRight, ShieldCheck, Plus, Link as LinkIcon, Loader2 } from 'lucide-react';
import { Button } from '../common/Button';
import { PinAuth } from './PinAuth';
import type { RoomState, SignalingStatus } from '../../types/webrtc';

export interface RoomLobbyProps {
  signalingStatus: SignalingStatus;
  roomState: RoomState;
  errorMessage: string | null;
  onCreateRoom: () => void;
  onJoinRoom: (roomId: string, pin: string) => void;
  onLeaveRoom: () => void;
}

export const RoomLobby: React.FC<RoomLobbyProps> = ({
  signalingStatus,
  roomState,
  errorMessage,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
}) => {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinPin, setJoinPin] = useState('');
  const [localValidation, setLocalValidation] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const isInRoom = Boolean(roomState.roomId);
  const isHost = roomState.isHost;

  const handleCopyCode = async () => {
    if (!roomState.roomId) return;
    const textToCopy = `Room: ${roomState.roomId} | PIN: ${roomState.pin || ''}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyLink = async () => {
    if (!roomState.roomId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomState.roomId);
    if (roomState.pin) {
      url.searchParams.set('pin', roomState.pin);
    }
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Smart Room ID handler: parses pasted invite links or code/pin strings
  const handleRoomIdChange = (rawInput: string) => {
    setLocalValidation(null);
    let val = rawInput.trim();

    // Check if user pasted an invite URL (e.g. ?room=XYZ&pin=1234)
    if (val.includes('room=')) {
      try {
        const url = new URL(val.startsWith('http') ? val : `http://${val}`);
        const r = url.searchParams.get('room');
        const p = url.searchParams.get('pin');
        if (r) {
          setJoinRoomId(r.toUpperCase().slice(0, 6));
        }
        if (p) {
          setJoinPin(p.replace(/\D/g, '').slice(0, 4));
        }
        return;
      } catch {
        // Not a URL, fallback to text regex
      }
    }

    // Check if user pasted formatted text: "Room: ABCDEF | PIN: 1234"
    const match = val.match(/([A-Za-z0-9]{6})\D+(\d{4})/);
    if (match) {
      setJoinRoomId(match[1].toUpperCase());
      setJoinPin(match[2]);
      return;
    }

    // Standard single field text
    setJoinRoomId(val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalValidation(null);

    const cleanRoom = joinRoomId.trim().toUpperCase();
    const cleanPin = joinPin.trim();

    if (!cleanRoom) {
      setLocalValidation('Silakan masukkan 6-karakter Kode Room terlebih dahulu.');
      return;
    }

    if (cleanRoom.length !== 6) {
      setLocalValidation(`Kode Room harus 6 karakter (saat ini ${cleanRoom.length} karakter).`);
      return;
    }

    if (!cleanPin) {
      setLocalValidation('Silakan masukkan 4-digit PIN.');
      return;
    }

    if (cleanPin.length !== 4) {
      setLocalValidation(`PIN harus 4 angka (saat ini ${cleanPin.length} angka).`);
      return;
    }

    onJoinRoom(cleanRoom, cleanPin);
  };

  // 1. HOST VIEW: Waiting for peer to join
  if (isInRoom && isHost) {
    return (
      <div className="w-full max-w-md mx-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-sm">
        {/* Pulsing Radar Animation */}
        <div className="relative flex items-center justify-center my-6">
          <div className="w-20 h-20 rounded-full bg-zinc-900/5 dark:bg-zinc-100/5 flex items-center justify-center relative">
            <div className="absolute inset-0 rounded-full border border-zinc-900/20 dark:border-zinc-100/20 animate-radar" />
            <div className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-950 flex items-center justify-center shadow-md">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
          </div>
        </div>

        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Waiting for Peer to Connect
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Buka AirShare by K2C di perangkat kedua dan masukkan Room Code & PIN di bawah.
          </p>
        </div>

        {/* Room Credentials Card */}
        <div className="bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 mb-6 space-y-4">
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400 dark:text-zinc-500">
              Room Code
            </span>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-mono text-3xl font-bold tracking-widest text-zinc-900 dark:text-zinc-50">
                {roomState.roomId}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-200/60 dark:border-zinc-800">
            <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400 dark:text-zinc-500">
              4-Digit PIN
            </span>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-mono text-2xl font-bold tracking-widest text-zinc-800 dark:text-zinc-200">
                {roomState.pin}
              </span>
              <div className="inline-flex items-center gap-1 text-xs text-zinc-400">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Protected</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          <Button
            variant="outline"
            className="w-full"
            leftIcon={copiedLink ? <Check className="w-4 h-4 text-emerald-500" /> : <LinkIcon className="w-4 h-4" />}
            onClick={handleCopyLink}
          >
            {copiedLink ? 'Invite Link Copied!' : 'Copy Direct Invite Link'}
          </Button>

          <Button
            variant="ghost"
            className="w-full text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            onClick={onLeaveRoom}
          >
            Cancel & Leave Room
          </Button>
        </div>
      </div>
    );
  }

  // 2. JOINER VIEW: Joined the room, establishing WebRTC connection with Host
  if (isInRoom && !isHost) {
    return (
      <div className="w-full max-w-md mx-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-sm text-center">
        <div className="relative flex items-center justify-center my-6">
          <div className="w-20 h-20 rounded-full bg-zinc-900/5 dark:bg-zinc-100/5 flex items-center justify-center relative">
            <div className="absolute inset-0 rounded-full border border-zinc-900/20 dark:border-zinc-100/20 animate-radar" />
            <div className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-950 flex items-center justify-center shadow-md">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          </div>
        </div>

        <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Connecting to Host Device...
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Joined Room <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">{roomState.roomId}</span>.
          Negotiating encrypted WebRTC DataChannel...
        </p>

        <div className="mt-8">
          <Button
            variant="ghost"
            className="w-full text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            onClick={onLeaveRoom}
          >
            Cancel Connection
          </Button>
        </div>
      </div>
    );
  }

  // 3. INITIAL LOBBY: Create or Join Room
  const displayError = localValidation || errorMessage;

  return (
    <div className="w-full max-w-md mx-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-sm">
      {/* Tab Switcher */}
      <div className="flex p-1 bg-zinc-100 dark:bg-zinc-950/80 rounded-2xl mb-6">
        <button
          type="button"
          onClick={() => {
            setTab('create');
            setLocalValidation(null);
          }}
          className={`flex-1 py-2 text-sm font-medium rounded-xl transition-all duration-150 ${
            tab === 'create'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-xs'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          Create Room
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('join');
            setLocalValidation(null);
          }}
          className={`flex-1 py-2 text-sm font-medium rounded-xl transition-all duration-150 ${
            tab === 'join'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-xs'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          Join Room
        </button>
      </div>

      {/* Error Banner */}
      {displayError && (
        <div className="mb-5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 leading-relaxed">
          {displayError}
        </div>
      )}

      {/* CREATE TAB */}
      {tab === 'create' && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-900 dark:text-zinc-50">
              <Plus className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Start a New Transfer
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs mx-auto">
              Buat room ephemeral untuk menghubungkan perangkat PC dan HP secara langsung.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200/70 dark:border-zinc-800 text-xs space-y-2">
            <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Transfer P2P langsung tanpa simpan di server</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Aman dengan 4-digit PIN sesi</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Stream 64KB chunk dengan flow control</span>
            </div>
          </div>

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={onCreateRoom}
            isLoading={signalingStatus === 'connecting'}
          >
            {signalingStatus === 'connecting' ? 'Connecting & Creating Room...' : 'Create Transfer Room'}
          </Button>
        </div>
      )}

      {/* JOIN TAB */}
      {tab === 'join' && (
        <form onSubmit={handleJoinSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="room-code-input"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2"
            >
              Room Code (6 Karakter)
            </label>
            <input
              id="room-code-input"
              type="text"
              maxLength={30}
              value={joinRoomId}
              onChange={(e) => handleRoomIdChange(e.target.value)}
              placeholder="Contoh: C533SK"
              className="w-full px-4 py-3 text-center text-xl font-mono font-bold tracking-widest rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-50 focus:border-zinc-900 dark:focus:border-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-100/10 transition-colors uppercase placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck="false"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2 text-center">
              4-Digit PIN
            </label>
            <PinAuth
              value={joinPin}
              onChange={(pin) => {
                setLocalValidation(null);
                setJoinPin(pin);
              }}
              onComplete={(pin) => {
                if (joinRoomId.length === 6) {
                  onJoinRoom(joinRoomId, pin);
                }
              }}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full mt-2"
            rightIcon={<ArrowRight className="w-4 h-4" />}
            isLoading={signalingStatus === 'connecting'}
          >
            {signalingStatus === 'connecting' ? 'Connecting to Peer...' : 'Connect to Peer'}
          </Button>
        </form>
      )}
    </div>
  );
};
