export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeIndex = Math.min(i, sizes.length - 1);

  return `${parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(dm))} ${sizes[safeIndex]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';

  const sec = Math.floor(seconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function truncateFileName(name: string, maxLength: number = 24): string {
  if (name.length <= maxLength) return name;

  const dotIndex = name.lastIndexOf('.');
  if (dotIndex > 0 && dotIndex > name.length - 8) {
    const ext = name.slice(dotIndex);
    const base = name.slice(0, dotIndex);
    const availableBaseLength = maxLength - ext.length - 3;
    if (availableBaseLength > 3) {
      return `${base.slice(0, availableBaseLength)}...${ext}`;
    }
  }

  return `${name.slice(0, maxLength - 3)}...`;
}

/**
 * Universal UUID generator that works in all browser contexts,
 * including insecure origins like HTTP on local Wi-Fi (where crypto.randomUUID is undefined).
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fall through to RFC4122 v4 fallback
    }
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Universally downloads or natively saves a file/photo to device storage.
 * On mobile devices (Android & iOS), uses Web Share API so the user can
 * "Save Image", "Save to Files", or choose their preferred app.
 * Falls back to direct anchor download for desktop browsers.
 */
export async function downloadOrShareFile(
  blob: Blob,
  fileName: string,
  mimeType?: string
): Promise<boolean> {
  const effectiveType = mimeType || blob.type || 'application/octet-stream';

  // 1. Try Native Mobile Web Share API
  try {
    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
      const file = new File([blob], fileName, { type: effectiveType });
      if (navigator.canShare({ files: [file] })) {
        console.log('[Download] Invoking native Web Share API for:', fileName);
        await navigator.share({
          files: [file],
          title: fileName,
        });
        return true;
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      // User tapped cancel on the share sheet, which is expected
      return true;
    }
    console.debug('[Download] Web Share API skipped/failed, falling back to download anchor:', err);
  }

  // 2. Direct Anchor Click Fallback (Works on Desktop & Android Chrome)
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = fileName;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, 1000);

    return true;
  } catch (err) {
    console.error('[Download] Anchor download failed:', err);
    return false;
  }
}
