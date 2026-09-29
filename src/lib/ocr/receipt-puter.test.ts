import { describe, expect, it } from 'vitest';
import { parseStructuredReceipt } from './parser';
import { checkStructuredMath, validateStructured } from './validator';

const GST_SAMPLE = `
SHARMA GENERAL STORE
14 Main Road, Andheri West, Mumbai 400053
Tel: 98200 12345
Bill No: A-1024 Date: 15-08-2025 Time: 14:32
Rice 1kg 2 x 120.00 240.00
Sugar 1kg 45.00
Subtotal 285.00
CGST @ 2.5% 7.13
SGST @ 2.5% 7.13
Discount 10.00
Grand Total 289.26
UPI Paid - Thank you visit again
`;

describe('ocr/parser: Indian GST receipt', () => {
  it('extracts merchant, address, phone, bill no, date, time, payment', () => {
    const s = parseStructuredReceipt(GST_SAMPLE, { meanConfidence: 90 });
    expect(s.merchant).toMatch(/SHARMA/i);
    expect(s.address).toContain('Andheri');
    expect(s.phone).toContain('98200');
    expect(s.receipt_number).toBe('A-1024');
    expect(s.date).toBe('2025-08-15');
    expect(s.time).toBe('14:32');
    expect(s.currency).toBe('INR');
    expect(s.payment_method).toBe('UPI');
  });

  it('sums CGST+SGST and keeps subtotal distinct from grand total', () => {
    const s = parseStructuredReceipt(GST_SAMPLE, { meanConfidence: 90 });
    expect(s.subtotal).toBe(285);
    expect(s.tax).toBeCloseTo(14.26, 2);
    expect(s.discount).toBe(10);
    expect(s.grand_total).toBe(289.26);
    expect(s.items.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ocr/parser: DD/MM/YYYY and repeated totals', () => {
  it('parses slashed dates and lets the last grand total win', () => {
    const s = parseStructuredReceipt(
      'STORE\nDate 12/08/2025\nMilk 72.00\nTotal 72.00\nGST Summary Total 72.00\nGrand Total 72.00\n',
      { meanConfidence: 85 },
    );
    expect(s.date).toBe('2025-08-12');
    expect(s.grand_total).toBe(72);
  });
});

describe('ocr/parser: no hallucination', () => {
  it('returns empty/null for blank or unparsable input', () => {
    const s = parseStructuredReceipt('   \n???\n', {});
    expect(s.merchant).toBe('');
    expect(s.date).toBe('');
    expect(s.grand_total).toBeNull();
    expect(s.items).toEqual([]);
    expect(s.confidence.total).toBe(0);
    expect(validateStructured(s).some((i) => i.field === 'merchant')).toBe(true);
  });
});

describe('ocr/parser: products only (no balance/policy/metadata items)', () => {
  it('drops balance lines', () => {
    const s = parseStructuredReceipt(
      'NAWAZ CORPORATION\nPrevious Bal. : 0.00\nCurrent Bal. : 0.00\nGrand Total 5200.00\n',
      { meanConfidence: 85 },
    );
    expect(s.items).toEqual([]);
    expect(s.grand_total).toBe(5200);
  });

  it('drops pipe-separated balance lines as OCR emits them', () => {
    const s = parseStructuredReceipt(
      'STORE\n| Previous Bal. | : | 0.00 |\n| Current Bal. | : | 0.00 |\nTotal 100.00\n',
      { meanConfidence: 85 },
    );
    expect(s.items).toEqual([]);
  });

  it('drops policy/footer sentences', () => {
    const s = parseStructuredReceipt(
      'STORE\nPaper products are non-refundable.\nPurchased items can be return within 3 working days.\nMilk 72.00\nTotal 72.00\n',
      { meanConfidence: 85 },
    );
    expect(s.items.map((i) => i.name)).toEqual(['Milk']);
  });

  it('drops metadata lines with mid-line numbers', () => {
    const s = parseStructuredReceipt(
      'STORE\nDate: 12/08/2025\nBill No: A-1024\nGSTIN: 27ABCDE1234F1Z5\nTel: 98200 12345\n14 Main Road, Mumbai 400053\nBread 90.00\nTotal 90.00\n',
      { meanConfidence: 85 },
    );
    expect(s.items.map((i) => i.name)).toEqual(['Bread']);
    expect(s.date).toBe('2025-08-12');
  });

  it('drops zero-amount fallback lines', () => {
    const s = parseStructuredReceipt('STORE\nFree Sample 0.00\nMilk 72.00\nTotal 72.00\n', {
      meanConfidence: 85,
    });
    expect(s.items.map((i) => i.name)).toEqual(['Milk']);
  });

  it('keeps only real products in a mixed receipt', () => {
    const s = parseStructuredReceipt(
      [
        'NAWAZ CORPORATION',
        '14 Main Road, Mumbai 400053',
        'Bill No 77 Date 15-08-2025',
        'Rice 1kg 2 x 120.00 240.00',
        'Sugar 1kg 45.00',
        'Previous Bal. : 0.00',
        'Subtotal 285.00',
        'Grand Total 285.00',
        'Paper products are non-refundable.',
        'Thank you visit again',
      ].join('\n'),
      { meanConfidence: 85 },
    );
    expect(s.items.map((i) => i.name)).toEqual(['Rice 1kg', 'Sugar 1kg']);
    expect(s.grand_total).toBe(285);
  });
});

describe('ocr/validator: math', () => {
  it('verifies a consistent receipt', () => {
    const s = parseStructuredReceipt(
      'STORE\nBread 2 x 45.00 90.00\nSubtotal 90.00\nTotal 90.00\n',
      { meanConfidence: 90 },
    );
    const m = checkStructuredMath(s);
    expect(m.status).toBe('verified');
    expect(m.flags).toEqual([]);
    expect(m.detail).toContain('verified');
  });

  it('flags conflicting totals instead of overwriting', () => {
    const s = parseStructuredReceipt('STORE\nMilk 487.00\nTotal 527.00\n', { meanConfidence: 90 });
    const m = checkStructuredMath(s);
    expect(m.status).toBe('needs-verification');
    expect(m.flags).toContain('grand_total');
    expect(m.detail).toContain('⚠ Total needs verification');
    // The receipt's own total is untouched.
    expect(s.grand_total).toBe(527);
  });

  it('marks missing totals incomplete', () => {
    const s = parseStructuredReceipt('STORE\nMilk 72.00\n', { meanConfidence: 80 });
    expect(checkStructuredMath(s).status).toBe('incomplete');
  });

  it('marks a lone total with nothing to check against incomplete, not verified', () => {
    const s = parseStructuredReceipt('STORE\nTotal 100.00\n', { meanConfidence: 90 });
    expect(s.grand_total).toBe(100);
    const m = checkStructuredMath(s);
    expect(m.status).toBe('incomplete');
    expect(m.flags).toContain('grand_total');
  });

  it('renders math details in the receipt currency, never hardcoded ₹', () => {
    const s = parseStructuredReceipt('STORE\nMilk $487.00\nTotal $527.00\n', { meanConfidence: 90 });
    const m = checkStructuredMath(s);
    expect(m.status).toBe('needs-verification');
    expect(m.detail).toContain('$');
    expect(m.detail).not.toContain('₹');
  });

  it('keeps legitimate large prices, still drops PIN runs', () => {
    const kept = parseStructuredReceipt('STORE\nLaptop 100000.00\nTotal 100000.00\n', { meanConfidence: 90 });
    expect(kept.items.map((i) => i.name)).toEqual(['Laptop']);
    const dropped = parseStructuredReceipt('STORE\n14 Main Road, Mumbai 400053\nBread 90.00\nTotal 90.00\n', {
      meanConfidence: 90,
    });
    expect(dropped.items.map((i) => i.name)).toEqual(['Bread']);
  });

  it('detects CNY from explicit Chinese markers despite ¥', () => {
    const s = parseStructuredReceipt('STORE\nNoodles ¥25.00\nTotal ¥25.00 元\n', { meanConfidence: 90 });
    expect(s.currency).toBe('CNY');
  });
});
