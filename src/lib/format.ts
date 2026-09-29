/** Currency + number formatting helpers. */
import { getCurrency } from './bill-splitter/currencies';

const LOCALE_BY_SYMBOL: Record<string, string> = {
  '₹': 'en-IN',
  '$': 'en-US',
  '€': 'de-DE',
  '£': 'en-GB',
  '¥': 'ja-JP',
};

export function localeForCurrency(currency: string): string {
  if (!currency) return 'en-US';
  const meta = getCurrency(currencyToCode(currency));
  if (meta) return meta.locale;
  return LOCALE_BY_SYMBOL[currency] ?? 'en-US';
}

export function formatMoney(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const code = currencyToCode(currency);
  const meta = getCurrency(code);
  const decimals = meta?.decimals ?? 2;
  try {
    return new Intl.NumberFormat(meta?.locale ?? localeForCurrency(currency), {
      style: 'currency',
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return `${currency}${value.toFixed(decimals)}`;
  }
}

export function currencyToCode(symbolOrCode: string): string {
  const s = (symbolOrCode || '').trim();
  const map: Record<string, string> = {
    '₹': 'INR',
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY',
  };
  if (map[s]) return map[s];
  if (/^[A-Za-z]{3}$/.test(s)) return s.toUpperCase();
  return 'USD';
}

export function parseAmount(text: string): number | null {
  if (!text) return null;
  // Keep digits, dot, comma, minus. Handle "1,248.50" and "1.248,50".
  let t = text.replace(/[^0-9.,-]/g, '').trim();
  if (!t) return null;
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  if (lastComma > lastDot) {
    // European: dots are thousands, comma is decimal
    t = t.replace(/\./g, '').replace(',', '.');
  } else {
    t = t.replace(/,/g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function formatDateISO(iso: string): string {
  if (!iso) return 'No date';
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
