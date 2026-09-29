import { describe, expect, it } from 'vitest';
import {
  buildCopyBreakdown,
  calculateSplit,
  chatText,
  classifyPuterError,
  formatMinor,
  getCurrency,
  localParseSplitIntent,
  minorToMajorString,
  parseMajorToMinor,
  parseSplitIntent,
  generatePaymentMessage,
  buildLocalPaymentMessage,
  validateSplitInput,
  verifySplit,
  withTimeout,
  type SplitPerson,
} from './index';

function people(names: string[]): SplitPerson[] {
  return names.map((name, i) => ({ id: `p${i}`, name }));
}

function splitMinor(totalMinor: number, currency: string, names: string[]) {
  const s = calculateSplit(totalMinor, currency, people(names));
  expect(verifySplit(s)).toBe(true);
  const sum = s.shares.reduce((a, x) => a + x.amountMinor, 0);
  expect(sum).toBe(totalMinor);
  return s;
}

describe('bill-splitter: required split cases (sum === total always)', () => {
  it('₹1000 / 2', () => {
    const s = splitMinor(100000, 'INR', ['A', 'B']);
    expect(s.shares.map((x) => x.amountMinor)).toEqual([50000, 50000]);
  });
  it('₹1000 / 3 (extra paise goes to the FIRST person)', () => {
    const s = splitMinor(100000, 'INR', ['Shub', 'Arjun', 'Riya']);
    expect(s.shares.map((x) => x.amountMinor)).toEqual([33334, 33333, 33333]);
    expect(s.remainderCount).toBe(1);
  });
  it('₹1000 / 7 (first 5 absorb one paise each)', () => {
    const s = splitMinor(100000, 'INR', ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(s.remainderCount).toBe(100000 % 7);
    expect(s.shares.slice(0, 5).every((x) => x.amountMinor === 14286)).toBe(true);
    expect(s.shares.slice(5).every((x) => x.amountMinor === 14285)).toBe(true);
  });
  it('₹999 / 3 (clean)', () => {
    const s = splitMinor(99900, 'INR', ['a', 'b', 'c']);
    expect(s.shares.every((x) => x.amountMinor === 33300)).toBe(true);
    expect(s.remainderCount).toBe(0);
  });
  it('₹100.50 / 3', () => {
    const s = splitMinor(10050, 'INR', ['a', 'b', 'c']);
    expect(s.shares.map((x) => x.amountMinor)).toEqual([3350, 3350, 3350]);
  });
  it('$10 / 3', () => {
    const s = splitMinor(1000, 'USD', ['a', 'b', 'c']);
    expect(s.shares.map((x) => x.amountMinor)).toEqual([334, 333, 333]);
  });
  it('€100 / 6', () => {
    splitMinor(10000, 'EUR', ['a', 'b', 'c', 'd', 'e', 'f']);
  });
  it('¥1000 / 3 (zero-decimal)', () => {
    const s = splitMinor(1000, 'JPY', ['a', 'b', 'c']);
    expect(s.shares.map((x) => x.amountMinor)).toEqual([334, 333, 333]);
  });
  it('₩10000 / 3 (zero-decimal)', () => {
    const s = splitMinor(10000, 'KRW', ['a', 'b', 'c']);
    expect(s.shares.map((x) => x.amountMinor)).toEqual([3334, 3333, 3333]);
  });
});

describe('bill-splitter: people counts', () => {
  it('two people', () => {
    splitMinor(5000, 'INR', ['A', 'B']);
  });
  it('many people (23)', () => {
    splitMinor(100000, 'INR', Array.from({ length: 23 }, (_, i) => `P${i}`));
  });
  it('distribution is positional and deterministic', () => {
    const a = calculateSplit(100000, 'INR', people(['A', 'B', 'C']));
    const b = calculateSplit(100000, 'INR', people(['A', 'B', 'C']));
    expect(a.shares.map((x) => x.amountMinor)).toEqual(b.shares.map((x) => x.amountMinor));
    expect(a.shares.map((x) => x.amountMinor)).toEqual([33334, 33333, 33333]);
  });
});

describe('bill-splitter: validation', () => {
  const rows = (names: string[]) => names.map((name, i) => ({ id: `p${i}`, name }));
  it('rejects duplicate names', () => {
    const r = validateSplitInput({ amountText: '100', currency: 'INR', people: rows(['A', 'a']) });
    expect(r.ok).toBe(false);
  });
  it('auto-generates Person N for blank rows', () => {
    const r = validateSplitInput({ amountText: '100', currency: 'INR', people: rows(['', '  ']) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.people.map((p) => p.name)).toEqual(['Person 1', 'Person 2']);
  });
  it('typed name colliding with an auto-name is still a duplicate', () => {
    const r = validateSplitInput({ amountText: '100', currency: 'INR', people: rows(['', 'Person 1']) });
    expect(r.ok).toBe(false);
  });
  it('rejects zero amount', () => {
    expect(validateSplitInput({ amountText: '0', currency: 'INR', people: rows(['A', 'B']) }).ok).toBe(false);
  });
  it('rejects negative amount', () => {
    expect(validateSplitInput({ amountText: '-5', currency: 'INR', people: rows(['A', 'B']) }).ok).toBe(false);
  });
  it('rejects garbage amount', () => {
    expect(validateSplitInput({ amountText: 'abc', currency: 'INR', people: rows(['A', 'B']) }).ok).toBe(false);
  });
  it('rejects unsupported currency', () => {
    expect(validateSplitInput({ amountText: '100', currency: 'XXX', people: rows(['A', 'B']) }).ok).toBe(false);
  });
  it('accepts receipt-derived and manual totals', () => {
    const fromReceipt = validateSplitInput({ amountText: '2500', currency: 'INR', people: rows(['A', 'B']) });
    expect(fromReceipt.ok).toBe(true);
    const manual = validateSplitInput({ amountText: '1,850.00', currency: 'INR', people: rows(['A', 'B']) });
    expect(manual.ok).toBe(true);
    if (manual.ok) expect(manual.value.totalMinor).toBe(185000);
  });
});

describe('bill-splitter: currency parsing', () => {
  it('parses grouped decimals without floats', () => {
    expect(parseMajorToMinor('1,000.50', 'INR')).toBe(100050);
    expect(parseMajorToMinor('₹1,850.00', 'INR')).toBe(185000);
  });
  it('rounds half-up for zero-decimal currencies', () => {
    expect(parseMajorToMinor('1000.5', 'JPY')).toBe(1001);
    expect(parseMajorToMinor('1000.4', 'JPY')).toBe(1000);
    expect(parseMajorToMinor('10000', 'KRW')).toBe(10000);
  });
  it('unknown currency returns null', () => {
    expect(getCurrency('XXX')).toBeNull();
    expect(parseMajorToMinor('10', 'XXX')).toBeNull();
  });
  it('formats per-currency (JPY has no decimals)', () => {
    expect(formatMinor(1000, 'JPY')).not.toContain('.');
    expect(formatMinor(100000, 'INR')).toContain('1,000');
  });
});

describe('bill-splitter: exact acceptance cases', () => {
  it('TEST 1: INR 5463 / 4 -> 1365.75 each', () => {
    const s = splitMinor(546300, 'INR', ['Me', 'Sam', 'Ayush', 'Ghj']);
    expect(s.shares.every((x) => x.amountMinor === 136575)).toBe(true);
    expect(formatMinor(546300, 'INR')).toBe('₹5,463.00');
    expect(formatMinor(136575, 'INR')).toBe('₹1,365.75');
  });
  it('TEST 2: USD 5463 / 4 -> $1,365.75 each', () => {
    const s = splitMinor(546300, 'USD', ['Me', 'Sam', 'Ayush', 'Ghj']);
    expect(s.shares.every((x) => x.amountMinor === 136575)).toBe(true);
    expect(formatMinor(546300, 'USD')).toBe('$5,463.00');
    expect(formatMinor(136575, 'USD')).toBe('$1,365.75');
  });
  it('TEST 3: EUR 100 / 3 -> 33.34 + 33.33 + 33.33 = 100.00', () => {
    const s = splitMinor(10000, 'EUR', ['A', 'B', 'C']);
    expect(s.shares.map((x) => x.amountMinor)).toEqual([3334, 3333, 3333]);
    expect(formatMinor(s.shares[0].amountMinor, 'EUR')).toContain('33,34');
  });
  it('TEST 4: JPY 1000 / 3 -> zero-decimal shares sum to exactly 1000', () => {
    const s = splitMinor(1000, 'JPY', ['A', 'B', 'C']);
    expect(s.shares.map((x) => x.amountMinor)).toEqual([334, 333, 333]);
    expect(formatMinor(1000, 'JPY')).not.toContain('.');
    expect(formatMinor(334, 'JPY')).toContain('334');
  });
  it('TEST 5: INR 99.99 / 2 -> 50.00 + 49.99 = 99.99', () => {
    const s = splitMinor(9999, 'INR', ['A', 'B']);
    expect(s.shares.map((x) => x.amountMinor)).toEqual([5000, 4999]);
    expect(formatMinor(5000, 'INR')).toBe('₹50.00');
    expect(formatMinor(4999, 'INR')).toBe('₹49.99');
  });
  it('currency-aware payment message follows the selected currency', () => {
    const usd = calculateSplit(546300, 'USD', people(['A', 'B', 'C', 'D']));
    expect(buildLocalPaymentMessage(usd)).toContain('$1,365.75');
    expect(buildLocalPaymentMessage(usd)).not.toContain('₹');
    const jpy = calculateSplit(1000, 'JPY', people(['A', 'B', 'C']));
    expect(buildLocalPaymentMessage(jpy)).toContain('￥333');
  });
});

describe('bill-splitter: SAR + Arabic-locale digits', () => {
  it('supports SAR with Latin digits', () => {
    expect(getCurrency('SAR')).toMatchObject({ decimals: 2 });
    const s = splitMinor(10000, 'SAR', ['A', 'B', 'C']);
    expect(s.shares.map((x) => x.amountMinor)).toEqual([3334, 3333, 3333]);
    expect(formatMinor(10000, 'SAR')).toMatch(/[0-9]/);
    expect(formatMinor(10000, 'SAR')).not.toMatch(/[٠-٩]/);
  });
  it('AED renders Latin digits', () => {
    expect(formatMinor(250000, 'AED')).toMatch(/[0-9]/);
    expect(formatMinor(250000, 'AED')).not.toMatch(/[٠-٩]/);
  });
});

describe('bill-splitter: currency switch never converts', () => {
  it('same digits, same minor units across 2-decimal currencies', () => {
    expect(parseMajorToMinor('5463', 'INR')).toBe(parseMajorToMinor('5463', 'USD'));
    expect(parseMajorToMinor('5463', 'USD')).toBe(546300);
  });
  it('canonicalizes precision per currency', () => {
    expect(minorToMajorString(101, 'JPY')).toBe('101');
    expect(minorToMajorString(100050, 'INR')).toBe('1000.5');
    expect(minorToMajorString(100000, 'INR')).toBe('1000');
    // "100.50" reinterpreted as JPY rounds to 101, shown as "101":
    expect(minorToMajorString(parseMajorToMinor('100.50', 'JPY')!, 'JPY')).toBe('101');
  });
});

describe('bill-splitter: final acceptance tests (remainder inside shares)', () => {
  it('1. ₹53,321.00 / 3', () => {
    const s = splitMinor(5332100, 'INR', ['sum', 'ayus', 'k2']);
    expect(s.shares.map((x) => x.amountMinor)).toEqual([1777367, 1777367, 1777366]);
    expect(formatMinor(1777367, 'INR')).toBe('₹17,773.67');
    expect(formatMinor(1777366, 'INR')).toBe('₹17,773.66');
  });
  it('2. ₹100.00 / 3', () => {
    const s = splitMinor(10000, 'INR', ['A', 'B', 'C']);
    expect(s.shares.map((x) => x.amountMinor)).toEqual([3334, 3333, 3333]);
  });
  it('3. ₹10.00 / 4 (clean)', () => {
    const s = splitMinor(1000, 'INR', ['A', 'B', 'C', 'D']);
    expect(s.shares.every((x) => x.amountMinor === 250)).toBe(true);
  });
  it('4. ₹99.99 / 2', () => {
    splitMinor(9999, 'INR', ['A', 'B']);
  });
  it('5. ₹1.00 / 3', () => {
    const s = splitMinor(100, 'INR', ['A', 'B', 'C']);
    expect(s.shares.map((x) => x.amountMinor)).toEqual([34, 33, 33]);
  });
  it('6. $100.00 / 3', () => {
    const s = splitMinor(10000, 'USD', ['A', 'B', 'C']);
    expect(s.shares.map((x) => x.amountMinor)).toEqual([3334, 3333, 3333]);
  });
  it('7. ¥100 / 3', () => {
    const s = splitMinor(100, 'JPY', ['A', 'B', 'C']);
    expect(s.shares.map((x) => x.amountMinor)).toEqual([34, 33, 33]);
  });
  it('copy breakdown contains only final shares', () => {
    const s = calculateSplit(5332100, 'INR', people(['sum', 'ayus', 'k2']));
    const copy = buildCopyBreakdown(s);
    expect(copy).toBe(
      ['Bill split: ₹53,321.00', '', 'sum: ₹17,773.67', 'ayus: ₹17,773.67', 'k2: ₹17,773.66', '', 'Total: ₹53,321.00'].join('\n'),
    );
    expect(copy).not.toMatch(/spare|crumb|remainder|\+₹/i);
  });
  it('local message never mentions a spare amount', () => {
    const s = calculateSplit(5332100, 'INR', people(['sum', 'ayus', 'k2']));
    const msg = buildLocalPaymentMessage(s);
    expect(msg).not.toMatch(/spare|crumb|extra|unlucky/i);
    expect(msg).toContain('₹17,773.67');
  });
});

describe('bill-splitter: chat response extraction', () => {
  it('handles strings, objects, and content-part arrays', () => {
    expect(chatText('plain string')).toBe('plain string');
    expect(chatText({ message: { content: 'object shape' } })).toBe('object shape');
    expect(chatText({ message: { content: [{ type: 'text', text: 'part ' }, { type: 'text', text: 'array' }] } })).toBe(
      'part array',
    );
    expect(chatText({ choices: [{ message: { content: 'choice shape' } }] })).toBe('choice shape');
    expect(chatText({})).toBe('');
    expect(chatText(null)).toBe('');
  });
  it('classifies failures for the right recovery UI', () => {
    expect(classifyPuterError(new Error('puter-timeout'))).toBe('timeout');
    expect(classifyPuterError(new Error('auth required, please sign in'))).toBe('auth');
    expect(classifyPuterError(new Error('401 Unauthorized'))).toBe('auth');
    expect(classifyPuterError(new Error('puter-unavailable'))).toBe('unavailable');
    expect(classifyPuterError(new Error('failed to fetch'))).toBe('unavailable');
    expect(classifyPuterError(new Error('429 rate limited'))).toBe('unavailable');
    expect(classifyPuterError(new Error('weird model error'))).toBe('invalid');
  });
});

describe('bill-splitter: Puter timeout', () => {
  it('fast chat resolves', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });
  it('hanging chat rejects with puter-timeout', async () => {
    const hanging = new Promise(() => undefined);
    await expect(withTimeout(hanging as Promise<string>, 20)).rejects.toThrow('puter-timeout');
  });
});

describe('bill-splitter: engine guards', () => {
  it('throws on bad engine input', () => {
    expect(() => calculateSplit(0, 'INR', people(['A', 'B']))).toThrow();
    expect(() => calculateSplit(100, 'XXX', people(['A', 'B']))).toThrow();
    expect(() => calculateSplit(100, 'INR', people(['A']))).toThrow();
  });
  it('verifySplit rejects tampered shares', () => {
    const s = calculateSplit(100000, 'INR', people(['A', 'B', 'C']));
    expect(verifySplit({ ...s, totalMinor: s.totalMinor + 1 })).toBe(false);
  });
});

describe('bill-splitter: Puter assist (AI never required)', () => {
  it('parses intent from Puter JSON', async () => {
    const chat = async () => '{"amount": 2400, "currency": "INR", "people": ["Me", "Arjun", "Riya", "Sam"]}';
    const r = await parseSplitIntent('Split 2400 between me, Arjun, Riya and Sam', chat);
    expect(r).toEqual({ amountMajor: '2400', currency: 'INR', people: ['Me', 'Arjun', 'Riya', 'Sam'] });
  });
  it('Puter garbage -> null (local/manual takes over)', async () => {
    const chat = async () => 'Sure thing, splitting now!';
    expect(await parseSplitIntent('split stuff', chat)).toBeNull();
  });
  it('Puter unavailable -> null, splitter still works', async () => {
    const chat = async () => {
      throw new Error('puter-unavailable');
    };
    expect(await parseSplitIntent('Split 100 between A and B', chat)).toBeNull();
    // core math needs no AI:
    splitMinor(10000, 'INR', ['A', 'B']);
  });
  it('local parser handles the canonical phrasing', () => {
    expect(localParseSplitIntent('Split 2400 between me, Arjun, Riya and Sam')).toEqual({
      amountMajor: '2400',
      currency: 'INR',
      people: ['me', 'Arjun', 'Riya', 'Sam'],
    });
  });
  it('AI message echoes a real share, else a classified failure', async () => {
    const s = calculateSplit(100000, 'INR', people(['A', 'B', 'C']));
    const good = async () => '₹333.33 each, run it up 😭';
    const okRes = await generatePaymentMessage(s, good);
    expect(okRes.ok).toBe(true);
    if (okRes.ok) expect(okRes.message).toContain('₹333.33');
    const lying = async () => 'Everyone owes ₹100. Done deal.';
    expect(await generatePaymentMessage(s, lying)).toEqual({ ok: false, reason: 'invalid' });
    const down = async () => {
      throw new Error('puter-unavailable');
    };
    expect(await generatePaymentMessage(s, down)).toEqual({ ok: false, reason: 'unavailable' });
    const locked = async () => {
      throw new Error('auth required: sign in with Puter');
    };
    expect(await generatePaymentMessage(s, locked)).toEqual({ ok: false, reason: 'auth' });
    // local fallback always produces a message:
    expect(buildLocalPaymentMessage(s)).toContain('₹333.33');
  });
  it('AI works with real Puter object-shaped responses', async () => {
    const s = calculateSplit(100000, 'INR', people(['A', 'B', 'C']));
    const objectShape = async () => ({ message: { content: '₹333.33 each, pay up bestie' } });
    const r1 = await generatePaymentMessage(s, objectShape);
    expect(r1.ok).toBe(true);
    const partArray = async () => ({ message: { content: [{ type: 'text', text: '₹333.33 each, no excuses' }] } });
    const r2 = await generatePaymentMessage(s, partArray);
    expect(r2.ok).toBe(true);
  });
});
