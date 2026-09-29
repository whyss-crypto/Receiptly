/**
 * Puter.js OCR providers.
 *
 * Primary:  puter.ai.img2txt(file, { provider: 'mistral' })
 * Fallback: puter.ai.img2txt(file, { provider: 'aws-textract' })
 *
 * No API keys are embedded (Puter is user-pays). The SDK is loaded from the
 * CDN script tag in index.html (window.puter); if that is unavailable (CDN
 * blocked) we dynamically import the bundled npm package as a fallback.
 * Nothing here invents an API-key backend or a PUTER_API_KEY env var.
 */
import type { OcrProgress, OcrProviderName, OcrResult } from './types';

type Img2TxtFn = (source: string | File | Blob, options?: Record<string, unknown>) => Promise<unknown>;

interface PuterLike {
  ai?: { img2txt?: Img2TxtFn };
  auth?: { signIn?: () => Promise<unknown> };
}

function asPuterLike(p: unknown): PuterLike | null {
  if (!p || typeof p !== 'object') return null;
  const ai = (p as { ai?: unknown }).ai;
  const img2txt =
    ai && typeof ai === 'object' ? (ai as { img2txt?: unknown }).img2txt : undefined;
  if (typeof img2txt !== 'function') return null;
  return p as PuterLike;
}

function windowPuter(): PuterLike | null {
  if (typeof window === 'undefined') return null;
  return asPuterLike((window as unknown as { puter?: unknown }).puter);
}

let cached: PuterLike | null = null;

export async function loadPuter(): Promise<PuterLike> {
  if (cached) return cached;
  const fromWindow = windowPuter();
  if (fromWindow) {
    cached = fromWindow;
    return cached;
  }
  // CDN blocked/unavailable — fall back to the bundled npm build.
  try {
    const mod = (await import('@heyputer/puter.js')) as unknown as {
      puter?: unknown;
      default?: unknown;
    };
    const p = asPuterLike(mod.puter ?? mod.default ?? mod);
    if (p) {
      cached = p;
      return p;
    }
  } catch {
    // fall through to the error below
  }
  throw new Error('puter-unavailable');
}

/** Prompt Puter sign-in (user-pays model). Called only from a user gesture. */
export async function signInWithPuter(): Promise<void> {
  const p = await loadPuter();
  if (!p.auth?.signIn) throw new Error('puter-unavailable');
  await p.auth.signIn();
}

export type ChatFn = (prompt: string, options?: Record<string, unknown>) => Promise<unknown>;

interface PuterChatLike {
  ai: { chat: ChatFn };
}

function asPuterChatLike(p: unknown): PuterChatLike | null {
  if (!p || typeof p !== 'object') return null;
  const ai = (p as { ai?: unknown }).ai;
  const chat = ai && typeof ai === 'object' ? (ai as { chat?: unknown }).chat : undefined;
  if (typeof chat !== 'function') return null;
  return p as PuterChatLike;
}

let cachedChat: PuterChatLike | null = null;

/** Same CDN-then-npm loading as OCR, but only requires ai.chat. */
export async function loadPuterChat(): Promise<PuterChatLike> {
  if (cachedChat) return cachedChat;
  if (typeof window !== 'undefined') {
    const fromWindow = asPuterChatLike((window as unknown as { puter?: unknown }).puter);
    if (fromWindow) {
      cachedChat = fromWindow;
      return cachedChat;
    }
  }
  try {
    const mod = (await import('@heyputer/puter.js')) as unknown as {
      puter?: unknown;
      default?: unknown;
    };
    const p = asPuterChatLike(mod.puter ?? mod.default ?? mod);
    if (p) {
      cachedChat = p;
      return p;
    }
  } catch {
    // fall through
  }
  throw new Error('puter-unavailable');
}

