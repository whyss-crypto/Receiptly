import { useCallback, useEffect, useRef, useState } from 'react';
import type { Receipt, View } from './types';
import { newId } from './types';
import { useTheme, useToasts } from './hooks';
import { loadReceipts, saveReceipts, upsertReceipt } from './lib/store';
import { deleteImage, getImage, putImage } from './lib/db';
import { fileToStoredImage } from './lib/images';
import { type OcrProgress } from './lib/ocr';
import { scanReceipt, type OcrProviderName } from './lib/ocr/index';
import { signInWithPuter } from './lib/ocr/puter';
import { blankReceipt, draftFromStructured } from './lib/parser';
import { randomImageKey } from './lib/security';
import { currencyToCode, formatMoney } from './lib/format';
import {
  BackToTop,
  Header,
  MobileMenu,
  Modal,
  ShortcutsDialog,
  SkipLink,
  TabBar,
  ToastStack,
} from './components/chrome';
import { OcrError, ProcessingView, Uploader, type PickedImage } from './components/scan';
import { ReceiptEditor } from './components/review';
import { ReceiptsScreen } from './components/history';
import { HomeScreen, SettingsScreen } from './components/screens';
import { EMPTY_SPLIT_SEED, SplitScreen, type SplitSeed } from './components/split';
import { IconArrowL } from './components/icons';

type ScanPhase = 'pick' | 'processing' | 'error';

