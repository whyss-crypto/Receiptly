/**
 * Mathematical validation for structured receipts.
 *
 * - item total vs quantity × unit_price
 * - items sum vs OCR subtotal
 * - subtotal + tax − discount vs grand total
 * - Never overwrites the receipt's actual total: conflicts only FLAG fields.
 */
import type { MathCheck, StructuredReceipt } from './types';
import { formatMinor } from '../bill-splitter/currencies';

const TOL = 0.02; // 2-paise tolerance for rounding
const r2 = (n: number) => Math.round(n * 100) / 100;

function approx(a: number, b: number, tol = TOL): boolean {
  return Math.abs(a - b) <= tol;
}

export function checkStructuredMath(s: StructuredReceipt): MathCheck {
  const flags: string[] = [];

  // 1. Item lines: quantity × unit_price vs printed total.
  let itemLinesAgree = true;
  for (const it of s.items) {
    const expected = r2(it.quantity * it.unit_price);
    if (!approx(expected, it.total)) {
      itemLinesAgree = false;
      break;
    }
  }

  // 2. Items sum vs subtotal.
  const itemsSum = s.items.length ? r2(s.items.reduce((a, it) => a + it.total, 0)) : null;
  if (itemsSum !== null && s.subtotal !== null && !approx(itemsSum, s.subtotal)) {
    flags.push('subtotal');
  }

  // 3. Grand total: (subtotal ?? itemsSum) + tax − discount vs grand_total.
  const base = s.subtotal ?? itemsSum;
  const computedGrandTotal =
    base === null ? null : r2(base + (s.tax ?? 0) - (s.discount ?? 0));
  let totalsAgree = true;
  if (computedGrandTotal !== null && s.grand_total !== null) {
    totalsAgree = approx(computedGrandTotal, s.grand_total);
    if (!totalsAgree && !flags.includes('grand_total')) flags.push('grand_total');
  }

  // Status: verified only when a grand total exists AND there is an
  // independent recomputation to check it against. A lone total with no
  // items/subtotal is evidence of nothing — mark it incomplete instead.
  let status: MathCheck['status'];
  let detail: string;
  const money = (v: number) => formatMinor(v, s.currency);
  if (s.grand_total === null) {
    status = 'incomplete';
    detail = 'No receipt total detected — confirm the bottom of the photo.';
    if (!flags.includes('grand_total')) flags.push('grand_total');
  } else if (computedGrandTotal === null) {
    status = 'incomplete';
    detail = `Detected receipt total: ${money(s.grand_total)} — but no items or subtotal to check it against. Verify by hand.`;
    if (!flags.includes('grand_total')) flags.push('grand_total');
  } else if (totalsAgree && itemLinesAgree && flags.length === 0) {
    status = 'verified';
    detail = `Calculated total: ${money(computedGrandTotal)} · Detected receipt total: ${money(s.grand_total)} · Status: verified`;
  } else {
    status = 'needs-verification';
    const calc = computedGrandTotal !== null ? money(computedGrandTotal) : itemsSum !== null ? money(itemsSum) : 'unknown';
    detail = `Calculated total: ${calc} · Detected receipt total: ${money(s.grand_total)} · ⚠ Total needs verification`;
  }

  return { itemsSum, computedGrandTotal, totalsAgree, itemLinesAgree, flags, status, detail };
}

/** Field-level issues for display (soft warnings, never hard rejects). */
export function validateStructured(s: StructuredReceipt): Array<{ field: string; message: string }> {
  const issues: Array<{ field: string; message: string }> = [];
  if (!s.merchant.trim()) issues.push({ field: 'merchant', message: 'Merchant name is empty.' });
  if (s.date && Number.isNaN(new Date(s.date + 'T12:00:00').getTime())) {
    issues.push({ field: 'date', message: 'Date is not valid.' });
  }
  s.items.forEach((it, i) => {
    const n = i + 1;
    if (!it.name.trim()) issues.push({ field: `items[${n}]`, message: `Item ${n} has no name.` });
    if (!(it.quantity > 0)) issues.push({ field: `items[${n}].quantity`, message: `Item ${n} quantity should be positive.` });
    if (!(it.unit_price >= 0)) issues.push({ field: `items[${n}].unit_price`, message: `Item ${n} unit price is not numeric.` });
    if (!(it.total >= 0)) issues.push({ field: `items[${n}].total`, message: `Item ${n} total is not numeric.` });
  });
  for (const [k, v] of [['subtotal', s.subtotal], ['discount', s.discount], ['tax', s.tax], ['grand_total', s.grand_total]] as const) {
    if (v !== null && (Number.isNaN(v) || v < 0)) {
      issues.push({ field: k, message: `${k} should be a positive number or empty.` });
    }
  }
  return issues;
}