/** Extract plain text from whatever img2txt resolves to (string per docs). */
function toText(res: unknown): string {
  if (typeof res === 'string') return res;
  if (res && typeof res === 'object') {
    const o = res as Record<string, unknown>;
    for (const k of ['text', 'ocr_text', 'content', 'result']) {
      if (typeof o[k] === 'string' && (o[k] as string).trim()) return o[k] as string;
    }
    // Mistral-style pages array: [{ markdown / text }]
    const pages = o['pages'];
    if (Array.isArray(pages)) {
      const parts: string[] = [];
      for (const pg of pages) {
        if (typeof pg === 'string') parts.push(pg);
        else if (pg && typeof pg === 'object') {
          const r = pg as Record<string, unknown>;
          if (typeof r['markdown'] === 'string') parts.push(r['markdown'] as string);
          else if (typeof r['text'] === 'string') parts.push(r['text'] as string);
        }
      }
      if (parts.length) return parts.join('\n');
    }
  }
  return '';
}

function normalizeError(err: unknown): Error {
  if (err instanceof Error && err.message === 'ocr-timeout') return err;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const m = msg.toLowerCase();
  if (/auth|sign.?in|permission|401|403/.test(m)) return new Error('puter-auth-required');
  if (/rate|quota|limit|429|credit|payment/.test(m)) return new Error('puter-rate-limited');
  if (/too large|10mb|size|413/.test(m)) return new Error('ocr-too-large');
  if (/network|fetch|failed to fetch|offline|timeout|aborted/.test(m)) return new Error('ocr-offline');
  const e = err instanceof Error ? err : new Error('ocr-failed');
  // Preserve Puter's server message for the fallback decision, tag generically.
  (e as Error & { puterMessage?: string }).puterMessage = msg;
  return e;
}

/** Hard bound for one OCR request: image upload + model read. */
export const PUTER_OCR_TIMEOUT_MS = 90000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('ocr-timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

async function runPuterOcr(
  image: Blob,
  provider: 'mistral' | 'aws-textract',
  onProgress: (p: OcrProgress) => void,
): Promise<OcrResult> {
  const puter = await loadPuter();
  if (!puter.ai?.img2txt) throw new Error('puter-unavailable');
  onProgress({
    stage: 'recognizing',
    fraction: null,
    status: provider === 'mistral' ? 'Reading with Puter OCR…' : 'Retrying with Textract…',
  });
  let res: unknown;
  try {
    res = await withTimeout(puter.ai.img2txt(image, { provider }), PUTER_OCR_TIMEOUT_MS);
  } catch (err) {
    throw normalizeError(err);
  }
  const text = toText(res).replace(/\r/g, '\n');
  if (!text.trim()) throw new Error('empty-ocr');
  const name: OcrProviderName = provider === 'mistral' ? 'puter-mistral' : 'puter-aws-textract';
  return { text, meanConfidence: null, provider: name, fallback: provider !== 'mistral' };
}

export class PuterMistralProvider {
  readonly name: OcrProviderName = 'puter-mistral';
  constructor(private readonly blob: Blob) {}
  recognize(onProgress: (p: OcrProgress) => void): Promise<OcrResult> {
    return runPuterOcr(this.blob, 'mistral', onProgress);
  }
}

export class PuterAwsTextractProvider {
  readonly name: OcrProviderName = 'puter-aws-textract';
  constructor(private readonly blob: Blob) {}
  recognize(onProgress: (p: OcrProgress) => void): Promise<OcrResult> {
    return runPuterOcr(this.blob, 'aws-textract', onProgress);
  }
}

/**
 * Puter chain: Mistral primary -> AWS Textract fallback.
 * Auth/rate-limit/size errors are NOT swallowed into the next provider —
 * they are surfaced so the UI can offer sign-in / resize / retry.
 */
export async function recognizeWithPuter(
  image: Blob,
  onProgress: (p: OcrProgress) => void,
): Promise<OcrResult> {
  const primary = new PuterMistralProvider(image);
  try {
    return await primary.recognize(onProgress);
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (
      code === 'puter-auth-required' ||
      code === 'puter-rate-limited' ||
      code === 'ocr-too-large' ||
      code === 'puter-unavailable' ||
      code === 'ocr-offline' ||
      code === 'ocr-timeout'
    ) {
      throw err;
    }
    // Anything else (bad parse, empty, transient model error): try Textract once.
    const fallback = new PuterAwsTextractProvider(image);
    return await fallback.recognize(onProgress);
  }
}
