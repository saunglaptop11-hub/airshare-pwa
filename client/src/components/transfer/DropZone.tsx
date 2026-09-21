import React, { useState, useRef } from 'react';
import { UploadCloud, File, AlertCircle, Files } from 'lucide-react';

export interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  isTransferring?: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFilesSelected,
  disabled = false,
  isTransferring = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || isTransferring) return;
    setDragCounter((prev) => prev + 1);
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const count = dragCounter - 1;
    setDragCounter(count);
    if (count <= 0) {
      setIsDragOver(false);
      setDragCounter(0);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isTransferring) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setDragCounter(0);

    if (disabled || isTransferring) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      onFilesSelected(files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      onFilesSelected(files);
      // Reset input value so same files can be selected again if needed
      e.target.value = '';
    }
  };

  const handleClick = () => {
    if (!disabled && !isTransferring && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div
      onClick={handleClick}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative w-full border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all duration-200 select-none cursor-pointer flex flex-col items-center justify-center min-h-[260px] ${
        disabled || isTransferring
          ? 'opacity-50 cursor-not-allowed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20'
          : isDragOver
          ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-100/70 dark:bg-zinc-800/40 scale-[1.01] shadow-md'
          : 'border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-zinc-500 dark:hover:border-zinc-700 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/90 shadow-xs'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        disabled={disabled || isTransferring}
        className="hidden"
      />

      {/* Center Icon */}
      <div
        className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all duration-200 ${
          isDragOver
            ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 scale-110 shadow-sm'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
        }`}
      >
        <UploadCloud className="w-8 h-8 transition-transform duration-200" />
      </div>

      {/* Main Text */}
      <div className="space-y-1 max-w-sm">
        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {isDragOver
            ? 'Drop file untuk mulai mengirim'
            : isTransferring
            ? 'Sedang mengirim antrean file...'
            : 'Pilih satu atau banyak foto / file'}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Streams chunk-by-chunk langsung antar-peer. Bisa pilih banyak foto sekaligus.
        </p>
      </div>

      {/* Badge Tags */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
          <Files className="w-3 h-3" />
          Multi-File / Foto
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
          <File className="w-3 h-3" />
          Semua Format
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
          64KB Chunks P2P
        </span>
      </div>

      {disabled && (
        <div className="mt-4 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle className="w-4 h-4" />
          <span>Hubungkan ke peer terlebih dahulu untuk mengirim file</span>
        </div>
      )}
    </div>
  );
};
