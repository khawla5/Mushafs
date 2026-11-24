import { useState } from 'react';
import { Async, Empty } from '../../components/ui';
import { useI18n } from '../../i18n';
import { auditAr, auditEn } from '../../i18n/audit';
import { dual } from '../../lib/format';
import { useApi } from '../../lib/hooks';

const ENTITIES = ['', 'project', 'session', 'note', 'round', 'correction', 'user', 'settings', 'version', 'excuse', 'distribution', 'quality_rating', 'note_type'];
const PAGE = 50;

/** ADM-03: audit log of every change and decision, shown in the interface language. */
export function AuditPage() {
  const { t, locale } = useI18n();
  const A = locale === 'ar' ? auditAr : auditEn;
  const [entity, setEntity] = useState('');
  const [offset, setOffset] = useState(0);
  const state = useApi<any>(`/audit?limit=${PAGE}&offset=${offset}${entity ? `&entity=${entity}` : ''}`);

  const lookup = (table: Record<string, string>, key: string) => table[key] ?? key;
  const entityName = (e: string) => lookup(A.entities, e);
  const actionName = (a: string) => lookup(A.actions, a);

  /** Translates one detail value according to its field. */
  const value = (key: string, v: unknown, action: string): string => {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'boolean') return v ? A.yes : A.no;
    if (Array.isArray(v)) {
      if (key === 'roles') return v.map((r) => t(`roles.${r}`)).join('، ');
      if (key === 'fields') return v.map((f) => lookup(A.keys, String(f))).join('، ');
      if (key === 'parts') return String(v.length);
      if (key === 'recording_weekdays') return v.map((d) => t(`weekdays.${d}`)).join('، ');
      return v.join('، ');
    }
    if (typeof v === 'object') return '';
    const s = String(v);
    switch (key) {
      case 'role': case 'team_role': return t(`team_roles.${s}`);
      case 'outcome': return t(`outcome.${s}`);
      case 'decision': return t(`decision.${s}`);
      case 'verdict': return t(`quality.${s}`);
      case 'status': return t(`attendance.${s}`);
      case 'type': return t(`project_type.${s}`);
      case 'kind': return t(`session.${s}`);
      case 'split': return t(`final.${s}`);
      case 'result': return lookup(A.result, s);
      case 'reason': return action === 'version_uploaded' ? lookup(A.upload_reason, s) : s;
      case 'locale': return s === 'ar' ? 'العربية' : 'English';
      default: return s;
    }
  };

  /** Readable "label: value · label: value" text instead of raw JSON. */
  const details = (e: any) => {
    if (!e.details || typeof e.details !== 'object') return '';
    return Object.entries(e.details as Record<string, unknown>)
      .map(([k, v]) => {
        const val = value(k, v, e.action);
        if (!val) return null;
        // settings_updated: keys are setting names
        const label = e.action === 'settings_updated' ? t(`settings.${k}`) : lookup(A.keys, k);
        return `${label}: ${val}`;
      })
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <>
      <div className="page-head">
        <h1>{t('audit.title')}</h1>
        <select className="input" style={{ maxWidth: 220 }} value={entity} onChange={(e) => { setEntity(e.target.value); setOffset(0); }} aria-label={t('audit.entity')}>
          {ENTITIES.map((x) => <option key={x} value={x}>{x ? entityName(x) : t('common.all')}</option>)}
        </select>
      </div>
      <Async state={state}>
        {(d) => d.entries.length ? (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('audit.time')}</th><th>{t('audit.user')}</th><th>{t('audit.action')}</th><th>{t('audit.entity')}</th><th className="hide-sm">{t('audit.details')}</th></tr></thead>
                <tbody>
                  {d.entries.map((e: any) => (
                    <tr key={e.id}>
                      <td className="num" style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{dual(e.created_at, locale, true)}</td>
                      <td>{e.user_name ?? '—'}</td>
                      <td>{actionName(e.action)}</td>
                      <td>{entityName(e.entity)}{e.entity_id ? <span className="num"> #{e.entity_id}</span> : ''}</td>
                      <td className="hide-sm" style={{ fontSize: '0.8rem', maxWidth: 420, wordBreak: 'break-word' }}>{details(e)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
              <button className="btn btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>‹</button>
              <span className="muted num">{offset + 1}–{Math.min(offset + PAGE, d.total)} / {d.total}</span>
              <button className="btn btn-sm" disabled={offset + PAGE >= d.total} onClick={() => setOffset(offset + PAGE)}>›</button>
            </div>
          </>
        ) : <div className="card"><Empty /></div>}
      </Async>
    </>
  );
}
