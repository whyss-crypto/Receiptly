/**
 * Currency metadata table. Add a row to support a new currency — no splitter
 * logic changes needed. Decimals drive minor-unit math AND formatting.
 */
import type { CurrencyMeta } from './types';

export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
  { code: 'INR', tag: '₹', name: 'Indian Rupee', decimals: 2, locale: 'en-IN' },
  { code: 'USD', tag: '$', name: 'US Dollar', decimals: 2, locale: 'en-US' },
  { code: 'EUR', tag: '€', name: 'Euro', decimals: 2, locale: 'de-DE' },
  { code: 'GBP', tag: '£', name: 'British Pound', decimals: 2, locale: 'en-GB' },
  { code: 'JPY', tag: '¥', name: 'Japanese Yen', decimals: 0, locale: 'ja-JP' },
  { code: 'CNY', tag: 'CN¥', name: 'Chinese Yuan', decimals: 2, locale: 'zh-CN' },
  { code: 'KRW', tag: '₩', name: 'South Korean Won', decimals: 0, locale: 'ko-KR' },
  { code: 'AUD', tag: 'A$', name: 'Australian Dollar', decimals: 2, locale: 'en-AU' },
  { code: 'CAD', tag: 'CA$', name: 'Canadian Dollar', decimals: 2, locale: 'en-CA' },
  { code: 'SGD', tag: 'S$', name: 'Singapore Dollar', decimals: 2, locale: 'en-SG' },
  { code: 'AED', tag: 'د.إ', name: 'UAE Dirham', decimals: 2, locale: 'ar-AE-u-nu-latn' },
  { code: 'SAR', tag: '﷼', name: 'Saudi Riyal', decimals: 2, locale: 'ar-SA-u-nu-latn' },
  { code: 'CHF', tag: 'Fr', name: 'Swiss Franc', decimals: 2, locale: 'de-CH' },
  { code: 'SEK', tag: 'kr', name: 'Swedish Krona', decimals: 2, locale: 'sv-SE' },
  { code: 'NOK', tag: 'kr', name: 'Norwegian Krone', decimals: 2, locale: 'nb-NO' },
  { code: 'DKK', tag: 'kr', name: 'Danish Krone', decimals: 2, locale: 'da-DK' },
  { code: 'NZD', tag: 'NZ$', name: 'New Zealand Dollar', decimals: 2, locale: 'en-NZ' },
  { code: 'HKD', tag: 'HK$', name: 'Hong Kong Dollar', decimals: 2, locale: 'zh-HK' },
  { code: 'BRL', tag: 'R$', name: 'Brazilian Real', decimals: 2, locale: 'pt-BR' },
  { code: 'MXN', tag: 'MX$', name: 'Mexican Peso', decimals: 2, locale: 'es-MX' },
  { code: 'ZAR', tag: 'R', name: 'South African Rand', decimals: 2, locale: 'en-ZA' },
];

const BY_CODE = new Map(SUPPORTED_CURRENCIES.map((c) => [c.code, c]));

/** Null when the ISO code is not supported (surfaced as a validation error). */
export function getCurrency(code: string): CurrencyMeta | null {
  if (!code) return null;
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

/** Largest splittable total in minor units (keeps everything integer-safe). */
export const MAX_SPLIT_MINOR = 1_000_000_000_000;

/**
 * Parse a typed major-unit amount into integer minor units WITHOUT floats.
 * "1,000.50" INR -> 100050. Rounds half-up when the user types more decimals
 * than the currency supports ("1000.5" JPY -> 1000). Null when not numeric.
 */
export function parseMajorToMinor(text: string, code: string): number | null {
  const meta = getCurrency(code);
  if (!meta) return null;
  let t = (text ?? '').trim().replace(/[\s,']/g, '');
  if (!t || t.includes('-')) return null; // negatives are a validation error, never a value
  t = t.replace(/^[^\d.]+/, ''); // tolerate a pasted leading symbol/code
  const m = t.match(/^(\d+)(?:\.(\d*))?$/);
  if (!m) return null;
  const intVal = Number(m[1]);
  if (!Number.isSafeInteger(intVal)) return null;
  const factor = 10 ** meta.decimals;
  let fracVal = 0;
  const frac = m[2] ?? '';
  if (meta.decimals > 0 && frac.length > 0) {
    const padded = (frac + '0'.repeat(meta.decimals + 1)).slice(0, meta.decimals + 1);
    const main = Number(padded.slice(0, meta.decimals));
    const extra = Number(padded[meta.decimals] ?? '0');
    if (!Number.isFinite(main) || !Number.isFinite(extra)) return null;
    fracVal = main + (extra >= 5 ? 1 : 0); // half-up; overflow carries into int below
  } else if (meta.decimals === 0 && frac.length > 0) {
    if (/^[5-9]/.test(frac)) fracVal = 1;
  }
  const minor = intVal * factor + fracVal;
  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * Format integer minor units for display. The true value is always an exact
 * multiple of the minor unit, so Intl's rounding to `decimals` recovers it
 * exactly — no float accumulation anywhere in the calculation path.
 */
export function formatMinor(minor: number, code: string): string {
  const meta = getCurrency(code);
  if (!meta) return `${minor}`;
  try {
    return new Intl.NumberFormat(meta.locale, {
      style: 'currency',
      currency: meta.code,
      minimumFractionDigits: meta.decimals,
      maximumFractionDigits: meta.decimals,
    }).format(minor / 10 ** meta.decimals);
  } catch {
    const factor = 10 ** meta.decimals;
    const abs = Math.abs(minor);
    const int = Math.floor(abs / factor).toString();
    const frac = meta.decimals > 0 ? '.' + (abs % factor).toString().padStart(meta.decimals, '0') : '';
    return `${minor < 0 ? '-' : ''}${meta.tag} ${int}${frac}`;
  }
}

/** Smallest-unit display, e.g. "₹0.01" / "¥1" — used for remainder badges. */
export function formatSingleUnit(code: string): string {
  return formatMinor(1, code);
}

/**
 * Canonical major-unit string for integer minor units ("10050" INR -> "100.50",
 * "101" JPY -> "101"). Used to re-normalize the amount field when the currency
 * changes, so the typed input and the calculated value can never disagree.
 */
export function minorToMajorString(minor: number, code: string): string | null {
  const meta = getCurrency(code);
  if (!meta || !Number.isSafeInteger(minor)) return null;
  if (meta.decimals === 0) return String(minor);
  const factor = 10 ** meta.decimals;
  const int = Math.floor(minor / factor);
  const frac = (minor % factor).toString().padStart(meta.decimals, '0').replace(/0+$/, '');
  return frac.length > 0 ? `${int}.${frac}` : `${int}`;
}
