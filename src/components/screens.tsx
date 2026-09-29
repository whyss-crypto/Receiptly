import type { Receipt } from '../types';
import { formatDateISO, formatMoney } from '../lib/format';
import { EmptyState, Faq } from './chrome';
import { IconArrowR, IconTrash } from './icons';

/** The receipt as a physical object — paper, ink, teeth, stamp. No UI-chrome. */
export function ReceiptStill() {
  return (
    <figure className="hero-fig" aria-label="Illustration of a scanned paper grocery receipt">
      <div className="receipt" role="img" aria-label="A paper grocery receipt showing line items and a verified stamp">
        <div className="receipt-teeth top" aria-hidden="true" />
        <div className="receipt-body">
          <h3>FRESH MART</h3>
          <p className="receipt-sub">12 MG ROAD · 12 AUG 2025</p>
          <div className="r-rule" aria-hidden="true" />
          <div className="rl"><span>MILK ×1</span><span className="dots" aria-hidden="true" /><span>72.00</span></div>
          <div className="rl"><span>BREAD ×2</span><span className="dots" aria-hidden="true" /><span>90.00</span></div>
          <div className="rl"><span>EGGS ×12</span><span className="dots" aria-hidden="true" /><span>80.00</span></div>
          <div className="r-rule" aria-hidden="true" />
          <div className="rl"><span>GST</span><span className="dots" aria-hidden="true" /><span>12.10</span></div>
          <div className="rl grand"><span>TOTAL</span><span className="dots" aria-hidden="true" /><span>₹244.10</span></div>
          <div style={{ textAlign: 'center' }}>
            <span className="r-stamp">✓ VERIFIED BY YOU</span>
          </div>
          <div className="r-barcode" aria-hidden="true" />
        </div>
        <div className="receipt-teeth bottom" aria-hidden="true" />
      </div>
      <figcaption className="fig-cap">
        <span>FIG. 01 — A REAL SLIP</span>
        <span>READ IN 6 S</span>
      </figcaption>
    </figure>
  );
}

