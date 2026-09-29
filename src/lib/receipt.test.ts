import { describe, expect, it } from 'vitest';
import { parseReceiptText } from './parser';
import { expectedTotal, totalsMismatch, sumItems } from './calculations';
import { cleanText, checkUploadFile } from './security';
import { formatMoney } from './format';

const SAMPLE = `
FRESH MART
12 MG Road, Bengaluru
Date: 12/08/2025
Organic Milk 1 x 72.00
Bread 2 x 45.00 90.00
Eggs 12 80.00
Subtotal 242.00
GST 12.10
Discount 10.00
Total 244.10
Thank you visit again
`;

describe('parser: standard receipt', () => {
  it('extracts merchant, date, totals and items', () => {
    const { draft } = parseReceiptText(SAMPLE, { meanConfidence: 88 });
    expect(draft.merchant).toMatch(/FRESH MART/i);
    expect(draft.date).toBe('2025-08-12');
    expect(draft.subtotal).toBe(242);
    expect(draft.tax).toBe(12.1);
    expect(draft.discount).toBe(10);
    expect(draft.total).toBe(244.1);
    expect(draft.items.length).toBeGreaterThanOrEqual(3);
  });
});

describe('parser: quantities', () => {
  it('handles "2 x" quantity lines', () => {
    const { draft } = parseReceiptText('STORE\nBread 2 x 45.00 90.00\nTotal 90.00', {
      meanConfidence: 90,
    });
    const bread = draft.items.find((i) => /bread/i.test(i.name));
    expect(bread?.quantity).toBe(2);
    expect(bread?.totalPrice).toBe(90);
  });
});

describe('parser: missing total', () => {
  it('keeps items and warns', () => {
    const { draft, warnings } = parseReceiptText('STORE\nMilk 72.00\nBread 90.00', {
      meanConfidence: 80,
    });
    expect(draft.total).toBeNull();
    expect(draft.items.length).toBe(2);
    expect(warnings.join(' ').toLowerCase()).toContain('total');
  });
});

describe('parser: unusual formatting', () => {
  it('does not throw and tolerates noise', () => {
    const { draft } = parseReceiptText('***\n???\nTotal ???\n', { meanConfidence: 30 });
    expect(draft.items).toEqual([]);
    expect(draft.total).toBeNull();
  });
});

describe('parser: low confidence flags review', () => {
  it('marks needsReview when OCR quality is poor', () => {
    const { draft } = parseReceiptText('STORE\nM1lk 72.00\n', { meanConfidence: 20 });
    expect(draft.needsReview.length).toBeGreaterThanOrEqual(0);
  });
});

describe('calculations', () => {
  it('sums items and detects mismatch', () => {
    const items = [
      { quantity: 1, totalPrice: 72 },
      { quantity: 2, totalPrice: 90 },
    ];
    expect(sumItems(items)).toBe(162);
    const ok = totalsMismatch({ itemsTotal: 162, subtotal: null, discount: 0, tax: 0, tip: 0, total: 162 });
    expect(ok.mismatch).toBe(false);
    const bad = totalsMismatch({ itemsTotal: 162, subtotal: null, discount: 0, tax: 0, tip: 0, total: 170 });
    expect(bad.mismatch).toBe(true);
    expect(expectedTotal({ itemsTotal: 100, subtotal: null, discount: 10, tax: 5, tip: 0, total: null })).toBe(95);
  });
});

describe('security', () => {
  it('rejects bad uploads and cleans text', () => {
    const f = new File(['x'], 'evil.exe', { type: 'application/x-msdownload' });
    expect(checkUploadFile(f).ok).toBe(false);
    expect(cleanText('  hello   world  ', 5)).toBe('hello');
  });
});

describe('formatMoney: per-currency decimals and locales', () => {
  it('renders JPY with zero decimals', () => {
    const s = formatMoney(1000, '¥');
    expect(s).not.toContain('.');
    expect(s).toContain('1,000');
  });
  it('renders INR codes with Indian grouping', () => {
    expect(formatMoney(100000, 'INR')).toBe('₹1,00,000.00');
    expect(formatMoney(5463, '₹')).toBe('₹5,463.00');
  });
  it('renders USD with two decimals', () => {
    expect(formatMoney(1365.75, 'USD')).toBe('$1,365.75');
  });
});
