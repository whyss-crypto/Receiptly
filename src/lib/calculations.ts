/** Totals math. Never silently overwrites user-locked values — callers decide. */

export interface TotalsInput {
  itemsTotal: number;
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  tip: number | null;
  total: number | null;
}

export function sumItems(items: Array<{ quantity: number; totalPrice: number }>): number {
  return Math.round(items.reduce((a, it) => a + it.totalPrice, 0) * 100) / 100;
}

export function expectedTotal(t: TotalsInput): number | null {
  const base = t.subtotal ?? t.itemsTotal;
  if (base === null || base === undefined) return null;
  const d = t.discount ?? 0;
  const tax = t.tax ?? 0;
  const tip = t.tip ?? 0;
  return Math.round((base - d + tax + tip) * 100) / 100;
}

/** True when receipt total and computed total disagree beyond 1 cent tolerance (+ rounding). */
export function totalsMismatch(t: TotalsInput, tolerance = 0.02): { mismatch: boolean; computed: number | null } {
  const computed = expectedTotal(t);
  if (computed === null || t.total === null || t.total === undefined) {
    return { mismatch: false, computed };
  }
  return { mismatch: Math.abs(computed - t.total) > tolerance, computed };
}

export function itemTotalFor(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100;
}
