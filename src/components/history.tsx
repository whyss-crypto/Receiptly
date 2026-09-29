import { useMemo, useState } from 'react';
import type { Receipt } from '../types';
import { formatDateISO, formatMoney } from '../lib/format';
import { cleanSearch } from '../lib/security';
import { EmptyState } from './chrome';
import { IconArrowR } from './icons';
import { ReceiptRowActions } from './screens';

export type SortKey = 'newest' | 'oldest' | 'highest' | 'lowest';

export function ReceiptsScreen({
  receipts,
  onOpen,
  onDelete,
  onScan,
  searchRef,
}: {
  receipts: Receipt[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onScan: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [merchant, setMerchant] = useState('');

  const merchants = useMemo(
    () => Array.from(new Set(receipts.map((r) => r.merchant).filter(Boolean))).sort(),
    [receipts],
  );

  const filtered = useMemo(() => {
    const needle = cleanSearch(q).toLowerCase();
    let list = receipts.filter((r) => {
      if (merchant && r.merchant !== merchant) return false;
      if (!needle) return true;
      const hay = `${r.merchant} ${r.items.map((i) => i.name).join(' ')} ${r.date} ${r.total ?? ''}`.toLowerCase();
      return hay.includes(needle);
    });
    list = [...list].sort((a, b) => {
      if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt);
      if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt);
      if (sort === 'highest') return (b.total ?? 0) - (a.total ?? 0);
      return (a.total ?? 0) - (b.total ?? 0);
    });
    return list;
  }, [receipts, q, sort, merchant]);

  if (receipts.length === 0) {
    return (
      <div style={{ marginTop: 30 }}>
        <p className="kicker">Receipts</p>
        <EmptyState
          kicker="Ledger is empty"
          title="Your receipts will live here."
          body="Scan your first one to start the history. Photos stay on this device."
          action={
            <button className="text-link" onClick={onScan}>
              Scan a receipt <IconArrowR />
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 30 }}>
      <div className="recent-head">
        <p className="kicker">Receipts</p>
        <span className="mono meta">{String(receipts.length).padStart(2, '0')} SAVED</span>
      </div>
      <h1 className="h-section" style={{ marginTop: 12 }}>The ledger.</h1>

      <div className="toolbar" role="search">
        <input
          ref={searchRef}
          className="input"
          placeholder="Search shop, dish, date, amount…  ( / )"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search receipts"
          type="search"
        />
        <select
          className="select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort receipts"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="highest">Highest total</option>
          <option value="lowest">Lowest total</option>
        </select>
        <select
          className="select"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          aria-label="Filter by merchant"
        >
          <option value="">All merchants</option>
          {merchants.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          kicker="No match"
          title="Nothing matched that search."
          body="Try a different shop, dish, or amount — or scan a new receipt."
          action={
            <button className="text-link" onClick={() => { setQ(''); setMerchant(''); }}>
              Clear search <IconArrowR />
            </button>
          }
        />
      ) : (
        <div className="recent-list">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="recent-row"
              role="button"
              tabIndex={0}
              onClick={() => onOpen(r.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onOpen(r.id);
              }}
              aria-label={`Open receipt from ${r.merchant || 'unknown store'}, ${formatMoney(r.total, r.currency)}`}
            >
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
              <ReceiptRowActions onDelete={() => onDelete(r.id)} label={`Delete receipt from ${r.merchant || 'unknown store'}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
