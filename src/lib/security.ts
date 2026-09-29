/** Security boundaries: file validation, text sanitization, safe ids. */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
export const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

export interface FileCheck {
  ok: boolean;
  reason?: string;
}

export function checkUploadFile(file: File): FileCheck {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_MIME.has(file.type) && !ALLOWED_EXT.has(ext)) {
    return {
      ok: false,
      reason: `“${file.name}” isn't a supported photo. Use JPG, PNG, or WEBP.`,
    };
  }
  if (file.size <= 0) {
    return { ok: false, reason: `“${file.name}” looks empty. Try another photo.` };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: `“${file.name}” is ${(file.size / 1048576).toFixed(1)} MB — the limit is 10 MB.`,
    };
  }
  return { ok: true };
}

/** Strip control chars + cap length for any user-controlled string before storage. */
export function cleanText(input: string, maxLen = 120): string {
  if (typeof input !== 'string') return '';
  // Remove C0/C1 controls except \n\t, collapse whitespace runs to single spaces.
  const s = input
    .replace(/[^\x09\x0A\x20-\uFFFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.slice(0, maxLen);
}

export function cleanSearch(input: string): string {
  return cleanText(input, 80);
}

/** Randomized, non-guessable storage keys for receipt images. */
export function randomImageKey(ext = 'jpg'): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `rcpt_${hex}.${ext}`;
}
