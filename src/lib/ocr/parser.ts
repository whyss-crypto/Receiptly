/**
 * Structured receipt parser: raw OCR text -> StructuredReceipt JSON.
 *
 * Rules:
 * - Never hallucinate: unconfident fields are '' / null, never invented.
 * - Indian receipts first-class: GST/CGST/SGST/IGST, ₹/Rs/INR, DD/MM/YYYY,
 *   DD-MM-YYYY, UPI/cash/card payment hints.
 * - Totals: last "grand total"-style line wins when the total repeats;
 *   subtotal kept distinct; multiple tax lines summed (CGST+SGST) unless an
 *   explicit "total tax/GST" summary line exists.
 */
import { blankStructured, type StructuredItem, type StructuredReceipt } from './types';

const CURRENCY_RE = /([₹$€£¥]|Rs\.?|INR|USD|EUR|GBP)\s?/i;

const DATE_PATTERNS: RegExp[] = [
  /(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/, // yyyy-mm-dd
  /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/, // dd/mm/yyyy, dd-mm-yyyy
  /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{2,4})/i,
];

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const GRAND_TOTAL_KEYS = [
  /grand\s+total/i,
  /net\s+(amount|payable|total)/i,
  /amount\s+(due|payable|paid)/i,
  /balance\s+due/i,
  /\btotal\s+amount\b/i,
];
const TOTAL_KEYS = [/\btotal\b/i, ...GRAND_TOTAL_KEYS];
const SUBTOTAL_KEYS = [/sub\s?-?\s?total/i];
const TAX_COMPONENT_KEYS = [/\bcgst\b/i, /\bsgst\b/i, /\bigst\b/i, /\butgst\b/i, /\bcess\b/i];
const TAX_SUMMARY_KEYS = [/(total|tot)\s*(gst|tax|vat)/i, /(gst|tax|vat)\s*(total|tot)\b/i];
const TAX_KEYS = [
  /^\s*(tax|gst|vat|service\s+tax|cgst|sgst|igst|utgst|cess)\b/i,
  /\bgst\b/i,
  /\bvat\b/i,
  /\btax\b/i,
];
const DISCOUNT_KEYS = [/discount/i, /\bdisc\b(?!\s*claim)/i, /coupon/i, /promo/i, /savings?\b/i, /\bless\b/i, /scheme/i];
const PAYMENT_KEYS: Array<[RegExp, string]> = [
  [/\bupi\b/i, 'UPI'],
  [/\bcash\b/i, 'cash'],
  [/\bcredit\s*card\b/i, 'card'],
  [/\bdebit\s*card\b/i, 'card'],
  [/\bcard\b/i, 'card'],
  [/net\s*banking/i, 'netbanking'],
  [/\bwallet\b|paytm|phonepe|gpay|google\s*pay/i, 'wallet'],
];

const SKIP_NAME_LEADERS =
  /^(thank|thanks|visit|tel|phone|ph\b|address|receipt|invoice|cashier|counter|gstin|cin|fssai|bill\s*(no|date)|date|time|powered|terms|note|website|email|@|www\.|http|customer|powered by)/i;

/**
 * Lines that are never products: balances, policy/footer sentences,
 * contact & document metadata. Matched anywhere in the line (unlike the
 * leaders above) so "Previous Bal. : 0.00" and "...return within 3 working
 * days" can never become items.
 */
