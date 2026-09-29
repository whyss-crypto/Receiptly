/**
 * Bill Splitter core types. The calculation engine is UI-free and owns all
 * math; Puter/AI layers may only supply inputs or messages, never amounts.
 */

export type CurrencyCode = string;

export interface CurrencyMeta {
  code: string;
  /** Display tag in the selector (disambiguates shared symbols: CA$, A$…). */
  tag: string;
  name: string;
  /** Decimal places of the smallest unit (JPY/KRW: 0). */
  decimals: number;
  locale: string;
}

export interface SplitPerson {
  id: string;
  name: string;
}

export interface ShareResult {
  id: string;
  name: string;
  /** Final share in integer minor units (paise/cents/yen). */
  amountMinor: number;
  /** Extra minor units this person absorbed beyond the base share (0 or 1+). */
  remainderMinor: number;
}

export interface BillSplit {
  totalMinor: number;
  currency: string;
  decimals: number;
  /** Floor share every person pays before remainder distribution. */
  baseMinor: number;
  shares: ShareResult[];
  /** How many people absorbed one extra minor unit. */
  remainderCount: number;
}

export interface ParsedSplitIntent {
  /** Amount in major units as typed, e.g. "2400" or "99.50". */
  amountMajor: string;
  currency: CurrencyCode;
  people: string[];
}
