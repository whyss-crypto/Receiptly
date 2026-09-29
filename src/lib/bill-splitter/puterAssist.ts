/**
 * Optional Puter assistance for the Bill Splitter. Rules:
 * - AI NEVER calculates: it only drafts inputs (NL -> intent) or words
 *   (payment message from already-calculated amounts).
 * - Every AI result is validated; anything off -> null -> local fallback.
 * - The splitter works fully offline; these are enhancements, not deps.
 */
import { loadPuterChat, type ChatFn } from '../ocr/puter';
import { formatMinor, getCurrency } from './currencies';
import type { BillSplit, ParsedSplitIntent } from './types';

async function defaultChat(prompt: string): Promise<unknown> {
  const p = await loadPuterChat();
  // Real network call: bound by a timeout so the UI can never hang forever.
  // Success/failure/timeout all flow to the same validated fallback path.
  return await withTimeout(p.ai.chat(prompt), PUTER_TIMEOUT_MS);
}

/** Race any promise against a timeout; rejects with 'puter-timeout'. Testable. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('puter-timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export const PUTER_TIMEOUT_MS = 30000;

/**
 * Pull plain text out of chat responses. Puter's chat() resolves to a
 * ChatResponse OBJECT ({ message: { content } }), where content may be a
 * string or a content-part array — not a bare string. Miss that and every
 * real AI reply extracts to "" and silently falls back (the "AI not working"
 * bug). Only known message keys are walked so random payload strings
 * (ids, model names) can never leak into a payment message.
 */
export function chatText(res: unknown): string {
  return textFromKnownKeys(res) ?? '';
}

function textFromKnownKeys(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() ? value : null;
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const p of value) {
      if (typeof p === 'string') {
        if (p.trim()) parts.push(p);
      } else if (p && typeof p === 'object') {
        const r = p as Record<string, unknown>;
        if (typeof r['text'] === 'string' && (r['text'] as string).trim()) {
          parts.push(r['text'] as string);
        }
      }
    }
    return parts.length > 0 ? parts.join('') : null;
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const k of ['message', 'content', 'text', 'result', 'output']) {
      const t = textFromKnownKeys(o[k]);
      if (t) return t;
    }
    const choices = o['choices'];
    if (Array.isArray(choices)) {
      for (const c of choices) {
        if (!c || typeof c !== 'object') continue;
        const t = textFromKnownKeys((c as Record<string, unknown>)['message'] ?? c);
        if (t) return t;
      }
    }
  }
  return null;
}

function extractJsonObject(text: string): unknown | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function sanitizeIntent(raw: unknown): ParsedSplitIntent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const amount = typeof o['amount'] === 'number' ? String(o['amount']) : typeof o['amount'] === 'string' ? o['amount'] : null;
  const currencyRaw = typeof o['currency'] === 'string' ? o['currency'].toUpperCase() : 'INR';
  const peopleRaw = Array.isArray(o['people']) ? o['people'] : null;
  if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return null;
  if (!getCurrency(currencyRaw)) return null;
  if (!peopleRaw || peopleRaw.length < 2 || peopleRaw.length > 50) return null;
  const people = peopleRaw
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.replace(/\s+/g, ' ').trim().slice(0, 40))
    .filter((p) => p.length > 0);
  if (people.length < 2) return null;
  return { amountMajor: amount, currency: currencyRaw, people };
}

/**
 * "Split 2400 between me, Arjun, Riya and Sam" -> { amount, currency, people }.
 * Returns null when Puter is unavailable or the response doesn't validate —
 * the caller then tries localParseSplitIntent, then the manual form.
 */
