import { useCallback, useEffect, useState } from 'react';
import type { Toast } from './types';
import { newId } from './types';

export type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('receiptly.theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('receiptly.theme', theme);
  }, [theme]);

  // Follow OS changes until the user picks explicitly (persisted above).
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const fn = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('receiptly.theme-locked')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mq.addEventListener?.('change', fn);
    return () => mq.removeEventListener?.('change', fn);
  }, []);

  const setLocked = useCallback((t: Theme) => {
    localStorage.setItem('receiptly.theme-locked', '1');
    setTheme(t);
  }, []);

  return { theme, setTheme: setLocked };
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = newId('toast');
      setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.onAction ? 7000 : 4200);
      return id;
    },
    [dismiss],
  );
  return { toasts, push, dismiss };
}