const NON_ITEM_KEYS = [
  /\bbal\b\.?/i, /\bbalance/i, /outstanding/i, /\b(opening|closing)\b/i,
  /\badvance\b/i, /on\s+account/i,
  /refund/i, /warranty/i, /guarantee/i, /polic(y|ies)/i,
  /\bterms?\b/i, /conditions?/i, /jurisdiction/i, /subject to/i, /e\s*&\s*o\.?e/i,
  /working days/i, /goods once sold/i, /no exchange/i,
  /helpline/i, /feedback/i, /rate us/i, /follow us/i,
  /thank/i, /visit again/i, /welcome/i,
  /wifi/i, /parking/i,
  /scheme/i, /lucky/i, /\bdraw\b/i, /prize/i, /winner/i,
  /cashier/i, /counter/i, /operator/i, /biller/i,
  /gstin/i, /\bcin\b/i, /fssai/i, /udyam/i, /pan\s*(no|number|#)/i,
  /powered/i, /software/i, /developed/i, /\bbilling\b/i,
  /\btel\b/i, /\bphone\b/i, /\bmobile\b/i, /\bcontact\b/i, /\bemail\b/i, /www\.|http|@/i,
  /address/i, /\bbill\b/i, /\binvoice\b/i, /\breceipt\b/i, /\btoken\b/i,
  /\bdate\b/i, /\btime\b/i,
];

export function detectCurrencyCode(text: string): string {
  // ¥ is ambiguous (JPY/CNY): explicit Chinese markers win, else JPY.
  if (/CNY|CN\s*¥|RMB|人民币|元/i.test(text)) return 'CNY';
  const m = text.match(CURRENCY_RE);
  if (!m) return 'INR';
  const t = m[1].toLowerCase();
  if (t.startsWith('rs') || t === 'inr' || t === '₹') return 'INR';
  if (t === '$' || t === 'usd') return 'USD';
  if (t === '€' || t === 'eur') return 'EUR';
  if (t === '£' || t === 'gbp') return 'GBP';
  if (t === '¥') return 'JPY';
  return 'INR';
}

function normalizeDate(y: number, m: number, d: number): string | null {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function detectDate(lines: string[]): string {
  // Prefer the top of the receipt, but long receipts sometimes print the
  // date at the bottom — scan all lines, top first.
  const ordered = [...lines.slice(0, 20), ...lines.slice(20)];
  for (const line of ordered) {
    // Skip GSTIN-only / amount-only lines that happen to contain slashes.
    for (const re of DATE_PATTERNS) {
      const m = line.match(re);
      if (!m) continue;
      try {
        if (re === DATE_PATTERNS[0]) {
          const v = normalizeDate(Number(m[1]), Number(m[2]), Number(m[3]));
          if (v) return v;
        } else if (re === DATE_PATTERNS[1]) {
          const year = Number(m[3].length === 2 ? '20' + m[3] : m[3]);
          const na = Number(m[1]);
          const nb = Number(m[2]);
          let day = na;
          let mon = nb;
          if (na > 12) {
            day = na;
            mon = nb;
          } else if (nb > 12) {
            mon = na;
            day = nb;
          }
          // Day-first default (DD/MM — India + most of the world).
          const v = normalizeDate(year, mon, day);
          if (v) return v;
        } else {
          const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
          const year = m[3].length === 2 ? Number('20' + m[3]) : Number(m[3]);
          if (mon) {
            const v = normalizeDate(year, Number(mon), Number(m[1]));
            if (v) return v;
          }
        }
      } catch {
        continue;
      }
    }
  }
  return '';
}

export function detectTime(lines: string[]): string {
  for (const line of lines) {
    if (!/(time|at\b|:)/i.test(line)) continue;
    const m = line.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)(?::([0-5]\d))?\s*([AaPp][Mm])?\b/);
    if (!m) continue;
    let h = Number(m[1]);
    const ap = m[4]?.toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    if (h > 23) continue;
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  }
  // Fallback: bare HH:MM anywhere (receipts often print "12:45 PM" alone).
  for (const line of lines) {
    const m = line.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*([AaPp][Mm])?\b/);
    if (!m) continue;
    let h = Number(m[1]);
    const ap = m[3]?.toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  }
  return '';
}

export function detectPhone(text: string): string {
  // Labeled first: Tel / Ph / Mobile / Contact.
  const labeled = text.match(/(?:tel|tele|ph|phone|mobile|contact|call)[.:\s]*(\+?91[\s-]?)?([6-9]\d{9}|\d{3,5}[\s-]\d{5,8})/i);
  if (labeled) return labeled[0].replace(/^(tel|tele|ph|phone|mobile|contact|call)[.:\s]*/i, '').trim();
  const m = text.match(/(\+91[\s-]?)?[6-9]\d{9}\b/);
  return m ? m[0].trim() : '';
}