export async function parseSplitIntent(
  text: string,
  chat: ChatFn = defaultChat,
): Promise<ParsedSplitIntent | null> {
  if (!text.trim()) return null;
  try {
    const res = await chat(
      'Extract a bill-splitting request as JSON. Reply with ONLY a JSON object, no other text. ' +
        'Schema: {"amount": <positive number>, "currency": "<3-letter ISO code, default INR>", "people": ["name", ...at least 2]}. ' +
        'Split names on commas and the word "and". Keep names as written. ' +
        `Request: ${text.slice(0, 300)}`,
    );
    return sanitizeIntent(extractJsonObject(chatText(res)));
  } catch {
    return null;
  }
}

/** Deterministic local fallback for simple "split X between A, B and C" phrasing. */
export function localParseSplitIntent(text: string): ParsedSplitIntent | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  const amountMatch = t.replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  if (!amountMatch) return null;
  const currMatch = t.match(/\b(INR|USD|EUR|GBP|JPY|CNY|KRW|AUD|CAD|SGD|AED|SAR|CHF|SEK|NOK|DKK|NZD|HKD|BRL|MXN|ZAR)\b/i);
  const after = t.split(/between|among|b\/w/i)[1];
  if (!after) return null;
  const people = after
    .split(/,|\band\b|&|\+/i)
    .map((p) => p.replace(/\s+/g, ' ').trim().slice(0, 40))
    .filter((p) => p.length > 0 && !/^(everyone|all|us|them|guys)$/i.test(p));
  if (people.length < 2) return null;
  return {
    amountMajor: amountMatch[1],
    currency: (currMatch?.[1] ?? 'INR').toUpperCase(),
    people: people.slice(0, 50),
  };
}

export type AiFailureReason = 'auth' | 'unavailable' | 'timeout' | 'invalid';

export type AiMessageResult = { ok: true; message: string } | { ok: false; reason: AiFailureReason };

/** Classify a Puter/chat failure so the UI can offer the right recovery. */
export function classifyPuterError(err: unknown): AiFailureReason {
  if (err instanceof Error && err.message === 'puter-timeout') return 'timeout';
  const m = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  if (/auth|sign.?in|permission|unauthorized|forbidden|401|403/.test(m)) return 'auth';
  if (/unavailable|offline|network|fetch|load|cdn|script|aborted|socket|econn|enotfound|timeout/.test(m)) {
    return 'unavailable';
  }
  if (/rate|quota|limit|429|credit|billing|payment|overloaded|5\d\d/.test(m)) return 'unavailable';
  return 'invalid';
}

/**
 * Ask Puter for a short Gen-Z style payment nudge built from
 * ALREADY-CALCULATED amounts. Validates the reply echoes a real share;
 * otherwise returns { ok: false } and the UI uses the local template.
 * Amounts are never taken from the AI.
 */
export async function generatePaymentMessage(
  split: BillSplit,
  chat: ChatFn = defaultChat,
): Promise<AiMessageResult> {
  try {
    const lines = split.shares
      .map((s) => `${s.name}: ${formatMinor(s.amountMinor, split.currency)}`)
      .join(', ');
    const res = await chat(
      'Write ONE short Gen-Z group-chat style payment nudge (max 140 characters). ' +
        'Casual and playful, like texting friends — max one emoji, no hashtags, no preamble. ' +
        'Vibe like: "₹625 each, run it up 😭" — but with OUR numbers. ' +
        'Reply with ONLY the message text, no quotes. ' +
        'You MUST use these exact amounts, do not change, round, or rephrase any number: ' +
        `total ${formatMinor(split.totalMinor, split.currency)}; shares — ${lines}.`,
    );
    const msg = chatText(res).replace(/^["“”']+|["“”']+$/g, '').trim();
    if (!msg || msg.length > 280) return { ok: false, reason: 'invalid' };
    // Guard: the message must echo at least one real calculated share.
    const echoes = split.shares.some((s) => msg.includes(formatMinor(s.amountMinor, split.currency)));
    if (!echoes) return { ok: false, reason: 'invalid' };
    return { ok: true, message: msg };
  } catch (err) {
    return { ok: false, reason: classifyPuterError(err) };
  }
}
