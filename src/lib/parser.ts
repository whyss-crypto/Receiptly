import { newId, type Confidence, type Receipt, type ReceiptItem } from '../types';
import { todayISO } from './format';
import {
  parseStructuredReceipt,
} from './ocr/parser';
import type { StructuredReceipt } from './ocr/types';
import { checkStructuredMath } from './ocr/validator';

/**
 * Heuristic receipt parser: raw OCR text -> structured Receipt draft.
 * Tolerates missing fields; never throws on unusual layouts.
 *
 * Implemented on top of the Puter OCR layer's structured parser
 * (`./ocr/parser.ts`) so both paths share one normalization core. The stored
 * `Receipt` shape is unchanged.
 */

export type { StructuredReceipt };
export { checkStructuredMath };

const CODE_TO_SYMBOL: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

export function symbolForCurrency(codeOrSymbol: string): string {
  if (!codeOrSymbol) return '₹';
  return CODE_TO_SYMBOL[codeOrSymbol.toUpperCase()] ?? codeOrSymbol;
}

/** Legacy symbol-style currency detection (kept for compatibility). */
export function detectCurrency(text: string): string {
  const m = text.match(/([₹$€£¥]|Rs\.?|INR|USD|EUR|GBP)\s?/i);
  if (!m) return '₹';
  const t = m[1].toLowerCase();
  if (t.startsWith('rs') || t === 'inr') return '₹';
  if (t === 'usd') return '$';
  if (t === 'eur') return '€';
  if (t === 'gbp') return '£';
  return m[1];
}

/** Legacy date detection over raw lines (kept for compatibility). */
export function detectDate(lines: string[]): string {
  const text = lines.join('\n');
  return parseStructuredReceipt(text).date;
}

function confidenceForItem(s: StructuredReceipt): Confidence {
  const c = s.confidence.items;
  if (c >= 80) return 'high';
  if (c >= 50) return 'medium';
  return 'low';
}

export interface ParseResult {
  draft: Omit<Receipt, 'id' | 'createdAt' | 'updatedAt' | 'imageId' | 'thumbnail'>;
  warnings: string[];
}

export function parseReceiptText(
  rawText: string,
  opts: { meanConfidence?: number | null; currencyHint?: string } = {},
): ParseResult {
  const text = (rawText || '').replace(/\r/g, '\n');
  const s = parseStructuredReceipt(text, { meanConfidence: opts.meanConfidence ?? null });
  return draftFromStructured(s, text, opts);
}

/** Map an already-parsed StructuredReceipt to an app Receipt draft. */
export function draftFromStructured(
  s: StructuredReceipt,
  rawText: string,
  opts: { meanConfidence?: number | null; currencyHint?: string } = {},
): ParseResult {

  const text = (rawText || '').replace(/\r/g, '\n');
  const warnings: string[] = [];
  const currency = opts.currencyHint || symbolForCurrency(s.currency);
  const meanOcr = opts.meanConfidence ?? null;

  // Tip has no slot in the normalized JSON — detect it here for the app draft.
  let tip: number | null = null;
  for (const line of text.split('\n')) {
    if (!/(\btip\b|gratuity|service\s+charge)/i.test(line)) continue;
    const m = line.replace(/\d[\d.,]*\s*%/g, ' ').match(/-?[\d][\d.,]*/g);
    if (!m) continue;
    for (let i = m.length - 1; i >= 0; i--) {
      const n = Number(m[i].replace(/,/g, ''));
      if (Number.isFinite(n)) {
        tip = Math.round(n * 100) / 100;
        break;
      }
    }
    if (tip !== null) break;
  }

  const itemConf = confidenceForItem(s);
  const items: ReceiptItem[] = s.items.map((it, idx) => ({
    id: newId('item'),
    name: it.name,
    quantity: it.quantity,
    unitPrice: it.unit_price,
    totalPrice: it.total,
    confidence: it.name.length < 3 ? 'low' : itemConf,
    sortOrder: idx,
  }));

  if (items.length === 0 && text.trim().length > 0) {
    warnings.push('Line items were hard to separate — totals were kept, add items by hand.');
  }
  if (s.grand_total === null) warnings.push('No receipt total detected — confirm the bottom of the photo.');
  if (meanOcr !== null && meanOcr < 55)
    warnings.push('Scan quality is low — expect a few misreads to fix.');
  const math = checkStructuredMath(s);
  if (math.status === 'needs-verification') warnings.push(math.detail);

  const needsReview = items.filter((i) => i.confidence === 'low').map((i) => i.id);

  return {
    draft: {
      merchant: s.merchant || 'Unknown store',
      date: s.date || todayISO(),
      currency,
      items,
      subtotal: s.subtotal,
      discount: s.discount,
      tax: s.tax,
      tip,
      total: s.grand_total,
      totalLocked: s.grand_total !== null,
      ocrRawText: text.slice(0, 20000),
      ocrMeanConfidence: meanOcr,
      needsReview,
    },
    warnings,
  };
}

export function blankReceipt(currency = '₹'): Omit<Receipt, 'id' | 'createdAt' | 'updatedAt' | 'imageId' | 'thumbnail'> {
  return {
    merchant: '',
    date: todayISO(),
    currency,
    items: [],
    subtotal: null,
    discount: null,
    tax: null,
    tip: null,
    total: null,
    totalLocked: false,
    ocrRawText: '',
    ocrMeanConfidence: null,
    needsReview: [],
  };
}
