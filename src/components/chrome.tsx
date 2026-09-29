import { useEffect, useState, type JSX } from 'react';
import type { Toast, View } from '../types';
import {
  IconHome,
  IconMenu,
  IconMoon,
  IconQuestion,
  IconScan,
  IconSliders,
  IconSplit,
  IconStack,
  IconSun,
  IconX,
} from './icons';

export function SkipLink() {
  return (
    <a className="skip-link" href="#main">
      Skip to content
    </a>
  );
}

const NAV: Array<{ id: View; label: string; Icon: () => JSX.Element }> = [
  { id: 'home', label: 'Home', Icon: IconHome },
  { id: 'receipts', label: 'Receipts', Icon: IconStack },
  { id: 'split', label: 'Split', Icon: IconSplit },
  { id: 'settings', label: 'Settings', Icon: IconSliders },
];

export function Header({
  view,
  go,
  onOpenMenu,
  onToggleTheme,
  theme,
  onShowKeys,
}: {
  view: View;
  go: (v: View) => void;
  onOpenMenu: () => void;
  onToggleTheme: () => void;
  theme: string;
  onShowKeys: () => void;
}) {
  return (
    <header className="site-header">
      <div className="container">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go('home');
          }}
          aria-label="Receiptly home"
        >
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <span className="brand-word">RECEIPTLY</span>
        </a>
        <nav className="topnav" aria-label="Primary">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => go(n.id)} aria-current={view === n.id ? 'page' : undefined}>
              {n.label}
            </button>
          ))}
        </nav>
        <span className="header-spacer" />
        <button
          className="icon-btn"
          onClick={onShowKeys}
          aria-label="Keyboard shortcuts (press ?)"
          title="Keyboard shortcuts (?)"
        >
          <IconQuestion />
        </button>
        <button
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title="Toggle theme"
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => go('scan')}
          aria-current={view === 'scan' ? 'page' : undefined}
        >
          Scan +
        </button>
        <button className="icon-btn menu-btn" onClick={onOpenMenu} aria-label="Open menu" aria-haspopup="dialog">
          <IconMenu />
        </button>
      </div>
    </header>
  );
}

export function MobileMenu({
  view,
  go,
  onClose,
}: {
  view: View;
  go: (v: View) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const items: Array<{ id: View; label: string }> = [
    { id: 'home', label: 'Home' },
    { id: 'scan', label: 'Scan a receipt' },
    { id: 'split', label: 'Split a bill' },
    { id: 'receipts', label: 'Receipts' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <nav className="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong className="brand-word">RECEIPTLY</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Close menu">
            <IconX />
          </button>
        </div>
        {items.map((n) => (
          <button
            key={n.id}
            className="menu-link"
            aria-current={view === n.id ? 'page' : undefined}
            onClick={() => {
              go(n.id);
              onClose();
            }}
          >
            {n.label}
          </button>
        ))}
        <p className="meta" style={{ marginTop: 16 }}>
          OCR does the tedious work — you stay in control.
        </p>
      </nav>
    </>
  );
}

export function TabBar({ view, go }: { view: View; go: (v: View) => void }) {
  return (
    <nav className="tabbar" aria-label="Primary">
      <button className="tab" onClick={() => go('home')} aria-current={view === 'home' ? 'page' : undefined}>
        <IconHome />
        Home
      </button>
      <button
        className="tab tab-scan"
        onClick={() => go('scan')}
        aria-current={view === 'scan' ? 'page' : undefined}
        aria-label="Scan a receipt"
      >
        <span className="scan-block" aria-hidden="true">
          <IconScan />
        </span>
        Scan
      </button>
      <button className="tab" onClick={() => go('receipts')} aria-current={view === 'receipts' ? 'page' : undefined}>
        <IconStack />
        Receipts
      </button>
      <button className="tab" onClick={() => go('split')} aria-current={view === 'split' ? 'page' : undefined}>
        <IconSplit />
        Split
      </button>
      <button className="tab" onClick={() => go('settings')} aria-current={view === 'settings' ? 'page' : undefined}>
        <IconSliders />
        Settings
      </button>
    </nav>
  );
}

/** Compact editorial empty state — no box, no decoration. */
export function EmptyState({
  kicker,
  title,
  body,
  action,
}: {
  kicker: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-simple">
      <p className="kicker no-rule">{kicker}</p>
      <h3 style={{ marginTop: 10 }}>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  actions?: React.ReactNode;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  return (
    <div className="modal-wrap">
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div>{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function ToastStack({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <span className="mono" aria-hidden="true">
            {t.tone === 'err' ? '!' : t.tone === 'warn' ? 'i' : '✓'}
          </span>
          <span style={{ flex: 1 }}>
            <strong>{t.title}</strong>
            {t.body ? <span style={{ opacity: 0.8 }}> — {t.body}</span> : null}
          </span>
          {t.actionLabel && (
            <button
              onClick={() => {
                t.onAction?.();
                dismiss(t.id);
              }}
            >
              {t.actionLabel}
            </button>
          )}
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
            <IconX />
          </button>
        </div>
      ))}
    </div>
  );
}

export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const fn = () => setShow(window.scrollY > 600);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  if (!show) return null;
  return (
    <button
      className="icon-btn to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
    >
      ↑
    </button>
  );
}

export function Faq() {
  const items: Array<[string, string]> = [
    [
      'How accurate is receipt scanning?',
      'Good on clean prints, shaky on crumpled or faded slips. Every uncertain line is flagged so you can fix it in seconds — nothing is silently trusted.',
    ],
    [
      'Where do my receipt photos go?',
      'They stay in this browser — receipts in local storage, photos in a private on-device database. Reading runs on your device. Delete a receipt and its photo goes with it.',
    ],
    [
      'What if a scan fails completely?',
      'You never lose your place. Retry the scan, pick a clearer photo, or enter it by hand — manual entries use the same format as scanned ones.',
    ],
    [
      'Why can totals disagree?',
      'Receipts round, discount before or after tax, or the reader misreads a digit. When the printed total and the line-item math differ, both are shown and you pick. Your numbers are never overwritten.',
    ],
  ];
  return (
    <div className="faq-list">
      {items.map(([q, a]) => (
        <details className="faq" key={q}>
          <summary>
            {q} <span className="pm" aria-hidden="true">+</span>
          </summary>
          <p className="a">{a}</p>
        </details>
      ))}
    </div>
  );
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const rows: Array<[string, string]> = [
    ['N', 'New receipt scan'],
    ['B', 'Split a bill'],
    ['/', 'Focus search in Receipts'],
    ['Esc', 'Close dialog / menu'],
    ['Ctrl/⌘ + S', 'Save receipt while reviewing'],
    ['?', 'Show this shortcut list'],
  ];
  return (
    <Modal
      title="Keyboard shortcuts"
      onClose={onClose}
      actions={
        <button className="btn btn-secondary btn-sm" onClick={onClose}>
          Done
        </button>
      }
    >
      <table className="keys-table">
        <tbody>
          {rows.map(([k, d]) => (
            <tr key={k}>
              <td>
                <kbd className="k">{k}</kbd>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
