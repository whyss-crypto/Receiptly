export type Confidence = 'high' | 'medium' | 'low';

export interface ReceiptItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  confidence: Confidence;
  sortOrder: number;
}

export interface Receipt {
  id: string;
  merchant: string;
  date: string; // ISO yyyy-mm-dd or ''
  currency: string; // symbol or code, e.g. '₹', '$', '€'
  items: ReceiptItem[];
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  tip: number | null;
  total: number | null;
  /** User overrode the total; never auto-overwrite while true */
  totalLocked: boolean;
  imageId: string | null; // key into image store
  thumbnail: string | null; // small dataURL for list rendering
  ocrRawText: string;
  ocrMeanConfidence: number | null;
  needsReview: string[]; // item ids flagged low confidence
  createdAt: string;
  updatedAt: string;
}

export type View = 'home' | 'scan' | 'review' | 'receipts' | 'settings' | 'split';

export interface Toast {
  id: string;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone: 'ok' | 'warn' | 'err';
}

export function newId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
