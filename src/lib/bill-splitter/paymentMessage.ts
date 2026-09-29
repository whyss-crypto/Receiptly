/**
 * Payment messages. Local deterministic templates are the default; Puter may
 * supply an alternative message but MUST reuse the already-calculated amounts
 * (see puterAssist.ts). The remainder is already inside the shares, so no
 * message ever mentions a spare/extra/crumb amount.
 */
import { formatMinor } from './currencies';
import type { BillSplit } from './types';

export type Rand = () => number;

function pick<T>(arr: T[], rand: Rand): T {
  return arr[Math.floor(rand() * arr.length) % arr.length];
}

function joinAmounts(amounts: string[]): string {
  if (amounts.length === 1) return amounts[0];
  if (amounts.length === 2) return `${amounts[0]} and ${amounts[1]}`;
  return `${amounts.slice(0, -1).join(', ')}, and ${amounts[amounts.length - 1]}`;
}

/** Local fallback payment message — always available, even offline. */
export function buildLocalPaymentMessage(split: BillSplit, rand: Rand = Math.random): string {
  if (split.remainderCount === 0) {
    const share = formatMinor(split.baseMinor, split.currency);
    return pick(
      [
        `${share} each. Pay up and we're square.`,
        `Everyone owes ${share}. Send it, no excuses 😭`,
        `${share} a head. Run it up whenever.`,
      ],
      rand,
    );
  }
  const total = formatMinor(split.totalMinor, split.currency);
  const n = split.shares.length;
  const amounts = joinAmounts(split.shares.map((s) => formatMinor(s.amountMinor, split.currency)));
  return pick(
    [
      `${total} split ${n} ways. Shares are ${amounts} — send yours, we're locked in 🤝`,
      `${total} between ${n} people: ${amounts}. Pay your share and we're done.`,
    ],
    rand,
  );
}

/**
 * Itemized breakdown for the Copy button — final shares only, nothing else.
 *
 * Bill split: ₹53,321.00
 *
 * sum: ₹17,773.67
 * ayus: ₹17,773.67
 * k2: ₹17,773.66
 *
 * Total: ₹53,321.00
 */
export function buildCopyBreakdown(split: BillSplit): string {
  const lines = [
    `Bill split: ${formatMinor(split.totalMinor, split.currency)}`,
    '',
    ...split.shares.map((s) => `${s.name}: ${formatMinor(s.amountMinor, split.currency)}`),
    '',
    `Total: ${formatMinor(split.totalMinor, split.currency)}`,
  ];
  return lines.join('\n');
}