export function HomeScreen({
  receipts,
  onScan,
  onUpload,
  onOpen,
  onManual,
  onSplit,
}: {
  receipts: Receipt[];
  onScan: () => void;
  onUpload: () => void;
  onOpen: (id: string) => void;
  onManual: () => void;
  onSplit: () => void;
}) {
  const recent = receipts.slice(0, 4);
  return (
    <div>
      <section className="hero" aria-label="Introduction">
        <div className="hero-meta">
          <span className="kicker">Receipt scanner · On-device OCR</span>
          <span className="kicker no-rule">Paper → Data</span>
        </div>
        <div className="hero-grid">
          <div>
            <h1 className="h-display hero-title">
              Paper in.
              <span className="ind">
                Numbers <span className="out">out.</span>
              </span>
            </h1>
            <p className="lead hero-sub">
              Point your camera at any slip. We read the line items, flag anything
              iffy, and you approve every number before it saves.
            </p>
            <div className="hero-actions">
              <button className="btn btn-primary" onClick={onScan}>
                Scan a receipt <IconArrowR />
              </button>
              <button className="btn btn-secondary" onClick={onUpload}>
                Upload a photo
              </button>
            </div>
            <p className="hero-note">
              <span>No account · Photos stay on this device</span>
              <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button className="text-link" onClick={onManual}>
                  Enter by hand
                </button>
                <button className="text-link" onClick={onSplit}>
                  Split a bill
                </button>
              </span>
            </p>
          </div>
          <ReceiptStill />
        </div>
      </section>

      <div className="band" aria-label="How a receipt becomes data">
        <div className="container">
          <span className="band-step"><span className="b-n">01</span><span className="b-w">PHOTO</span></span>
          <span className="band-arrow" aria-hidden="true">→</span>
          <span className="band-step"><span className="b-n">02</span><span className="b-w">READ</span></span>
          <span className="band-arrow" aria-hidden="true">→</span>
          <span className="band-step"><span className="b-n">03</span><span className="b-w">STRUCTURE</span></span>
          <span className="band-arrow" aria-hidden="true">→</span>
          <span className="band-step"><span className="b-n">04</span><span className="b-w">YOU VERIFY</span></span>
          <span className="band-note">Messy paper in, clean numbers out.</span>
        </div>
      </div>

      <section className="section" aria-label="How it works">
        <p className="kicker">01 — How it works</p>
        <h2 className="h-section" style={{ marginTop: 12 }}>Three moves. No typing.</h2>
        <div className="how-list">
          <div className="how-row">
            <span className="how-n">01</span>
            <span className="how-title">CAPTURE</span>
            <div className="how-body">
              <p>Camera, photo library, drag-and-drop, paste. The original stays pinned next to the numbers so you can always check.</p>
            </div>
          </div>
          <div className="how-row">
            <span className="how-n">02</span>
            <span className="how-title">CHECK</span>
            <div className="how-body">
              <p>The reader does the first pass; shaky lines get flagged, never hidden. Fix a digit, nudge a quantity, move on.</p>
            </div>
          </div>
          <div className="how-row">
            <span className="how-n">03</span>
            <span className="how-title">KEEP</span>
            <div className="how-body">
              <p>One tap saves it. Find anything later by shop, dish, date, or amount.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-label="Recent receipts">
        <div className="recent-head">
          <p className="kicker">02 — Recent</p>
          {receipts.length > 0 && (
            <span className="mono meta">{String(receipts.length).padStart(2, '0')} SAVED</span>
          )}
        </div>
        {recent.length === 0 ? (
          <EmptyState
            kicker="Ledger is empty"
            title="Nothing here yet."
            body="Scan your first receipt and it'll appear here, newest first."
            action={
              <button className="text-link" onClick={onScan}>
                Scan your first receipt <IconArrowR />
              </button>
            }
          />
        ) : (
          <div className="recent-list">
            {recent.map((r) => (
              <button key={r.id} className="recent-row" onClick={() => onOpen(r.id)}
                aria-label={`Open receipt from ${r.merchant || 'unknown store'}, ${formatMoney(r.total, r.currency)}`}>
                {r.thumbnail ? (
                  <img className="rr-thumb" src={r.thumbnail} alt="" aria-hidden="true" />
                ) : (
                  <span className="rr-thumb-fallback mono" aria-hidden="true">Nº</span>
                )}
                <span className="rr-main">
                  <span className="rr-merchant">{r.merchant || 'Untitled receipt'}</span>
                  <br />
                  <span className="rr-meta">{formatDateISO(r.date).toUpperCase()} · {r.items.length} ITEMS</span>
                </span>
                <span className="rr-total">{formatMoney(r.total, r.currency)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-label="Questions">
        <p className="kicker">03 — Questions</p>
        <h2 className="h-section" style={{ marginTop: 12, marginBottom: 10 }}>Asked, answered.</h2>
        <Faq />
      </section>
    </div>
  );
}

export function ReceiptRowActions({ onDelete, label }: { onDelete: () => void; label: string }) {
  return (
    <button
      className="rr-del"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
    >
      <IconTrash />
    </button>
  );
}

export function SettingsScreen({
  theme,
  onTheme,
  receiptCount,
  onExport,
  onClearAll,
}: {
  theme: string;
  onTheme: (t: 'light' | 'dark') => void;
  receiptCount: number;
  onExport: () => void;
  onClearAll: () => void;
}) {
  return (
    <div style={{ marginTop: 30 }}>
      <p className="kicker">Settings</p>
      <h1 className="h-section" style={{ marginTop: 12 }}>Small knobs only.</h1>

      <div className="set-block" style={{ marginTop: 26 }}>
        <span className="label">Appearance</span>
        <div className="set-row">
          <p className="meta" style={{ maxWidth: '52ch' }}>Follows your system until you pick one.</p>
          <div className="seg" role="group" aria-label="Color theme">
            <button aria-pressed={theme === 'light'} onClick={() => onTheme('light')}>LIGHT</button>
            <button aria-pressed={theme === 'dark'} onClick={() => onTheme('dark')}>DARK</button>
          </div>
        </div>
      </div>

      <div className="set-block">
        <span className="label">Your data · {receiptCount} saved</span>
        <div className="set-row">
          <p className="meta" style={{ maxWidth: '56ch' }}>
            Everything lives on this device — receipts in local storage, photos in a private
            on-device database. Reading runs locally. No account, no tracking, no third party
            sees your slips. Deleting a receipt deletes its photo too. Plainly: anyone with
            access to this browser profile could open it.
          </p>
        </div>
        <div className="set-row">
          <p className="meta">Download your receipts as JSON.</p>
          <button className="btn btn-secondary btn-sm" onClick={onExport}>Export JSON</button>
        </div>
        <div className="set-row">
          <p className="meta">Removes all receipts and photos from this browser.</p>
          <button className="btn btn-danger btn-sm" onClick={onClearAll}>Delete everything</button>
        </div>
      </div>

      <div className="set-block">
        <span className="label">Help</span>
        <div style={{ marginTop: 6 }}>
          <Faq />
        </div>
      </div>
    </div>
  );
}