export function detectReceiptNumber(lines: string[]): string {
  for (const line of lines) {
    const m = line.match(
      /(?:bill|receipt|invoice|cash\s*memo|order|token|tran(?:saction)?(?:\s*id)?|ref(?:erence)?(?:\s*no)?)\s*(?:no|number|num|#|:)?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9\-/]{1,24})/i,
    );
    if (m && !/^(date|time|total|tax|gst|amount)$/i.test(m[1])) return m[1].trim();
  }
  return '';
}

export function detectAddress(lines: string[]): string {
  for (const line of lines.slice(1, 8)) {
    if (
      /\b(road|rd|street|st\.|avenue|ave|nagar|layout|area|sector|plot|shop|floor|market|marg|lane|colony|phase|block|building|complex|mall)\b/i.test(line) ||
      /^\s*(address|add)\s*[:.]/i.test(line) ||
      /\b\d{6}\b/.test(line) // PIN code
    ) {
      const c = line.replace(/^\s*(address|add)\s*[:.]\s*/i, '').trim();
      if (c.length >= 4) return c.slice(0, 120);
    }
  }
  return '';
}

export function detectPaymentMethod(text: string): string {
  for (const [re, v] of PAYMENT_KEYS) {
    if (re.test(text)) return v;
  }
  return '';
}

export function parseAmount(text: string): number | null {
  if (!text) return null;
  let t = text.replace(/[^0-9.,-]/g, '').trim();
  if (!t) return null;
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  if (lastComma > lastDot) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else {
    t = t.replace(/,/g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Last amount on the line; strips percentages (GST rates) first. */
function lineAmount(line: string): number | null {
  const stripped = line.replace(/\d[\d.,]*\s*%/g, ' ');
  const matches = stripped.match(/-?[\d][\d.,]*\s*(?:[₹$€£¥])?/g);
  if (!matches) return null;
  for (let i = matches.length - 1; i >= 0; i--) {
    const v = parseAmount(matches[i]);
    if (v !== null) return v;
  }
  return null;
}

function isTotalsLine(line: string): boolean {
  return [...TOTAL_KEYS, ...SUBTOTAL_KEYS, ...TAX_KEYS, ...DISCOUNT_KEYS, ...NON_ITEM_KEYS, /payment|tender|change|cash|upi|card/i].some(
    (re) => re.test(line),
  );
}

interface ParsedLine {
  name: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
}

function cleanName(s: string): string {
  return s
    .replace(/[^\x09\x0A\x20-\uFFFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** Product names need real words: 2+ consecutive letters. Kills numeric junk. */
function hasProductName(name: string): boolean {
  return /[A-Za-z]{2,}/.test(name);
}

/** Strip isolated "I" tokens left by OCR pipe/table separators ("I Phone" -> "Phone"). */
function stripPipeArtifacts(name: string): string {
  return name
    .replace(/^I\s+/g, '')
    .replace(/\s+I$/g, '')
    .replace(/\s+I\s+/g, ' ')
    .trim();
}

function parseItemLine(line: string): ParsedLine | null {
  const raw = line.trim();
  if (raw.length < 2 || isTotalsLine(raw)) return null;

  let m = raw.match(/^(.+?)\s+(\d{1,3})\s*[x×]\s*([\d.,]+)(?:\s+([\d.,]+))?\s*$/) as RegExpMatchArray | null;
  if (m) {
    const qty = Number(m[2]);
    const first = parseAmount(m[3]);
    const second = m[4] ? parseAmount(m[4]) : null;
    const total = second ?? first;
    const unit = second !== null && first !== null ? first : null;
    if (total === null) return null;
    const name = stripPipeArtifacts(cleanName(m[1].replace(/^[\d).\-*\s]+/, '')));
    if (name.length < 2 || !hasProductName(name) || SKIP_NAME_LEADERS.test(name)) return null;
    return { name, quantity: qty, unitPrice: unit, totalPrice: total };
  }

  m = raw.match(/^(.+?)\s+(\d{1,3})\s*@\s*([\d.,]+)\s*$/) as RegExpMatchArray | null;
  if (m) {
    const qty = Number(m[2]);
    const unit = parseAmount(m[3]);
    if (unit === null) return null;
    const name = stripPipeArtifacts(cleanName(m[1]));
    if (name.length < 2 || !hasProductName(name) || SKIP_NAME_LEADERS.test(name)) return null;
    return { name, quantity: qty, unitPrice: unit, totalPrice: Math.round(qty * unit * 100) / 100 };
  }

  let qty = 1;
  let rest = raw;
  m = rest.match(/^(\d{1,3})\s*[x×*]\s+(.+)$/i) as RegExpMatchArray | null;
  if (m) {
    qty = Number(m[1]);
    rest = m[2];
  } else {
    m = rest.match(/^(.+?)\s+[x×]\s*(\d{1,3})\s*$/) as RegExpMatchArray | null;
    if (m) {
      qty = Number(m[2]);
      rest = m[1];
    }
  }
  // The price must CLOSE the line: "…within 3 working days" is a sentence,
  // not a product. Metadata lines ("Bal. :", "GSTIN:", "Date:") carry colons;
  // products don't. Zero-amount fallbacks are balance/tender metadata, not
  // products. A bare 6+ digit integer with no decimals/commas/currency is a
  // PIN or bill run ("Mumbai 400053") — but "Laptop 100000.00" is a price,
  // so only the bare-integer form is rejected.
  if (!/-?[\d][\d.,]*\s*(?:[₹$€£¥]|Rs\.?)?\s*$/.test(rest)) return null;
  if (rest.includes(':')) return null;
  if (/\b\d{6,}\s*$/.test(rest.replace(/[₹$€£¥]|Rs\.?\s*$/i, ''))) return null;
  const amount = lineAmount(rest);
  if (amount === null || amount === 0) return null;
  let name = rest.replace(/[\s.:—-]*-?[\d][\d.,]*\s*(?:[₹$€£¥]|Rs\.?)?\s*$/i, '').trim();
  name = name.replace(/^[\d).\-*\s]+/, '').trim();
  name = stripPipeArtifacts(cleanName(name));
  if (name.length < 2 || !hasProductName(name) || SKIP_NAME_LEADERS.test(name)) return null;
  return { name, quantity: qty, unitPrice: null, totalPrice: amount };
}

/** Parse raw OCR text into the normalized StructuredReceipt JSON. */
export function parseStructuredReceipt(
  rawText: string,
  opts: { meanConfidence?: number | null } = {},
): StructuredReceipt {
  const out = blankStructured();
  const text = (rawText || '').replace(/\r/g, '\n');
  if (!text.trim()) return out;

  const lines = text
    .split('\n')
    // Pipes are table separators in OCR output, not the letter I.
    .map((l) => l.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);

  out.currency = detectCurrencyCode(text);
  out.date = detectDate(lines);
  out.time = detectTime(lines);
  out.phone = detectPhone(text).slice(0, 20);
  out.receipt_number = detectReceiptNumber(lines);
  out.address = detectAddress(lines);
  out.payment_method = detectPaymentMethod(text);

  // Merchant: first substantial top line that isn't a receipt keyword.
  // Requires real alphanumerics so OCR noise ("???", "***") never becomes a name.
  for (const line of lines.slice(0, 6)) {
    const c = cleanName(line.replace(/[#*_=~<>]+/g, ''));
    if (
      c.length >= 3 &&
      /[A-Za-z0-9].*[A-Za-z0-9]/.test(c) &&
      !/^(receipt|invoice|tax\s+invoice|bill|cash\s+memo|gst|date)/i.test(c)
    ) {
      out.merchant = c.slice(0, 60);
      break;
    }
  }

  // ---- Totals: collect every candidate, last grand-total-style line wins.
  let subtotal: number | null = null;
  let discountSum = 0;
  let hasDiscount = false;
  let total: number | null = null;
  let lastGrand: number | null = null;
  const taxComponents: number[] = [];
  let taxSummary: number | null = null;

  for (const line of lines) {
    const amt = lineAmount(line);
    if (amt === null) continue;
    if (SUBTOTAL_KEYS.some((re) => re.test(line))) {
      if (subtotal === null) subtotal = amt;
      continue;
    }
    if (DISCOUNT_KEYS.some((re) => re.test(line))) {
      discountSum = Math.round((discountSum + Math.abs(amt)) * 100) / 100;
      hasDiscount = true;
      continue;
    }
    if (TAX_SUMMARY_KEYS.some((re) => re.test(line))) {
      if (taxSummary === null) taxSummary = amt;
      continue;
    }
    if (TAX_COMPONENT_KEYS.some((re) => re.test(line)) || TAX_KEYS.some((re) => re.test(line))) {
      taxComponents.push(amt);
      continue;
    }
    if (GRAND_TOTAL_KEYS.some((re) => re.test(line))) {
      lastGrand = amt; // keep scanning — the LAST grand total on the slip wins
      continue;
    }
    if (/\btotal\b/i.test(line)) {
      total = amt; // bare "Total" — may be overwritten by a later grand total
    }
  }
  if (lastGrand !== null) total = lastGrand;
  out.subtotal = subtotal;
  out.discount = hasDiscount ? discountSum : null;
  out.tax =
    taxSummary !== null
      ? taxSummary
      : taxComponents.length
        ? Math.round(taxComponents.reduce((a, b) => a + b, 0) * 100) / 100
        : null;
  out.grand_total = total;

  // ---- Items.
  const items: StructuredItem[] = [];
  for (const line of lines) {
    if (items.length >= 80) break;
    const p = parseItemLine(line);
    if (!p || p.totalPrice === null) continue;
    const unit =
      p.unitPrice ?? (p.quantity > 0 ? Math.round((p.totalPrice / p.quantity) * 100) / 100 : p.totalPrice);
    items.push({ name: p.name, quantity: p.quantity, unit_price: unit, discount: 0, tax: 0, total: p.totalPrice });
  }
  out.items = items;

  // ---- Confidence (0..100, honest: 0 when the field is missing).
  const mean = opts.meanConfidence ?? null;
  const ocrBase = mean === null ? 60 : Math.max(0, Math.min(100, mean));
  out.confidence = {
    merchant: out.merchant ? Math.min(100, Math.round(ocrBase * (out.merchant.length >= 4 ? 1 : 0.6))) : 0,
    date: out.date ? Math.min(100, Math.round(ocrBase)) : 0,
    items:
      items.length === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              100,
              Math.round(ocrBase - (items.some((i) => i.name.length < 3 || /[0-9]{4,}/.test(i.name)) ? 20 : 0)),
            ),
          ),
    total: out.grand_total !== null ? Math.min(100, Math.round(ocrBase)) : 0,
  };
  return out;
}
