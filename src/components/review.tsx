import { useEffect, useMemo, useState } from 'react';
import type { Confidence, Receipt, ReceiptItem } from '../types';
import { newId } from '../types';
import { formatMoney } from '../lib/format';
import { SUPPORTED_CURRENCIES } from '../lib/bill-splitter/currencies';
import { sumItems, totalsMismatch, itemTotalFor } from '../lib/calculations';
import { validateReceipt, plausibleReceipt } from '../lib/validation';
import { cleanText } from '../lib/security';
import { Modal } from './chrome';

/* ---------- Image viewer ---------- */

export function ImageViewer({
  src,
  onReplace,
}: {
  src: string | null;
  onReplace?: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);

  useEffect(() => setZoom(1), [src]);

  useEffect(() => {
    if (!full) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [full]);

  if (!src) {
    return (
      <div className="photo-panel">
        <div className="photo-head">
          <span className="label">Receipt photo</span>
        </div>
        <p className="meta" style={{ padding: '6px 2px 12px' }}>
          No photo attached — manual entry. The numbers below stand on their own.
        </p>
      </div>
    );
  }

  return (
    <div className="photo-panel">
      <div className="photo-head">
        <span className="label">Receipt photo</span>
        <span className="mono meta num">{Math.round(zoom * 100)}%</span>
      </div>
      <div className="viewer-canvas">
        <img
          src={src}
          alt="Receipt scan for verification"
          style={{ width: `${Math.min(320 * zoom, 1400)}px` }}
          draggable={false}
        />
      </div>
      <div className="viewer-bar" role="toolbar" aria-label="Image controls">
        <button className="mini-btn" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out">
          −
        </button>
        <button className="mini-btn" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} aria-label="Zoom in">
          +
        </button>
        <button className="mini-btn" onClick={() => setZoom(1)}>
          100%
        </button>
        <button className="mini-btn" onClick={() => setFull(true)} aria-haspopup="dialog">
          Fullscreen
        </button>
        <span className="spacer" />
        {onReplace && (
          <button className="mini-btn" onClick={onReplace}>
            Replace
          </button>
        )}
      </div>
      {full && (
        <Modal title="Receipt photo" onClose={() => setFull(false)}>
          <img src={src} alt="Receipt scan fullscreen" style={{ width: '100%' }} />
          <div className="modal-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setFull(false)}>
              Close (Esc)
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- Confidence as plain data flags, not pills ---------- */

function Flag({ c }: { c: Confidence }) {
  if (c === 'high') return <span className="flag flag-high">✓ sure</span>;
  if (c === 'medium') return <span className="flag flag-medium">— glance</span>;
  return <span className="flag flag-low">▲ check this</span>;
}

/* ---------- Item row ---------- */

function ItemRow({
  item,
  currency,
  index,
  onChange,
  onDelete,
  onDuplicate,
  onMove,
  first,
  last,
}: {
  item: ReceiptItem;
  currency: string;
  index: number;
  onChange: (patch: Partial<ReceiptItem>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
  first: boolean;
  last: boolean;
}) {
  return (
    <div className="item">
      <div className="item-top">
        <div className="grow">
          <label className="label" htmlFor={`name-${item.id}`}>
            {String(index + 1).padStart(2, '0')} · Item
          </label>
          <input
            id={`name-${item.id}`}
            className="input"
            value={item.name}
            placeholder="Name it as printed"
            onChange={(e) => onChange({ name: cleanText(e.target.value, 80) })}
            aria-invalid={!item.name.trim()}
          />
        </div>
        <Flag c={item.confidence} />
      </div>
      <div className="item-grid">
        <div>
          <label className="label" htmlFor={`qty-${item.id}`}>
            Qty
          </label>
          <div className="qty-stepper">
            <button
              className="mini-btn"
              aria-label={`Decrease quantity of ${item.name || 'item'}`}
              onClick={() => {
                const q = Math.max(1, item.quantity - 1);
                onChange({ quantity: q, totalPrice: itemTotalFor(q, item.unitPrice) });
              }}
            >
              −
            </button>
            <input
              id={`qty-${item.id}`}
              className="input input-num"
              inputMode="numeric"
              pattern="[0-9]*"
              value={String(item.quantity)}
              onChange={(e) => {
                const q = Math.max(0, Math.floor(Number(e.target.value) || 0));
                onChange({ quantity: q, totalPrice: itemTotalFor(q, item.unitPrice) });
              }}
              aria-label={`Quantity for ${item.name || 'item'}`}
            />
            <button
              className="mini-btn"
              aria-label={`Increase quantity of ${item.name || 'item'}`}
              onClick={() => {
                const q = item.quantity + 1;
                onChange({ quantity: q, totalPrice: itemTotalFor(q, item.unitPrice) });
              }}
            >
              +
            </button>
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`unit-${item.id}`}>
            Unit · {currency}
          </label>
          <input
            id={`unit-${item.id}`}
            className="input input-num"
            inputMode="decimal"
            value={String(item.unitPrice)}
            onChange={(e) => {
              const u = Number(e.target.value);
              if (Number.isFinite(u) && u >= 0)
                onChange({ unitPrice: Math.round(u * 100) / 100, totalPrice: itemTotalFor(item.quantity, u) });
              else onChange({ unitPrice: 0 });
            }}
          />
        </div>
        <div>
          <label className="label" htmlFor={`tot-${item.id}`}>
            Total · {currency}
          </label>
          <input
            id={`tot-${item.id}`}
            className="input input-num"
            inputMode="decimal"
            value={String(item.totalPrice)}
            onChange={(e) => {
              const t = Number(e.target.value);
              if (Number.isFinite(t) && t >= 0) {
                const unit = item.quantity > 0 ? Math.round((t / item.quantity) * 100) / 100 : t;
                onChange({ totalPrice: Math.round(t * 100) / 100, unitPrice: unit });
              }
            }}
          />
        </div>
      </div>
      <div className="item-ops">
        <button className="mini-btn" onClick={() => onMove(-1)} disabled={first} aria-label="Move item up">
          ↑
        </button>
        <button className="mini-btn" onClick={() => onMove(1)} disabled={last} aria-label="Move item down">
          ↓
        </button>
        <button className="mini-btn" onClick={onDuplicate}>
          Duplicate
        </button>
        <span className="spacer" />
        <button className="mini-btn" onClick={onDelete} aria-label={`Delete ${item.name || 'item'}`}>
          Delete
        </button>
      </div>
    </div>
  );
}

/* ---------- Full editor ---------- */

export function ReceiptEditor({
  draft,
  setDraft,
  imageSrc,
  onReplaceImage,
  onSave,
  onDiscard,
  onCopySummary,
  saving,
  heading,
  providerLabel,
  onRescan,
  onSplit,
}: {
  draft: Receipt;
  setDraft: (r: Receipt) => void;
  imageSrc: string | null;
  onReplaceImage?: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onCopySummary: () => void;
  saving: boolean;
  heading: string;
  providerLabel?: string | null;
  onRescan?: () => void;
  onSplit?: () => void;
}) {
  const itemsTotal = useMemo(() => sumItems(draft.items), [draft.items]);
  const { mismatch, computed } = useMemo(
    () =>
      totalsMismatch({
        itemsTotal,
        subtotal: draft.subtotal,
        discount: draft.discount,
        tax: draft.tax,
        tip: draft.tip,
        total: draft.total,
      }),
    [itemsTotal, draft.subtotal, draft.discount, draft.tax, draft.tip, draft.total],
  );
  const issues = useMemo(() => validateReceipt(draft), [draft]);
  const warns = useMemo(() => plausibleReceipt(draft), [draft]);
  const reviewCount = draft.items.filter((i) => i.confidence === 'low').length;

  // "Keep receipt total" acknowledges THIS exact disagreement. Any edit to
  // the numbers produces a new key and the banner returns — the lock is an
  // acknowledgement, not a gag on future mismatches.
  const [mismatchAck, setMismatchAck] = useState<string | null>(null);
  const mismatchKey = mismatch && computed !== null ? `${draft.total}|${computed}` : null;
  const showMismatch = mismatch && computed !== null && mismatchKey !== mismatchAck;

  const patch = (p: Partial<Receipt>) =>
    setDraft({ ...draft, ...p, updatedAt: new Date().toISOString() });

  const patchItem = (id: string, p: Partial<ReceiptItem>) => {
    setDraft({
      ...draft,
      items: draft.items.map((it) => (it.id === id ? { ...it, ...p } : it)),
      needsReview: draft.needsReview.filter((x) => x !== id),
      updatedAt: new Date().toISOString(),
    });
  };

  const moveItem = (id: string, dir: -1 | 1) => {
    const idx = draft.items.findIndex((i) => i.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= draft.items.length) return;
    const items = [...draft.items];
    [items[idx], items[j]] = [items[j], items[idx]];
    patch({ items: items.map((it, k) => ({ ...it, sortOrder: k })) });
  };

  const addItem = () => {
    const it: ReceiptItem = {
      id: newId('item'),
      name: '',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      confidence: 'high',
      sortOrder: draft.items.length,
    };
    patch({ items: [...draft.items, it] });
    requestAnimationFrame(() => document.getElementById(`name-${it.id}`)?.focus());
  };

  const numField = (
    key: 'subtotal' | 'discount' | 'tax' | 'tip' | 'total',
    label: string,
  ) => (
    <div className="total-line">
      <label htmlFor={`f-${key}`}>{label}</label>
      <input
        id={`f-${key}`}
        className="input input-num"
        inputMode="decimal"
        placeholder="—"
        value={draft[key] === null ? '' : String(draft[key])}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === '') {
            patch({ [key]: null, ...(key === 'total' ? { totalLocked: false } : {}) } as Partial<Receipt>);
            return;
          }
          const v = Number(raw);
          if (Number.isFinite(v) && v >= 0)
            patch({ [key]: Math.round(v * 100) / 100, ...(key === 'total' ? { totalLocked: true } : {}) } as Partial<Receipt>);
        }}
      />
    </div>
  );

  return (
    <div>
      <h1 className="review-title">{heading}</h1>
      <p className="review-sub">
        {draft.ocrRawText
          ? 'The reader did the first pass — give the numbers a once-over, then save.'
          : 'Enter the details below — same format as a scanned receipt.'}{' '}
        {reviewCount > 0 && <strong>▲ {reviewCount} flagged.</strong>}{' '}
        {providerLabel && <span className="meta">{providerLabel}</span>}
      </p>

      <div className="workspace">
        <ImageViewer src={imageSrc} onReplace={onReplaceImage} />

        <div className="data-col">
          <div className="data-sec">
            <span className="label">Merchant</span>
            <div className="field">
              <input
                id="f-merchant"
                aria-label="Merchant"
                className="input"
                value={draft.merchant}
                placeholder="Store name"
                autoComplete="off"
                onChange={(e) => patch({ merchant: cleanText(e.target.value, 60) })}
                aria-invalid={!draft.merchant.trim()}
                style={{ fontSize: 20, fontWeight: 700 }}
              />
              {!draft.merchant.trim() && <span className="field-error">Merchant name is empty.</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label" htmlFor="f-date">Date</label>
                <input
                  id="f-date"
                  type="date"
                  className="input"
                  value={draft.date}
                  max="2100-01-01"
                  onChange={(e) => patch({ date: e.target.value })}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label" htmlFor="f-cur">Currency</label>
                <select
                  id="f-cur"
                  className="select"
                  value={draft.currency}
                  onChange={(e) => patch({ currency: e.target.value })}
                >
                  {['₹', '$', '€', '£', '¥', ...SUPPORTED_CURRENCIES.map((c) => c.code)].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="data-sec">
            <span className="label">
              Items · {String(draft.items.length).padStart(2, '0')}
              <span className="right mono">Σ {formatMoney(itemsTotal, draft.currency)}</span>
            </span>

            {warns.map((w) => (
              <div className="inline-alert" key={w} role="note">
                {w}
              </div>
            ))}

            {draft.items.length === 0 ? (
              <div className="inline-alert" role="note">
                No line items yet.{' '}
                <button className="btn-quiet" onClick={addItem}>
                  Add the first one
                </button>
              </div>
            ) : (
              draft.items.map((it, idx) => (
                <ItemRow
                  key={it.id}
                  item={it}
                  currency={draft.currency}
                  index={idx}
                  first={idx === 0}
                  last={idx === draft.items.length - 1}
                  onChange={(p) => patchItem(it.id, p)}
                  onDelete={() => patch({ items: draft.items.filter((x) => x.id !== it.id) })}
                  onDuplicate={() =>
                    patch({
                      items: [
                        ...draft.items,
                        { ...it, id: newId('item'), sortOrder: draft.items.length },
                      ],
                    })
                  }
                  onMove={(d) => moveItem(it.id, d)}
                />
              ))
            )}

            <button className="btn btn-secondary btn-block" onClick={addItem} style={{ marginTop: 14 }}>
              + Add item
            </button>
          </div>

          <div className="data-sec">
            <span className="label">Totals</span>
            <div className="totals" aria-label="Totals">
              {numField('subtotal', 'Subtotal')}
              {numField('discount', 'Discount')}
              {numField('tax', 'Tax')}
              {numField('tip', 'Tip')}
              <div className="total-line grand">
                <label htmlFor="f-total">Total</label>
                <input
                  id="f-total"
                  className="input input-num"
                  inputMode="decimal"
                  placeholder="—"
                  value={draft.total === null ? '' : String(draft.total)}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (raw === '') {
                      patch({ total: null, totalLocked: false });
                      return;
                    }
                    const v = Number(raw);
                    if (Number.isFinite(v) && v >= 0)
                      patch({ total: Math.round(v * 100) / 100, totalLocked: true });
                  }}
                />
              </div>
            </div>

            {showMismatch && computed !== null && (
              <div className="mismatch" role="alert">
                <strong>⚠ Total needs verification.</strong>
                <br />
                Calculated: <strong className="num">{formatMoney(computed, draft.currency)}</strong>
                {' · '}Receipt: <strong className="num">{formatMoney(draft.total, draft.currency)}</strong>
                <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => patch({ total: computed, totalLocked: true })}
                  >
                    Use {formatMoney(computed, draft.currency)}
                  </button>
                  <button
                    className="btn-quiet btn-sm"
                    onClick={() => {
                      patch({ totalLocked: true });
                      if (mismatchKey !== null) setMismatchAck(mismatchKey);
                    }}
                  >
                    Keep receipt total
                  </button>
                </div>
              </div>
            )}

            {!mismatch && draft.total !== null && draft.items.length > 0 && (
              <div className="inline-alert" role="note">
                ✓ Calculated total matches the receipt total — verified.
              </div>
            )}

            {draft.total !== null && onSplit && (
              <button className="btn btn-secondary btn-block" onClick={onSplit} style={{ marginTop: 14 }}>
                Split this bill →
              </button>
            )}

            {issues.length > 0 && (
              <div className="inline-alert" role="note">
                <strong>{issues.length} small thing{issues.length > 1 ? 's' : ''} to look at:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {issues.slice(0, 5).map((i) => (
                    <li key={i.field + i.message}>{i.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {draft.ocrRawText && (
              <details className="faq" style={{ marginTop: 14 }}>
                <summary>
                  What did the scanner actually read? <span className="pm" aria-hidden="true">+</span>
                </summary>
                <pre className="mono" style={{ whiteSpace: 'pre-wrap', color: 'var(--ink-2)', fontSize: 13 }}>
                  {draft.ocrRawText.slice(0, 2000)}
                </pre>
                <div style={{ marginTop: 8 }}>
                  <button className="btn-quiet btn-sm" onClick={onCopySummary}>
                    Copy expense summary
                  </button>
                </div>
              </details>
            )}
          </div>

          <div className="savebar">
            <div className="grow">
              <div className="grand-total num">{formatMoney(draft.total ?? computed ?? itemsTotal, draft.currency)}</div>
              <div className="meta mono" style={{ fontSize: 12 }}>
                {draft.items.length} ITEMS · {(draft.merchant || 'UNTITLED').toUpperCase()}
              </div>
            </div>
            {onRescan && (
              <button className="btn-quiet" onClick={onRescan} disabled={saving}>
                Scan again
              </button>
            )}
            <button className="btn-quiet" onClick={onDiscard} disabled={saving}>
              Discard
            </button>
            <button className="btn btn-primary" onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : 'Confirm & Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
