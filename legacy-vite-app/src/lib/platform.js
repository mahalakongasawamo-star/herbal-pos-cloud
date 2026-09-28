// Environment helpers. The app runs in three places:
//   1. inside the claude.ai artifact viewer (framed; files go through the
//      platform's `downloads` capability),
//   2. self-hosted / opened from disk (normal browser downloads + printing),
//   3. anywhere else, where saves may simply be unavailable.

let downloadsPromise = null;

/** Resolves the platform downloads namespace, or null when not in the viewer. */
export function getDownloads() {
  if (!downloadsPromise) {
    const c = typeof window !== 'undefined' ? window.claude : undefined;
    downloadsPromise =
      c && typeof c.use === 'function' ? Promise.resolve(c.use('downloads')).catch(() => null) : Promise.resolve(null);
  }
  return downloadsPromise;
}

export const isFramed = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

/**
 * Offer a file to the person. Returns { ok } or { ok:false, declined?, message }.
 * In the viewer the person confirms the save; elsewhere a normal download starts.
 */
export async function saveFile(filename, data, mime = 'text/plain') {
  const dl = await getDownloads();
  if (dl) {
    try {
      await dl.save({ filename, data });
      return { ok: true };
    } catch (e) {
      const code = e?.code || 'unavailable';
      if (code === 'declined') return { ok: false, declined: true };
      if (code === 'rate_limited') return { ok: false, message: 'A save prompt is already open. Finish that one first.' };
      if (code === 'too_large') return { ok: false, message: 'This file is too large to save here.' };
      if (!['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(code)) {
        return { ok: false, message: e?.message || 'The file could not be saved.' };
      }
      // otherwise fall through to a plain browser download
    }
  }
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { ok: true, fallback: isFramed() };
  } catch {
    return { ok: false, message: 'Downloads are not available in this view.' };
  }
}

/**
 * Opens the browser's print dialog. Resolves false when the browser refused to
 * open it (for example inside a sandboxed frame), so the caller can offer a
 * download instead.
 */
export function tryPrint() {
  return new Promise((resolve) => {
    let fired = false;
    const onBefore = () => {
      fired = true;
    };
    window.addEventListener('beforeprint', onBefore);
    const started = Date.now();
    try {
      window.print();
    } catch {
      // blocked
    }
    setTimeout(() => {
      window.removeEventListener('beforeprint', onBefore);
      resolve(fired || Date.now() - started > 600);
    }, 350);
  });
}

/** CSV with a BOM so Excel reads ₱ and ñ correctly. */
export function toCSV(rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

/** Reads a File as text. */
export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

/** Downscales an uploaded logo so it stays small in storage. */
export function imageToDataUrl(file, maxSize = 360) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image this browser can read.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(r.result);
    };
    r.readAsDataURL(file);
  });
}
