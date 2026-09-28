// Browser-platform primitives — ported from legacy-vite-app/src/lib/platform.js
// near-verbatim (SPEC §10). Dropped: the window.claude artifact-viewer
// integration (getDownloads/isFramed's embedded-host branch) — this is a
// standalone Next.js app now, not hosted inside claude.ai's artifact
// viewer, so saveFile always takes the plain browser-download path.

export interface SaveFileResult {
  ok: boolean;
  declined?: boolean;
  message?: string;
}

/** Offers a file to the user as a browser download. */
export async function saveFile(filename: string, data: BlobPart, mime = 'text/plain'): Promise<SaveFileResult> {
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Downloads are not available in this view.' };
  }
}

/**
 * Calls window.print() and reports whether it plausibly opened. Some
 * browsers (notably inside a sandboxed iframe) silently refuse to open the
 * print dialog; there's no direct signal for that, so this combines the
 * `beforeprint` event with a timing heuristic: a dialog that genuinely
 * opened blocks the synchronous call long enough that even the fallback
 * timer fires late.
 */
export async function tryPrint(): Promise<boolean> {
  let fired = false;
  const onBeforePrint = () => {
    fired = true;
  };
  window.addEventListener('beforeprint', onBeforePrint);
  const started = Date.now();
  try {
    window.print();
  } catch {
    // Blocked entirely (e.g. a sandboxed iframe without allow-modals) — fall
    // through to the timing check below, which will read false.
  }
  await new Promise((resolve) => setTimeout(resolve, 350));
  window.removeEventListener('beforeprint', onBeforePrint);
  return fired || Date.now() - started > 600;
}

/** rows -> CSV text, Excel-friendly (UTF-8 BOM so ₱/ñ render correctly). */
export function toCSV(rows: unknown[][]): string {
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /["\r\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((row) => row.map(esc).join(',')).join('\r\n');
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Downscales (never upscales) an image file to at most maxSize on its
 * longest side and re-encodes it as a PNG data: URL — used for the receipt
 * logo, so it stays small enough to store as a plain column value. */
export function imageToDataUrl(file: File, maxSize = 360): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('That file is not an image this browser can read.'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('That file is not an image this browser can read.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
