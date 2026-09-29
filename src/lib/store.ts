import type { Receipt } from '../types';

const KEY = 'receiptly.receipts.v1';

/** Local-first receipt store. Single-device; rows are never shared (PRD §57/§54). */

export function loadReceipts(): Receipt[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((r) => r && typeof r.id === 'string');
  } catch {
    return [];
  }
}

export function saveReceipts(list: Receipt[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded: drop thumbnails (images live in IndexedDB anyway) and retry once.
    try {
      const slim = list.map((r) => ({ ...r, thumbnail: null }));
      localStorage.setItem(KEY, JSON.stringify(slim));
    } catch {
      throw new Error('Device storage is full — delete an old receipt and try again.');
    }
  }
}

export function upsertReceipt(list: Receipt[], r: Receipt): Receipt[] {
  const i = list.findIndex((x) => x.id === r.id);
  if (i === -1) return [r, ...list];
  const next = [...list];
  next[i] = r;
  return next;
}
