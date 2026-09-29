import { useEffect, useMemo, useState } from 'react';
import { newId } from '../types';
import { signInWithPuter } from '../lib/ocr/puter';
import {
  MAX_PEOPLE,
  SUPPORTED_CURRENCIES,
  buildCopyBreakdown,
  buildLocalPaymentMessage,
  calculateSplit,
  formatMinor,
  generatePaymentMessage,
  getCurrency,
  localParseSplitIntent,
  minorToMajorString,
  parseMajorToMinor,
  parseSplitIntent,
  validateSplitInput,
  verifySplit,
  type AiFailureReason,
} from '../lib/bill-splitter/index';

export interface SplitSeed {
  amountMajor: string;
  currency: string;
  /** e.g. merchant name — shown as the source, amounts stay editable. */
  source: string | null;
  lowConfidence: boolean;
  detectedTotal: string | null;
}

export const EMPTY_SPLIT_SEED: SplitSeed = {
  amountMajor: '',
  currency: 'INR',
  source: null,
  lowConfidence: false,
  detectedTotal: null,
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return true;
  } catch {
    return false;
  }
}

export function SplitScreen({ seed }: { seed: SplitSeed }) {
  const [currency, setCurrency] = useState(() => (getCurrency(seed.currency) ? seed.currency : 'INR'));
  const [amountText, setAmountText] = useState(() => {
    const minor = parseMajorToMinor(seed.amountMajor, seed.currency);
    if (minor === null || minor <= 0) return seed.amountMajor;
    return minorToMajorString(minor, seed.currency) ?? seed.amountMajor;
  });
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>(() => [
    { id: newId('person'), name: '' },
    { id: newId('person'), name: '' },
  ]);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [msgBusy, setMsgBusy] = useState(false);
  const [aiError, setAiError] = useState<AiFailureReason | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nlText, setNlText] = useState('');
  const [nlBusy, setNlBusy] = useState(false);
  const [nlNote, setNlNote] = useState<string | null>(null);

  // AI-drafted message names real people — any edit (including a rename
  // that keeps the headcount) invalidates it, so depend on the full list.
  useEffect(() => {
    setAiMessage(null);
    setAiError(null);
  }, [amountText, currency, people]);

  const validation = useMemo(
    () => validateSplitInput({ amountText, currency, people }),
    [amountText, currency, people],
  );

  const split = useMemo(() => {
    if (!validation.ok) return null;
    try {
      const s = calculateSplit(validation.value.totalMinor, validation.value.currency, validation.value.people);
      return verifySplit(s) ? s : null;
    } catch {
      return null;
    }
  }, [validation]);

  const localMessage = useMemo(() => (split ? buildLocalPaymentMessage(split) : ''), [split]);
  const message = aiMessage ?? localMessage;

  const setPerson = (id: string, name: string) =>
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, name: name.slice(0, 40) } : p)));

  // Switching currency reinterprets the SAME amount (never converts it) and
  // re-normalizes the text to the new precision, so "100.50" becomes "101"
  // under JPY instead of silently calculating on a different value.
  const changeCurrency = (code: string) => {
    setCurrency(code);
    setAmountText((prev) => {
      if (!prev.trim()) return prev;
      const minor = parseMajorToMinor(prev, code);
      if (minor === null || minor <= 0) return prev;
      return minorToMajorString(minor, code) ?? prev;
    });
  };

  const addPerson = () => {
    if (people.length >= MAX_PEOPLE) return;
    const id = newId('person');
    setPeople((prev) => [...prev, { id, name: '' }]);
    requestAnimationFrame(() => document.getElementById(`split-name-${id}`)?.focus());
  };

  const fillFromText = async () => {
    if (!nlText.trim() || nlBusy) return;
    setNlBusy(true);
    setNlNote(null);
    try {
      const intent = (await parseSplitIntent(nlText)) ?? localParseSplitIntent(nlText);
      if (!intent) {
        setNlNote('Couldn’t parse that — fill in below. The math still works by hand.');
        return;
      }
      setAmountText(intent.amountMajor);
      setCurrency(intent.currency);
      setPeople(intent.people.map((name) => ({ id: newId('person'), name })));
      setNlNote(`Filled in: ${intent.amountMajor} ${intent.currency}, ${intent.people.length} people. Check it over.`);
    } finally {
      setNlBusy(false);
    }
  };

  const upgradeMessage = async () => {
    if (!split || msgBusy) return;
    setMsgBusy(true);
    setAiError(null);
    try {
      const res = await generatePaymentMessage(split);
      if (res.ok) setAiMessage(res.message);
      else setAiError(res.reason); // local message stays visible underneath
    } finally {
      setMsgBusy(false);
    }
  };

  const signInAndRetry = async () => {
    if (signingIn) return;
    setSigningIn(true);
    try {
      await signInWithPuter();
      await upgradeMessage();
    } catch {
      setAiError('auth');
    } finally {
      setSigningIn(false);
    }
  };

  const copyMessage = async () => {
    if (!split) return;
    setCopied(await copyText(buildCopyBreakdown(split)));
    window.setTimeout(() => setCopied(false), 2000);
  };

  const resetAll = () => {
    setAmountText('');
    setPeople([
      { id: newId('person'), name: '' },
      { id: newId('person'), name: '' },
    ]);
    setNlText('');
    setNlNote(null);
    setAiMessage(null);
    setAiError(null);
  };

  const peopleIssues = validation.ok ? [] : validation.issues.filter((i) => i.field === 'people');
  const amountIssues = validation.ok ? [] : validation.issues.filter((i) => i.field !== 'people');

  return (
    <div>
      <div className="page-head">
        <p className="kicker">Bill splitter</p>
        <h1>Split it.</h1>
        <p className="meta" style={{ marginTop: 8 }}>
          Equal shares, remainder handled to the smallest unit. The math never leaves this page.
        </p>
      </div>

      {seed.source && (
        <p className="meta" style={{ marginBottom: 12 }}>
          From {seed.source} — total pre-filled, edit anything freely.
        </p>
      )}
      {seed.lowConfidence && seed.detectedTotal && (
        <div className="inline-alert" role="note" style={{ marginBottom: 12 }}>
          Detected total: <strong className="num">{seed.detectedTotal}</strong> — check this amount before splitting.
        </div>
      )}

      <div className="data-sec">
        <span className="label">Bill</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="split-amount">Amount</label>
            <input
              id="split-amount"
              className="input input-num"
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              aria-invalid={amountIssues.length > 0}
              style={{ fontSize: 20, fontWeight: 700 }}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="split-cur">Currency</label>
            <select
              id="split-cur"
              className="select"
              value={currency}
              onChange={(e) => changeCurrency(e.target.value)}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.tag} {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {amountIssues.length > 0 && (
          <div className="inline-alert error" role="alert" style={{ marginTop: 10 }}>
            {amountIssues[0].message}
          </div>
        )}
        <details className="faq" style={{ marginTop: 14 }}>
          <summary>
            Type it instead <span className="pm" aria-hidden="true">+</span>
          </summary>
          <p className="meta" style={{ margin: '8px 0' }}>
            e.g. “Split 2400 between me, Arjun, Riya and Sam”. AI fills the form — the split itself stays local.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="Split 2400 between…"
              value={nlText}
              onChange={(e) => setNlText(e.target.value)}
              aria-label="Describe the split in words"
            />
            <button className="btn btn-secondary btn-sm" onClick={() => void fillFromText()} disabled={nlBusy || !nlText.trim()}>
              {nlBusy ? 'Reading…' : 'Fill'}
            </button>
          </div>
          {nlNote && (
            <p className="meta" style={{ marginTop: 8 }}>{nlNote}</p>
          )}
        </details>
      </div>

      <div className="data-sec">
        <span className="label">
          Who’s splitting? · {String(people.length).padStart(2, '0')}
        </span>
        {people.map((p, idx) => (
          <div key={p.id} className="field" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label className="label" htmlFor={`split-name-${p.id}`}>
                Person {idx + 1}
              </label>
              <input
                id={`split-name-${p.id}`}
                className="input"
                placeholder={idx === 0 ? 'Your name' : "Friend's name"}
                autoComplete="off"
                value={p.name}
                onChange={(e) => setPerson(p.id, e.target.value)}
              />
            </div>
            <button
              className="mini-btn"
              onClick={() => setPeople((prev) => prev.filter((x) => x.id !== p.id))}
              disabled={people.length <= 2}
              aria-label={`Remove ${p.name || `person ${idx + 1}`}`}
            >
              Delete
            </button>
          </div>
        ))}
        <button className="btn btn-secondary btn-block" onClick={addPerson} style={{ marginTop: 6 }}>
          + Add someone
        </button>
        {peopleIssues.length > 0 && (
          <div className="inline-alert error" role="alert" style={{ marginTop: 10 }}>
            {peopleIssues[0].message}
          </div>
        )}
      </div>

      {split && (
        <div>
          <div className="receipt" aria-label="Bill split result">
            <div className="receipt-teeth top" aria-hidden="true" />
            <div className="receipt-body">
              <h3>BILL SPLIT</h3>
              <p className="receipt-sub">
                {formatMinor(split.totalMinor, split.currency)} · {split.shares.length} PEOPLE
              </p>
              <div className="r-rule" aria-hidden="true" />
              {split.shares.map((s) => (
                <div className="rl" key={s.id}>
                  <span>{s.name}</span>
                  <span className="dots" aria-hidden="true" />
                  <span>{formatMinor(s.amountMinor, split.currency)}</span>
                </div>
              ))}
              <div className="r-rule" aria-hidden="true" />
              <div className="rl grand">
                <span>{split.remainderCount === 0 ? 'EACH' : 'TOTAL'}</span>
                <span className="dots" aria-hidden="true" />
                <span>
                  {split.remainderCount === 0
                    ? formatMinor(split.baseMinor, split.currency)
                    : formatMinor(split.totalMinor, split.currency)}
                </span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span className="r-stamp">✓ MATH CHECKS OUT</span>
              </div>
              <div className="r-barcode" aria-hidden="true" />
            </div>
            <div className="receipt-teeth bottom" aria-hidden="true" />
          </div>

          <div className="data-sec" style={{ marginTop: 14 }}>
            <span className="label">Payment message</span>
            <p style={{ margin: '8px 0 12px' }}>{message}</p>
            {aiError === 'auth' ? (
              <div className="inline-alert" role="note" style={{ marginBottom: 12 }}>
                AI messages need Puter sign-in first (free — billed to your Puter account, not this app).
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => void signInAndRetry()} disabled={signingIn}>
                    {signingIn ? 'Signing in…' : 'Sign in with Puter'}
                  </button>
                </div>
              </div>
            ) : aiError ? (
              <div className="inline-alert" role="note" style={{ marginBottom: 12 }}>
                {aiError === 'timeout'
                  ? 'Puter took too long to answer.'
                  : 'Puter is unreachable right now.'}{' '}
                Local message shown instead.{' '}
                <button className="btn-quiet btn-sm" onClick={() => void upgradeMessage()}>
                  Try again
                </button>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => void copyMessage()}>
                {copied ? 'Copied ✓' : 'Copy message'}
              </button>
              <button className="btn-quiet btn-sm" onClick={() => void upgradeMessage()} disabled={msgBusy}>
                {msgBusy ? 'Asking AI…' : aiMessage ? 'New AI message' : 'AI message'}
              </button>
              <span className="spacer" />
              <button className="btn-quiet btn-sm" onClick={resetAll}>
                New split
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
