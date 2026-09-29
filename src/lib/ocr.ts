/**
 * OCR provider abstraction (PRD §12).
 *
 * Presentation code should prefer `scanReceipt(file)` from `./ocr` — a single
 * abstraction over the whole pipeline. This module keeps the lower-level
 * `OcrProvider` + `recognizeReceipt` surface for compatibility.
 *
 * Provider chain (new):
 *  1. Puter Mistral   — puter.ai.img2txt(blob, { provider: 'mistral' })
 *  2. Puter Textract  — puter.ai.img2txt(blob, { provider: 'aws-textract' })
 *  3. Tesseract on-device — last resort when Puter is unreachable (offline),
 *     no API key needed. Auth/billing errors are never swallowed: they
 *     propagate so the UI can offer Puter sign-in.
 */

import { recognizeWithPuter } from './ocr/puter';

export interface OcrProgress {
  stage: 'loading' | 'validating' | 'preparing' | 'recognizing' | 'parsing';
  /** 0..1 fraction for the current stage when known, else null (no fake % — PRD §11). */
  fraction: number | null;
  status: string;
}

export interface OcrResult {
  text: string;
  meanConfidence: number | null;
  provider: string;
  fallback: boolean;
}

export interface OcrProvider {
  readonly name: string;
  recognize(imageDataUrl: string, onProgress: (p: OcrProgress) => void): Promise<OcrResult>;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const m = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!m) throw new Error('ocr-failed');
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] || 'image/jpeg' });
}

/** Puter chain adapter (Mistral primary, Textract fallback). */
export class PuterOcrProvider implements OcrProvider {
  readonly name = 'puter';
  async recognize(imageDataUrl: string, onProgress: (p: OcrProgress) => void): Promise<OcrResult> {
    onProgress({ stage: 'loading', fraction: null, status: 'Reading the receipt…' });
    const blob = dataUrlToBlob(imageDataUrl);
    return await recognizeWithPuter(blob, (p) =>
      onProgress({ stage: p.stage, fraction: p.fraction, status: p.status }),
    );
  }
}

async function loadTesseract(): Promise<typeof import('tesseract.js')> {
  return await import('tesseract.js');
}

export class TesseractOcrProvider implements OcrProvider {
  readonly name = 'tesseract-on-device';
  private langs = 'eng';

  async recognize(imageDataUrl: string, onProgress: (p: OcrProgress) => void): Promise<OcrResult> {
    onProgress({ stage: 'loading', fraction: null, status: 'Loading the reading engine…' });
    const T = await loadTesseract();
    onProgress({ stage: 'recognizing', fraction: null, status: 'Reading the receipt…' });
    const result = await T.recognize(imageDataUrl, this.langs, {
      logger: (m: { status?: string; progress?: number }) => {
        if (typeof m?.progress === 'number') {
          onProgress({
            stage: 'recognizing',
            fraction: Math.max(0, Math.min(1, m.progress)),
            status: m.status === 'recognizing text' ? 'Reading line items…' : 'Scanning receipt…',
          });
        }
      },
    });
    const text = result?.data?.text ?? '';
    const conf =
      typeof result?.data?.confidence === 'number' ? Math.round(result.data.confidence) : null;
    if (!text.trim()) throw new Error('empty-ocr');
    return { text, meanConfidence: conf, provider: this.name, fallback: true };
  }
}

/** Last-resort stub: never fake success — returns empty so UI shows honest retry/manual path. */
export class OfflineFallbackProvider implements OcrProvider {
  readonly name = 'offline-fallback';
  async recognize(_image: string, onProgress: (p: OcrProgress) => void): Promise<OcrResult> {
    onProgress({ stage: 'parsing', fraction: null, status: 'Preparing your expense…' });
    await new Promise((r) => setTimeout(r, 250));
    throw new Error('ocr-engine-unavailable');
  }
}

/**
 * Ordered provider chain: Puter (Mistral -> Textract) first, on-device
 * Tesseract only when Puter is unreachable, honest failure afterwards.
 */
export async function recognizeReceipt(
  imageDataUrl: string,
  onProgress: (p: OcrProgress) => void,
): Promise<OcrResult> {
  try {
    return await new PuterOcrProvider().recognize(imageDataUrl, onProgress);
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    // Offline / timed-out / CDN-blocked: Tesseract works without network.
    // Auth, billing, oversize, and empty-OCR errors propagate for dedicated UI handling.
    if (code === 'puter-unavailable' || code === 'ocr-offline' || code === 'ocr-timeout') {
      try {
        return await new TesseractOcrProvider().recognize(imageDataUrl, onProgress);
      } catch (tesseractErr) {
        if (tesseractErr instanceof Error && tesseractErr.message === 'empty-ocr') {
          throw tesseractErr;
        }
        // fall through to honest failure below
      }
      return await new OfflineFallbackProvider().recognize(imageDataUrl, onProgress);
    }
    throw err;
  }
}

/** UI stage copy for the polished processing state (PRD §11 — stages, no fake %). */
export const OCR_STAGE_COPY = [
  'Scanning receipt',
  'Reading line items',
  'Checking prices',
  'Preparing your expense',
] as const;
