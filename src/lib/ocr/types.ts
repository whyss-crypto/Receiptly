/**
 * Shared OCR types (new Puter-based extraction layer).
 *
 * `StructuredReceipt` is the normalized JSON shape produced from raw OCR text.
 * The app's stored `Receipt` (src/types.ts) is intentionally unchanged — the
 * pipeline maps StructuredReceipt -> Receipt draft so history/DB stay intact.
 */

export type OcrStage = 'validating' | 'preparing' | 'recognizing' | 'parsing';

export interface OcrProgress {
  stage: OcrStage | 'loading' | 'recognizing' | 'parsing';
  /** 0..1 fraction when known, else null (never fake %). */
  fraction: number | null;
  status: string;
}

export type OcrProviderName =
  | 'puter-mistral'
  | 'puter-aws-textract'
  | 'tesseract-on-device';

export interface OcrResult {
  text: string;
  meanConfidence: number | null;
  provider: string;
  fallback: boolean;
}

export interface StructuredItem {
  name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax: number;
  total: number;
}

export interface StructuredConfidence {
  merchant: number;
  date: number;
  items: number;
  total: number;
}

/**
 * Normalized receipt JSON. Missing/unconfident fields are null/empty —
 * never hallucinated.
 */
export interface StructuredReceipt {
  merchant: string;
  address: string;
  phone: string;
  receipt_number: string;
  date: string; // ISO yyyy-mm-dd or ''
  time: string; // HH:MM or ''
  currency: string; // ISO code, default 'INR'
  items: StructuredItem[];
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  grand_total: number | null;
  payment_method: string;
  confidence: StructuredConfidence;
}

/** Result of the math check — display-only, never overwrites receipt totals. */
export interface MathCheck {
  /** Sum of item totals as printed. */
  itemsSum: number | null;
  /** subtotal + tax - discount recomputed from OCR fields. */
  computedGrandTotal: number | null;
  totalsAgree: boolean;
  itemLinesAgree: boolean;
  flags: string[]; // field names needing user verification, e.g. ['grand_total']
  status: 'verified' | 'needs-verification' | 'incomplete';
  detail: string; // human-readable line for the UI
}

export interface ScanResult {
  rawText: string;
  structured: StructuredReceipt;
  math: MathCheck;
  warnings: string[];
  provider: OcrProviderName;
  meanConfidence: number | null;
}

export function blankStructured(currency = 'INR'): StructuredReceipt {
  return {
    merchant: '',
    address: '',
    phone: '',
    receipt_number: '',
    date: '',
    time: '',
    currency,
    items: [],
    subtotal: null,
    discount: null,
    tax: null,
    grand_total: null,
    payment_method: '',
    confidence: { merchant: 0, date: 0, items: 0, total: 0 },
  };
}
