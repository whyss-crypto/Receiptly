import type { Receipt } from '../types';

export interface FieldIssue {
  field: string;
  message: string;
}

export function validateReceipt(r: Receipt): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (!r.merchant.trim()) issues.push({ field: 'merchant', message: 'Merchant name is empty.' });
  if (r.date && Number.isNaN(new Date(r.date + 'T12:00:00').getTime())) {
    issues.push({ field: 'date', message: 'Date is not valid.' });
  }
  r.items.forEach((it, i) => {
    const n = i + 1;
    if (!it.name.trim()) issues.push({ field: `items[${n}]`, message: `Item ${n} has no name.` });
    if (!(it.quantity > 0)) issues.push({ field: `items[${n}].qty`, message: `Item ${n} quantity should be positive.` });
    if (!(it.unitPrice >= 0) || Number.isNaN(it.unitPrice))
      issues.push({ field: `items[${n}].unit`, message: `Item ${n} unit price is not numeric.` });
    if (!(it.totalPrice >= 0) || Number.isNaN(it.totalPrice))
      issues.push({ field: `items[${n}].total`, message: `Item ${n} total is not numeric.` });
  });
  for (const k of ['subtotal', 'discount', 'tax', 'tip', 'total'] as const) {
    const v = r[k];
    if (v !== null && (Number.isNaN(v) || v < 0)) {
      issues.push({ field: k, message: `${k} should be a positive number or empty.` });
    }
  }
  return issues;
}

export function plausibleReceipt(r: Receipt): string[] {
  // Soft warnings — never hard-reject unusual receipts.
  const warns: string[] = [];
  if (r.items.length === 0) warns.push('No line items were found — you can add them by hand.');
  if (r.total === null && r.items.length > 0)
    warns.push('No receipt total detected — check the bottom of the photo.');
  return warns;
}
