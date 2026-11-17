import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ar } from './ar';
import { en } from './en';
import { ApiError } from '../lib/api';

export type Locale = 'ar' | 'en';
const dicts = { ar, en };

function lookup(obj: any, path: string): unknown {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function interpolate(s: string, params?: Record<string, unknown>) {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] === undefined || params[k] === null ? '' : String(params[k])));
}

interface I18n {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
  /** Returns a raw dictionary node (arrays / objects). */
  tr: <T = unknown>(key: string) => T;
  errorText: (err: unknown) => string;
}

const Ctx = createContext<I18n | null>(null);

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem('mushafs.locale');
    if (saved === 'ar' || saved === 'en') return saved;
  } catch { /* storage unavailable */ }
  return 'ar';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem('mushafs.locale', l); } catch { /* ignore */ }
  }, []);

  const value = useMemo<I18n>(() => {
    const dict = dicts[locale];
    const t = (key: string, params?: Record<string, unknown>) => {
      const v = lookup(dict, key) ?? lookup(en, key);
      return typeof v === 'string' ? interpolate(v, params) : key;
    };
    const tr = <T,>(key: string) => (lookup(dict, key) ?? lookup(en, key)) as T;
    const errorText = (err: unknown) => {
      if (err instanceof ApiError) {
        const known = lookup(dict, `errors.${err.code}`);
        if (typeof known === 'string') return known;
        if (err.status === 403) return t('errors.forbidden');
        if (err.status === 404) return t('errors.not_found');
        return err.message || t('common.error');
      }
      return t('common.error');
    };
    return { locale, dir, setLocale, t, tr, errorText };
  }, [locale, dir, setLocale]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside provider');
  return v;
}
