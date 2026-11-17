/** Date / time formatting: Hijri (Umm al-Qura) and Gregorian, as in the current forms (NFR "Dates"). */
import type { Locale } from '../i18n';

const TZ = 'Asia/Riyadh';

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  // 'YYYY-MM-DD' (date only) -> noon to avoid timezone day shifts
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00+03:00` : v);
}

export function gregorian(v: string | Date | null | undefined, locale: Locale, withTime = false) {
  const d = toDate(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', {
    timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(d);
}

export function hijri(v: string | Date | null | undefined, locale: Locale) {
  const d = toDate(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat(`${locale === 'ar' ? 'ar-SA' : 'en'}-u-ca-islamic-umalqura-nu-latn`, {
    timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric',
  }).format(d);
}

/** "12 Nov 2026 · 21 Jumada I 1448" */
export function dual(v: string | Date | null | undefined, locale: Locale, withTime = false) {
  const d = toDate(v);
  if (!d) return '—';
  return `${gregorian(d, locale, withTime)} · ${hijri(d, locale)}`;
}

export function timeOnly(v: string | Date | null | undefined, locale: Locale) {
  const d = toDate(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);
}

/** Seconds -> m:ss or h:mm:ss */
export function clock(totalSeconds: number | null | undefined) {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds)) return '0:00';
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Parses "m:ss", "h:mm:ss" or plain seconds. Returns null when invalid. */
export function parseClock(input: string): number | null {
  const v = input.trim();
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
  const parts = v.split(':').map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return null;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function relative(v: string | Date | null | undefined, locale: Locale) {
  const d = toDate(v);
  if (!d) return '';
  const diff = (d.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

/** Downloads rows as a UTF-8 CSV (with BOM so Excel shows Arabic correctly). */
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
