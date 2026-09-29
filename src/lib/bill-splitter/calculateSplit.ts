/**
 * Deterministic equal-split engine. Integer minor-unit math only — no floats,
 * no AI. sum(shares) === total ALWAYS (see verifySplit).
 *
 * Algorithm: base = floor(total / n), rem = total % n. The FIRST `rem` people
 * each get exactly one extra minor unit. The remainder lives INSIDE the final
 * shares — it is never shown or charged separately.
 */
import { getCurrency } from './currencies';
import type { BillSplit, SplitPerson } from './types';

export function calculateSplit(
  totalMinor: number,
  currency: string,
  people: SplitPerson[],
): BillSplit {
  const meta = getCurrency(currency);
  if (!meta) throw new Error('unsupported-currency');
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 1) throw new Error('invalid-amount');
  if (!Array.isArray(people) || people.length < 2) throw new Error('not-enough-people');

  const n = people.length;
  const base = Math.floor(totalMinor / n);
  const rem = totalMinor % n;

  const shares = people.map((p, i) => {
    const extra = i < rem ? 1 : 0;
    return { id: p.id, name: p.name, amountMinor: base + extra, remainderMinor: extra };
  });

  return {
    totalMinor,
    currency: meta.code,
    decimals: meta.decimals,
    baseMinor: base,
    shares,
    remainderCount: rem,
  };
}

/** The invariant: individual shares MUST sum to the bill total. */
export function verifySplit(split: BillSplit): boolean {
  if (!split || !Array.isArray(split.shares) || split.shares.length < 2) return false;
  let sum = 0;
  for (const s of split.shares) {
    if (!Number.isSafeInteger(s.amountMinor) || s.amountMinor < 0) return false;
    sum += s.amountMinor;
    if (!Number.isSafeInteger(sum)) return false;
  }
  return sum === split.totalMinor;
}
