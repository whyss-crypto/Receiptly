import { useCallback, useEffect, useRef, useState } from 'react';
import { OCR_STAGE_COPY, type OcrProgress } from '../lib/ocr';
import { checkUploadFile } from '../lib/security';
import { validateImageContent } from '../lib/images';
import { Modal } from './chrome';
import { IconArrowR, IconCamera, IconScan, IconUpload } from './icons';

export interface PickedImage {
  file: File;
  previewUrl: string;
}

export function usePasteImage(onPick: (f: File) => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const fn = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            onPick(new File([f], `pasted-${Date.now()}.png`, { type: f.type }));
          }
        }
      }
    };
    window.addEventListener('paste', fn);
    return () => window.removeEventListener('paste', fn);
  }, [onPick, active]);
}

export function Uploader({
  picked,
  onPick,
  onClear,
  onScan,
  onManual,
  busy,
  primaryLabel,
}: {
  picked: PickedImage | null;
  onPick: (f: File) => void;
  onClear: () => void;
  onScan: () => void;
  onManual: () => void;
  busy: boolean;
  primaryLabel?: string;
}) {
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const libRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const acceptFile = useCallback(
    async (f: File) => {
      setError(null);
      const check = checkUploadFile(f);
      if (!check.ok) {
        setError(check.reason ?? 'Unsupported file.');
        return;
      }
      try {
        await validateImageContent(f);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unreadable image.');
        return;
      }
      onPick(f);
    },
    [onPick],
  );

  usePasteImage(acceptFile, true);

  const openChoice = useCallback(() => setChoiceOpen(true), []);
  const chooseCamera = useCallback(() => {
    setChoiceOpen(false);
    // `capture="environment"` opens the rear camera directly on mobile.
    // Desktop browsers ignore the hint and show the file picker instead,
    // so gallery upload always remains available.
    requestAnimationFrame(() => camRef.current?.click());
  }, []);
  const chooseGallery = useCallback(() => {
    setChoiceOpen(false);
    requestAnimationFrame(() => libRef.current?.click());
  }, []);

  return (
    <div>
      <input
        ref={libRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        aria-hidden="true"
        tabIndex={-1}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void acceptFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-hidden="true"
        tabIndex={-1}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void acceptFile(f);
          e.target.value = '';
        }}
      />

      {choiceOpen && (
        <Modal title="Add a receipt photo" onClose={() => setChoiceOpen(false)}>
          <p className="meta" style={{ marginBottom: 14 }}>
            Snap it now with your camera, or pick a shot already in your gallery.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            <button className="btn btn-primary btn-block" onClick={chooseCamera}>
              <IconCamera /> Take a photo
            </button>
            <button className="btn btn-secondary btn-block" onClick={chooseGallery}>
              <IconUpload /> Choose from gallery
            </button>
            <button className="btn-quiet" onClick={() => setChoiceOpen(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {!picked ? (
        <div
          className={`tray${drag ? ' dragging' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Add a receipt photo. Opens camera or gallery options. You can also drag and drop or paste from clipboard."
          onClick={openChoice}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openChoice();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void acceptFile(f);
          }}
        >
          <span className="tray-icon" aria-hidden="true">
            <IconScan />
          </span>
          <p className="tray-title">Drop the slip here.</p>
          <p className="meta">JPG · PNG · WEBP · up to 10 MB · or paste (Ctrl+V)</p>
          <div className="tray-actions">
            <button
              className="btn btn-primary"
              onClick={(e) => {
                e.stopPropagation();
                openChoice();
              }}
            >
              Scan a receipt
            </button>
            <button
              className="text-link"
              onClick={(e) => {
                e.stopPropagation();
                libRef.current?.click();
              }}
            >
              browse files <IconArrowR />
            </button>
          </div>
        </div>
      ) : (
        <div className="pick-cols">
          <div>
            <img className="preview-img" src={picked.previewUrl} alt="Selected receipt preview" />
          </div>
          <div className="pick-meta">
            <p className="label">Selected photo</p>
            <div className="file-row">
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{picked.file.name}</span>
              <span>{(picked.file.size / 1024).toFixed(0)} KB</span>
            </div>
            <div className="file-row">
              <span>Original</span>
              <span>Kept for checking</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={onScan} disabled={busy}>
                {busy ? 'Reading…' : (primaryLabel ?? 'Read this receipt')}
              </button>
              <button className="text-link" onClick={onClear} disabled={busy}>
                Replace
              </button>
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn-quiet" onClick={onManual}>
                or enter it by hand
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="inline-alert error" role="alert">
          <strong>This file couldn't be processed. </strong>
          {error}{' '}
          <button className="btn-quiet" onClick={onManual}>
            Enter manually instead
          </button>
        </div>
      )}
    </div>
  );
}

export function ProcessingView({
  progress,
  previewUrl,
  onCancel,
}: {
  progress: OcrProgress;
  previewUrl: string | null;
  onCancel: () => void;
}) {
  const stageIndex =
    progress.stage === 'loading'
      ? 0
      : progress.stage === 'recognizing'
        ? progress.status.includes('line') || (progress.fraction ?? 0) > 0.35
          ? 1
          : 0
        : 3;
  const active = progress.stage === 'parsing' ? 3 : Math.min(2, stageIndex + (progress.fraction && progress.fraction > 0.7 ? 1 : 0));

  return (
    <div role="status" aria-live="polite" aria-label="Scanning receipt">
      <div className="proc-grid">
        <div className="proc-photo">
          {previewUrl ? (
            <img src={previewUrl} alt="Receipt being read" />
          ) : (
            <div style={{ display: 'grid', gap: 8, padding: 20 }}>
              <div className="skeleton" style={{ width: '70%' }} />
              <div className="skeleton" style={{ width: '45%' }} />
            </div>
          )}
          <div className="scanline" aria-hidden="true" />
        </div>
        <div>
          <p className="label">Reading</p>
          <h2 className="h-section" style={{ margin: '6px 0 4px', fontSize: 26 }}>{progress.status}</h2>
          <div className="stages">
            {OCR_STAGE_COPY.map((s, i) => (
              <div key={s} className={`stage${i < active ? ' done' : i === active ? ' active' : ''}`}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                {s}
                <span className="st">
                  {i < active ? '✓' : i === active && progress.fraction !== null ? `${Math.round(progress.fraction * 100)}%` : ''}
                </span>
              </div>
            ))}
          </div>
          <div className="progress-track" aria-hidden="true">
            <div
              className="progress-fill"
              style={{ width: progress.fraction !== null ? `${Math.round(progress.fraction * 100)}%` : '35%' }}
            />
          </div>
          <div style={{ marginTop: 18 }}>
            <button className="text-link" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OcrError({
  message,
  onRetry,
  onReplace,
  onManual,
  needsSignIn,
  onSignIn,
  signingIn,
}: {
  message: string;
  onRetry: () => void;
  onReplace: () => void;
  onManual: () => void;
  needsSignIn?: boolean;
  onSignIn?: () => void;
  signingIn?: boolean;
}) {
  return (
    <div>
      <p className="kicker">Reader failed</p>
      <h2 className="h-section" style={{ margin: '12px 0 8px' }}>We couldn't reliably read this receipt.</h2>
      <p className="meta" style={{ maxWidth: '56ch', marginBottom: 20 }}>
        {message} Shaky, dark, or crumpled photos trip up the reader most often.
      </p>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        {needsSignIn && onSignIn ? (
          <button className="btn btn-primary" onClick={onSignIn} disabled={signingIn}>
            {signingIn ? 'Signing in…' : 'Sign in with Puter'}
          </button>
        ) : null}
        <button className="btn btn-primary" onClick={onRetry}>
          Scan again
        </button>
        <button className="text-link" onClick={onReplace}>
          Upload another photo
        </button>
        <button className="text-link" onClick={onManual}>
          Enter manually
        </button>
      </div>
    </div>
  );
}
