import React from 'react';
import {
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  AlertCircle,
  X,
  Download,
  Gauge,
  Clock,
  Layers,
  Share2,
} from 'lucide-react';
import {
  formatBytes,
  formatSpeed,
  formatDuration,
  truncateFileName,
  downloadOrShareFile,
} from '../../utils/formatters';
import { Button } from '../common/Button';
import type { TransferProgress } from '../../types/transfer';

export interface ProgressBarProps {
  transfer: TransferProgress;
  onCancel?: () => void;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ transfer, onCancel }) => {
  const isSend = transfer.direction === 'send';
  const isCompleted = transfer.status === 'COMPLETED';
  const isError = transfer.status === 'ERROR';
  const isImage = transfer.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(transfer.name);

  // Calculate ETA (Estimated Time of Arrival) in seconds
  const remainingBytes = Math.max(0, transfer.size - transfer.bytesTransferred);
  const etaSeconds =
    transfer.speedBytesPerSec > 0 ? remainingBytes / transfer.speedBytesPerSec : 0;

  const handleSaveFile = async () => {
    if (transfer.blob) {
      await downloadOrShareFile(transfer.blob, transfer.name, transfer.mimeType);
    } else if (transfer.blobUrl) {
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = transfer.blobUrl;
      a.download = transfer.name;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
      }, 1000);
    }
  };

  return (
    <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xs transition-all duration-200">
      {/* Top Header: File info & direction badge */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          {isCompleted && isImage && transfer.blobUrl ? (
            <img
              src={transfer.blobUrl}
              alt={transfer.name}
              className="w-12 h-12 rounded-xl object-cover border border-zinc-200 dark:border-zinc-800 shrink-0 shadow-xs"
            />
          ) : (
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                isError
                  ? 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400'
                  : isCompleted
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                  : isSend
                  ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                  : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
              }`}
            >
              {isError ? (
                <AlertCircle className="w-5 h-5" />
              ) : isCompleted ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : isSend ? (
                <ArrowUpRight className="w-5 h-5" />
              ) : (
                <ArrowDownLeft className="w-5 h-5" />
              )}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4
                className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate"
                title={transfer.name}
              >
                {truncateFileName(transfer.name, 24)}
              </h4>
              {transfer.batchTotal && transfer.batchTotal > 1 && (
                <span className="shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60">
                  File {transfer.batchIndex} dari {transfer.batchTotal}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              <span>{isSend ? 'Mengirim ke peer' : 'Menerima dari peer'}</span>
              <span>•</span>
              <span className="font-mono">
                {formatBytes(transfer.bytesTransferred)} / {formatBytes(transfer.size)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Status Badge & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-lg ${
              isCompleted
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                : isError
                ? 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
            }`}
          >
            {transfer.percent}%
          </span>

          {!isCompleted && !isError && onCancel && (
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Cancel transfer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Track */}
      <div className="w-full bg-zinc-100 dark:bg-zinc-800/80 h-2 rounded-full overflow-hidden my-3">
        <div
          className={`h-full rounded-full transition-all duration-150 ease-out ${
            isCompleted
              ? 'bg-emerald-500'
              : isError
              ? 'bg-red-500'
              : 'bg-zinc-900 dark:bg-zinc-100'
          }`}
          style={{ width: `${Math.max(1, Math.min(100, transfer.percent))}%` }}
        />
      </div>

      {/* Bottom Metadata: Throughput, ETA, and Chunk stats */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 font-mono gap-y-1">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5 text-zinc-400" />
            <span>{isCompleted ? 'Selesai' : formatSpeed(transfer.speedBytesPerSec)}</span>
          </span>

          {!isCompleted && !isError && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>ETA {formatDuration(etaSeconds)}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-zinc-400">
          <Layers className="w-3.5 h-3.5" />
          <span>
            Chunk {transfer.currentChunk.toLocaleString()} / {transfer.totalChunks.toLocaleString()}
          </span>
        </div>
      </div>

      {/* PROMINENT MOBILE & DESKTOP SAVE / DOWNLOAD BUTTON */}
      {isCompleted && !isSend && (transfer.blob || transfer.blobUrl) && (
        <div className="mt-4 pt-3.5 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-zinc-600 dark:text-zinc-400 text-center sm:text-left">
            File lengkap diterima. Ketuk tombol untuk menyimpan ke galeri/file ponsel.
          </div>
          <Button
            size="md"
            variant="primary"
            leftIcon={<Download className="w-4 h-4" />}
            rightIcon={<Share2 className="w-3.5 h-3.5 opacity-70" />}
            onClick={handleSaveFile}
            className="w-full sm:w-auto shadow-sm"
          >
            {isImage ? 'Simpan / Buka Foto' : 'Simpan / Unduh File'}
          </Button>
        </div>
      )}

      {isError && transfer.error && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">
          {transfer.error}
        </div>
      )}
    </div>
  );
};
