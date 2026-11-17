import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/** Loads JSON from the API with loading / error state and a reload function. */
export function useApi<T = any>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const ctrl = useRef<AbortController | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!url) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const r = await api.get<T>(url, c.signal);
      if (!c.signal.aborted) setData(r);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(err);
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  useEffect(() => {
    load();
    return () => ctrl.current?.abort();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

/** Wraps an async action with busy / error state. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn(...args);
    } catch (err) {
      setError(err);
      return undefined;
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn]);
  return { run, busy, error, setError };
}

export interface Surah { number: number; name_ar: string; name_en: string; ayah_count: number }
let surahCache: Promise<Surah[]> | null = null;

export function useSurahs() {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  useEffect(() => {
    if (!surahCache) surahCache = api.get<{ surahs: Surah[] }>('/quran/surahs').then((r) => r.surahs).catch((e) => { surahCache = null; throw e; });
    surahCache.then(setSurahs).catch(() => undefined);
  }, []);
  return surahs;
}
