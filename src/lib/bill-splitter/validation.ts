/**
 * Input validation for the splitter. Never show a fake result: the UI only
 * calculates when this returns ok === true (plus verifySplit as a belt).
 */
import { MAX_SPLIT_MINOR, getCurrency, parseMajorToMinor } from './currencies';
import type { SplitPerson } from './types';

export const MAX_PEOPLE = 50;

export interface SplitIssue {
  field: string;
  message: string;
}

export interface ValidSplitInput {
  totalMinor: number;
  currency: string;
  people: SplitPerson[];
}

function cleanName(s: string): string {
  return (s ?? '')
    .replace(/[^\x09\x0A\x20-\uFFFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

export function validateSplitInput(input: {
  amountText: string;
  currency: string;
  /** Stable row ids from the UI are preserved so inputs keep focus. */
  people: Array<{ id: string; name: string }>;
}): { ok: true; value: ValidSplitInput; issues: SplitIssue[] } | { ok: false; issues: SplitIssue[] } {
  const issues: SplitIssue[] = [];

  const meta = getCurrency(input.currency);
  if (!meta) {
    issues.push({ field: 'currency', message: 'Pick a supported currency.' });
    return { ok: false, issues };
  }

  const totalMinor = parseMajorToMinor(input.amountText, meta.code);
  if (totalMinor === null) {
    issues.push({ field: 'amount', message: 'Enter a valid bill amount.' });
  } else if (totalMinor <= 0) {
    issues.push({ field: 'amount', message: 'The bill amount has to be above zero.' });
  } else if (totalMinor > MAX_SPLIT_MINOR) {
    issues.push({ field: 'amount', message: 'That amount is unrealistically large.' });
  }

  // Blank rows auto-generate "Person 1..N" (by row position) so an unnamed
  // split still calculates; duplicates always block with a rename prompt.
  const cleaned = (input.people ?? []).map((p, idx) => {
    const name = cleanName(p.name);
    return { id: p.id, name: name.length > 0 ? name : `Person ${idx + 1}` };
  });
  if (cleaned.length < 2) {
    issues.push({ field: 'people', message: 'Add at least two people to split with.' });
  }
  if (cleaned.length > MAX_PEOPLE) {
    issues.push({ field: 'people', message: `Keep it to ${MAX_PEOPLE} people or fewer.` });
  }
  const seen = new Set<string>();
  for (const p of cleaned) {
    const key = p.name.toLowerCase();
    if (seen.has(key)) {
      issues.push({
        field: 'people',
        message: `Two people are both “${p.name}” — add a last initial so shares stay clear.`,
      });
      break;
    }
    seen.add(key);
  }

  if (issues.length > 0 || totalMinor === null || totalMinor <= 0) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: {
      totalMinor,
      currency: meta.code,
      people: cleaned.map((p) => ({ id: p.id, name: p.name })),
    },
    issues,
  };
}
