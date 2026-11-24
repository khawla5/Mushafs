import { useI18n } from '../i18n';
import { ALL_RIWAYAT, COMMON_RIWAYAT, RIWAYAT_GROUPS } from '../lib/riwayat';

/**
 * Riwayah picker: the four most widespread riwayat first (no heading), then all twenty grouped under the ten imams.
 * A stored value that is not in the list (older projects, hadith delivery) is kept as an extra option.
 */
export function RiwayahSelect({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const { t, locale } = useI18n();
  const label = (r: { value: string; en: string }) => (locale === 'ar' ? r.value : `${r.en} — ${r.value}`);
  const known = ALL_RIWAYAT.some((r) => r.value === value);
  return (
    <select className={`input${invalid ? ' invalid' : ''}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {!known && value && <option value={value}>{value}</option>}
      {COMMON_RIWAYAT.map((r) => <option key={`c-${r.value}`} value={r.value}>{label(r)}</option>)}
      {RIWAYAT_GROUPS.map((g) => (
        <optgroup key={g.imam_ar} label={locale === 'ar' ? `${t('projects.riwayah_imam')} ${g.imam_ar}` : `${g.imam_en} (${g.imam_ar})`}>
          {g.riwayat.map((r) => <option key={r.value} value={r.value}>{label(r)}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
