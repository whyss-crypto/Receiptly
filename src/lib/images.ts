import { checkUploadFile } from './security';

/** Load a File/Blob into an HTMLImageElement (validates it is actually an image). */
export function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    const img = new Image();
    img.onload = () => {
      if (typeof src !== 'string') URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (typeof src !== 'string') URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as a photo.'));
    };
    img.src = url;
  });
}

export async function validateImageContent(file: File): Promise<{ width: number; height: number }> {
  const img = await loadImage(file);
  if (img.naturalWidth < 40 || img.naturalHeight < 40) {
    throw new Error('That photo is too small to read. Try a clearer shot.');
  }
  if (img.naturalWidth > 12000 || img.naturalHeight > 12000) {
    throw new Error('That photo is unusually large. Try a smaller file.');
  }
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/** EXIF-aware decode: honors orientation so rotated phone shots read upright. */
async function decodeOriented(file: File | Blob): Promise<HTMLImageElement> {
  try {
    if ('createImageBitmap' in window) {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bmp, 0, 0);
        bmp.close?.();
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        return await loadImage(dataUrl);
      }
      bmp.close?.();
    }
  } catch {
    // Fall through to plain decode — never fail the scan on orientation help.
  }
  return await loadImage(file);
}

async function drawCover(
  img: HTMLImageElement,
  maxDim: number,
  enhance: boolean,
  minDim = 0,
): Promise<HTMLCanvasElement> {
  // Upscale small shots (minDim) so text is large enough to read; downscale
  // huge ones (maxDim) to bound memory and the 10 MB provider limit.
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  let scale = 1;
  if (longest > maxDim) scale = maxDim / longest;
  else if (minDim > 0 && longest < minDim) scale = Math.min(2.5, minDim / longest);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');
  ctx.drawImage(img, 0, 0, w, h);
  if (enhance) {
    // Gentle paper-receipt enhancement: grayscale + contrast + slight brightness.
    // Original file is always preserved; this only affects the OCR pass.
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    const contrast = 1.18;
    const brightness = 12;
    for (let i = 0; i < px.length; i += 4) {
      const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      let v = (g - 128) * contrast + 128 + brightness;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(data, 0, 0);
  }
  return canvas;
}

/** Downscale + JPEG-encode for storage (keeps history light on mobile). */
export async function fileToStoredImage(file: File): Promise<{ full: string; thumb: string; width: number; height: number }> {
  const check = checkUploadFile(file);
  if (!check.ok) throw new Error(check.reason);
  // EXIF-aware like the OCR pass: the saved photo must match what was read,
  // or side-by-side verification shows a sideways slip next to upright data.
  const img = await decodeOriented(file);
  const fullCanvas = await drawCover(img, 1600, false);
  const thumbCanvas = await drawCover(img, 320, false);
  return {
    full: fullCanvas.toDataURL('image/jpeg', 0.82),
    thumb: thumbCanvas.toDataURL('image/jpeg', 0.7),
    width: fullCanvas.width,
    height: fullCanvas.height,
  };
}

/** Enhanced grayscale variant used only for the OCR pass. Never replaces original. */
export async function fileToOcrImage(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = await drawCover(img, 2000, true, 1200);
  return canvas.toDataURL('image/jpeg', 0.9);
}

/** Full client-side preprocessing for the Puter OCR pass. Returns a Blob. */
export async function preprocessForOcr(file: File): Promise<Blob> {
  const check = checkUploadFile(file);
  if (!check.ok) throw new Error(check.reason);
  const img = await decodeOriented(file);
  if (img.naturalWidth < 40 || img.naturalHeight < 40) {
    throw new Error('That photo is too small to read. Try a clearer shot.');
  }
  const canvas = await drawCover(img, 2000, true, 1200);
  // Step quality down until under the 10 MB provider cap (readable text survives).
  for (const q of [0.9, 0.82, 0.72, 0.6]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q));
    if (blob && blob.size <= 10 * 1024 * 1024) return blob;
    if (blob && q === 0.6) return blob;
  }
  throw new Error('ocr-too-large');
}