export default function App() {
  const { theme, setTheme } = useTheme();
  const { toasts, push, dismiss } = useToasts();

  const [receipts, setReceipts] = useState<Receipt[]>(() => loadReceipts());
  const [view, setView] = useState<View>('home');

  // Scan state
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [phase, setPhase] = useState<ScanPhase>('pick');
  const [progress, setProgress] = useState<OcrProgress>({ stage: 'loading', fraction: null, status: 'Scanning receipt' });
  const [scanError, setScanError] = useState('');
  const [scanErrorCode, setScanErrorCode] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [lastProvider, setLastProvider] = useState<OcrProviderName | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const cancelRef = useRef(false);

  // Review draft state
  const [draft, setDraft] = useState<Receipt | null>(null);
  const [draftImage, setDraftImage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Bill splitter entry seed (receipt total pre-fill or blank manual start)
  const [splitSeed, setSplitSeed] = useState<SplitSeed>(EMPTY_SPLIT_SEED);
  const [splitKey, setSplitKey] = useState(0);

  // Misc UI
  const [menuOpen, setMenuOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Receipt | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<{ r: Receipt; index: number } | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const go = useCallback((v: View) => {
    setView(v);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    try {
      saveReceipts(receipts);
    } catch (e) {
      push({ title: 'Could not save to device', body: e instanceof Error ? e.message : undefined, tone: 'err' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipts]);

  const setPickedFile = useCallback((f: File) => {
    setPicked((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setPicked({ file: f, previewUrl: URL.createObjectURL(f) });
    setPhase('pick');
    setScanError('');
  }, []);

  const clearPicked = useCallback(() => {
    setPicked((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setPhase('pick');
    setScanError('');
    setReplaceMode(false);
  }, []);

  /* ---------- OCR run (Puter pipeline via single scanReceipt abstraction) ---------- */
  const runScan = useCallback(async () => {
    if (!picked) return;
    cancelRef.current = false;
    setPhase('processing');
    setScanErrorCode('');
    setProgress({ stage: 'loading', fraction: null, status: 'Scanning receipt' });
    try {
      const stored = await fileToStoredImage(picked.file);
      if (cancelRef.current) return;
      // Single abstraction: validate -> preprocess -> Puter OCR -> parse -> validate.
      const result = await scanReceipt(picked.file, (p) => {
        if (!cancelRef.current) setProgress(p);
      });
      if (cancelRef.current) return;
      setProgress({ stage: 'parsing', fraction: null, status: 'Preparing your expense' });
      const { draft: fields, warnings } = draftFromStructured(result.structured, result.rawText, {
        meanConfidence: result.meanConfidence,
      });
      const now = new Date().toISOString();
      const receipt: Receipt = {
        ...fields,
        id: newId('rcpt'),
        imageId: null,
        thumbnail: stored.thumb,
        createdAt: now,
        updatedAt: now,
      };
      setDraft(receipt);
      setDraftImage(stored.full);
      setLastProvider(result.provider);
      setEditingId(null);
      setPhase('pick');
      setReplaceMode(false);
      go('review');
      warnings.forEach((w) => push({ title: w, tone: 'warn' }));
      if (receipt.needsReview.length > 0) {
        push({ title: `${receipt.needsReview.length} line${receipt.needsReview.length > 1 ? 's' : ''} flagged for a quick check`, tone: 'warn' });
      }
    } catch (e) {
      if (cancelRef.current) return;
      const code = e instanceof Error ? e.message : 'ocr-failed';
      setPhase('error');
      setScanErrorCode(code);
      setScanError(
        code === 'empty-ocr'
          ? 'The page looked blank to the reader.'
          : code === 'puter-auth-required'
            ? 'Puter sign-in is needed before the first scan (the OCR is billed to your Puter account, not to this app).'
            : code === 'puter-rate-limited'
              ? 'The OCR service is rate-limited right now. Wait a minute and try again.'
              : code === 'ocr-too-large'
                ? 'That photo is too large for the reader even after compression. Try a smaller file.'
                : code === 'ocr-offline'
                  ? 'The network reader is unreachable — check your connection and try again.'
                  : code === 'ocr-timeout'
                    ? 'The reader took too long and gave up. Try again on a steadier connection.'
                  : code === 'puter-unavailable' || code === 'ocr-engine-unavailable'
                    ? 'The reader could not start (you may be offline).'
                    : e instanceof Error && e.message.startsWith('“')
                      ? e.message
                      : 'Something interrupted the read.',
      );
    }
  }, [picked, go, push]);

  const handlePuterSignIn = useCallback(async () => {
    setSigningIn(true);
    try {
      await signInWithPuter();
      push({ title: 'Signed in — scanning again', tone: 'ok' });
      await runScan();
    } catch {
      push({ title: 'Sign-in did not complete', tone: 'err' });
    } finally {
      setSigningIn(false);
    }
  }, [runScan, push]);

  /* ---------- Manual entry ---------- */
  const startManual = useCallback(() => {
    const now = new Date().toISOString();
    setDraft({ ...blankReceipt('₹'), id: newId('rcpt'), imageId: null, thumbnail: null, createdAt: now, updatedAt: now });
    setDraftImage(null);
    setEditingId(null);
    clearPicked();
    go('review');
  }, [clearPicked, go]);

  /* ---------- Open saved ---------- */
  const openReceipt = useCallback(
    async (id: string) => {
      const r = receipts.find((x) => x.id === id);
      if (!r) return;
      setDraft({ ...r });
      setEditingId(id);
      setDraftImage(null);
      go('review');
      if (r.imageId) {
        try {
          const img = await getImage(r.imageId);
          setDraftImage(img);
        } catch {
          push({ title: 'Photo unavailable on this device', tone: 'warn' });
        }
      }
    },
    [receipts, go, push],
  );

  /* ---------- Save ---------- */
  const saveDraft = useCallback(async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      let imageId = draft.imageId;
      const thumb = draft.thumbnail;
      if (draftImage && !editingId) {
        imageId = randomImageKey('jpg');
        await putImage(imageId, draftImage);
      } else if (draftImage && editingId && draft.imageId) {
        imageId = draft.imageId;
      }
      const now = new Date().toISOString();
      const saved: Receipt = {
        ...draft,
        imageId,
        thumbnail: thumb,
        updatedAt: now,
        createdAt: editingId ? draft.createdAt : now,
      };
      setReceipts((prev) => upsertReceipt(prev, saved));
      const count = saved.items.length;
      push({
        title: 'Receipt saved',
        body: `${count} item${count === 1 ? '' : 's'} · ${formatMoney(saved.total, saved.currency)}`,
        tone: 'ok',
        actionLabel: 'View',
        onAction: () => openReceipt(saved.id),
      });
      setPicked((prev) => {
        if (prev) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
      setPhase('pick');
      setDraft(null);
      setDraftImage(null);
      setEditingId(null);
      go('receipts');
    } catch (e) {
      push({ title: 'Save failed — your edits are kept', body: e instanceof Error ? e.message : undefined, tone: 'err' });
    } finally {
      setSaving(false);
    }
  }, [draft, draftImage, editingId, saving, go, openReceipt, push]);

  const discardDraft = useCallback(() => {
    setDraft(null);
    setDraftImage(null);
    setEditingId(null);
    go(editingId ? 'receipts' : 'scan');
  }, [editingId, go]);

  /* ---------- Replace photo (verification aid, no re-OCR) ---------- */
  const beginReplace = useCallback(() => {
    setReplaceMode(true);
    go('scan');
  }, [go]);

  const applyReplacedPhoto = useCallback(async () => {
    if (!picked || !draft) return;
    try {
      const stored = await fileToStoredImage(picked.file);
      if (editingId && draft.imageId) {
        await putImage(draft.imageId, stored.full);
      }
      setDraftImage(stored.full);
      setDraft({ ...draft, thumbnail: stored.thumb, updatedAt: new Date().toISOString() });
      clearPicked();
      push({ title: 'Photo updated', tone: 'ok' });
      go('review');
    } catch (e) {
      push({ title: 'Photo not updated', body: e instanceof Error ? e.message : undefined, tone: 'err' });
    }
  }, [picked, draft, editingId, clearPicked, go, push]);

  /* ---------- Delete with undo ---------- */
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const idx = receipts.findIndex((r) => r.id === deleteTarget.id);
    setReceipts((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    setLastDeleted({ r: deleteTarget, index: Math.max(0, idx) });
    setDeleteTarget(null);
    push({
      title: 'Receipt deleted',
      tone: 'warn',
      actionLabel: 'Undo',
      onAction: () => {
        setLastDeleted((ld) => {
          if (ld) {
            setReceipts((prev) => {
              const next = [...prev];
              next.splice(Math.min(ld.index, next.length), 0, ld.r);
              return next;
            });
          }
          return null;
        });
      },
    });
    window.setTimeout(() => {
      setLastDeleted((ld) => {
        if (ld && ld.r.id === deleteTarget.id && ld.r.imageId) {
          void deleteImage(ld.r.imageId).catch(() => undefined);
        }
        return ld && ld.r.id === deleteTarget.id ? null : ld;
      });
    }, 8000);
  }, [deleteTarget, receipts, push]);

  /* ---------- Copy summary ---------- */
  const copySummary = useCallback(() => {
    if (!draft) return;
    const lines = [
      `${draft.merchant || 'Receipt'} — ${draft.date}`,
      ...draft.items.map(
        (i) => `${i.name} ×${i.quantity} @ ${formatMoney(i.unitPrice, draft.currency)} = ${formatMoney(i.totalPrice, draft.currency)}`,
      ),
      `Total: ${formatMoney(draft.total, draft.currency)}`,
    ];
    const text = lines.join('\n');
    const done = () => push({ title: 'Copied', body: 'Expense summary is on your clipboard.', tone: 'ok' });
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => push({ title: 'Copy failed', tone: 'err' }));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        done();
      } catch {
        push({ title: 'Copy failed', tone: 'err' });
      }
      ta.remove();
    }
  }, [draft, push]);

  /* ---------- Export / clear ---------- */
  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(receipts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'receipts-backup.json';
    // Attached to the DOM: Safari ignores clicks on detached anchors.
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    push({ title: 'Copied', body: `${receipts.length} receipts exported.`, tone: 'ok' });
  }, [receipts, push]);

  const clearAll = useCallback(async () => {
    const ids = receipts.map((r) => r.imageId).filter((x): x is string => !!x);
    setReceipts([]);
    setConfirmClear(false);
    await Promise.all(ids.map((k) => deleteImage(k).catch(() => undefined)));
    push({ title: 'Everything deleted', body: 'Receipts and photos removed from this browser.', tone: 'warn' });
  }, [receipts, push]);

  /* ---------- Bill splitter entries ---------- */
  const openManualSplit = useCallback(() => {
    setSplitSeed(EMPTY_SPLIT_SEED);
    setSplitKey((k) => k + 1);
    go('split');
  }, [go]);

  const openSplitFromReceipt = useCallback(() => {
    if (!draft || draft.total === null) return;
    const code = currencyToCode(draft.currency);
    const lowConf =
      draft.ocrMeanConfidence !== null && draft.ocrMeanConfidence < 55 && !draft.totalLocked;
    setSplitSeed({
      amountMajor: String(draft.total),
      currency: code,
      source: draft.merchant || 'this receipt',
      lowConfidence: lowConf,
      detectedTotal: formatMoney(draft.total, draft.currency),
    });
    setSplitKey((k) => k + 1);
    go('split');
  }, [draft, go]);

  /* ---------- Keyboard shortcuts ---------- */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (view === 'review' && draft) {
          e.preventDefault();
          void saveDraft();
        }
        return;
      }
      if (typing) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        clearPicked();
        go('scan');
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        openManualSplit();
      } else if (e.key === '/') {
        e.preventDefault();
        if (view !== 'receipts') go('receipts');
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (e.key === '?') {
        setKeysOpen(true);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [view, draft, go, clearPicked, saveDraft, openManualSplit]);

  return (
    <div className="shell">
      <SkipLink />
      <Header
        view={view}
        go={go}
        onOpenMenu={() => setMenuOpen(true)}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        theme={theme}
        onShowKeys={() => setKeysOpen(true)}
      />
      {menuOpen && <MobileMenu view={view} go={go} onClose={() => setMenuOpen(false)} />}

      <main id="main" tabIndex={-1}>
        <div className="container">
          {view === 'home' && (
            <HomeScreen
              receipts={receipts}
              onScan={() => { clearPicked(); go('scan'); }}
              onUpload={() => { clearPicked(); go('scan'); }}
              onOpen={(id) => void openReceipt(id)}
              onManual={startManual}
              onSplit={openManualSplit}
            />
          )}

          {view === 'scan' && (
            <div>
              <div className="page-head">
                <p className="kicker">{replaceMode ? 'Replace photo' : 'New scan'}</p>
                <h1>{replaceMode ? 'Swap the slip.' : 'Scan it.'}</h1>
                <p className="meta" style={{ marginTop: 8 }}>
                  {replaceMode
                    ? 'Pick a clearer shot — it becomes the new reference photo.'
                    : 'Flat slip, good light. That matters more than anything else.'}
                </p>
              </div>

              {phase === 'processing' ? (
                <ProcessingView
                  progress={progress}
                  previewUrl={picked?.previewUrl ?? null}
                  onCancel={() => {
                    cancelRef.current = true;
                    setPhase('pick');
                  }}
                />
              ) : phase === 'error' ? (
                <OcrError
                  message={scanError}
                  onRetry={() => void runScan()}
                  onReplace={clearPicked}
                  onManual={startManual}
                  needsSignIn={scanErrorCode === 'puter-auth-required'}
                  onSignIn={() => void handlePuterSignIn()}
                  signingIn={signingIn}
                />
              ) : (
                <Uploader
                  picked={picked}
                  onPick={setPickedFile}
                  onClear={clearPicked}
                  onScan={() => {
                    if (replaceMode) void applyReplacedPhoto();
                    else void runScan();
                  }}
                  onManual={startManual}
                  busy={false}
                  primaryLabel={replaceMode ? 'Use this photo' : undefined}
                />
              )}
              {replaceMode && draft && (
                <div style={{ marginTop: 16 }}>
                  <button className="btn-quiet" onClick={() => { setReplaceMode(false); go('review'); }}>
                    ← Back to review without changing
                  </button>
                </div>
              )}
            </div>
          )}

          {view === 'review' && draft && (
            <div>
              <button className="back-link" onClick={discardDraft}>
                <IconArrowL /> {editingId ? 'Receipts' : 'Scan'}
              </button>
              <ReceiptEditor
                draft={draft}
                setDraft={setDraft}
                imageSrc={draftImage}
                onReplaceImage={beginReplace}
                onSave={() => void saveDraft()}
                onDiscard={discardDraft}
                onCopySummary={copySummary}
                saving={saving}
                heading={editingId ? 'Edit receipt' : 'Review receipt'}
                providerLabel={
                  lastProvider && !editingId
                    ? lastProvider === 'puter-mistral'
                      ? 'Read with Puter OCR · Mistral'
                      : lastProvider === 'puter-aws-textract'
                        ? 'Read with Puter OCR · Textract'
                        : 'Read on-device'
                    : null
                }
                onRescan={
                  editingId
                    ? undefined
                    : () => {
                        clearPicked();
                        setLastProvider(null);
                        go('scan');
                      }
                }
                onSplit={draft.total !== null ? openSplitFromReceipt : undefined}
              />
            </div>
          )}

          {view === 'receipts' && (
            <ReceiptsScreen
              receipts={receipts}
              onOpen={(id) => void openReceipt(id)}
              onDelete={(id) => {
                const r = receipts.find((x) => x.id === id);
                if (r) setDeleteTarget(r);
              }}
              onScan={() => { clearPicked(); go('scan'); }}
              searchRef={searchRef}
            />
          )}

          {view === 'settings' && (
            <SettingsScreen
              theme={theme}
              onTheme={setTheme}
              receiptCount={receipts.length}
              onExport={exportJson}
              onClearAll={() => setConfirmClear(true)}
            />
          )}

          {view === 'split' && (
            <SplitScreen key={splitKey} seed={splitSeed} />
          )}
        </div>
      </main>

      <footer className="site-footer">
        <div className="container foot-grid">
          <div>
            <p className="brand-word" style={{ fontSize: 15 }}>RECEIPTLY</p>
            <p className="meta" style={{ marginTop: 6 }}>
              OCR does the tedious work. You stay in control.
            </p>
          </div>
          <nav className="foot-links" aria-label="Footer">
            <button onClick={() => go('scan')}>Scan</button>
            <button onClick={() => go('split')}>Split</button>
            <button onClick={() => go('receipts')}>Receipts</button>
            <button onClick={() => go('settings')}>Settings</button>
            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Top ↑</button>
          </nav>
        </div>
      </footer>

      <TabBar view={view} go={go} />
      <BackToTop />
      <ToastStack toasts={toasts} dismiss={dismiss} />

      {deleteTarget && (
        <Modal
          title="Delete this receipt?"
          onClose={() => setDeleteTarget(null)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>
                Keep it
              </button>
              <button className="btn btn-danger" onClick={() => void confirmDelete()}>
                Delete receipt
              </button>
            </>
          }
        >
          <p className="meta">
            “{deleteTarget.merchant || 'Untitled receipt'}” ·{' '}
            {formatMoney(deleteTarget.total, deleteTarget.currency)} · its photo will be removed from
            this device too. You can undo right after.
          </p>
        </Modal>
      )}

      {confirmClear && (
        <Modal
          title="Delete everything?"
          onClose={() => setConfirmClear(false)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => void clearAll()}>
                Delete all data
              </button>
            </>
          }
        >
          <p className="meta">
            This removes all {receipts.length} receipts and their photos from this browser. This
            cannot be undone.
          </p>
        </Modal>
      )}

      {keysOpen && <ShortcutsDialog onClose={() => setKeysOpen(false)} />}
    </div>
  );
}
