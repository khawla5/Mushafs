import { useState } from 'react';
import { Async, Empty } from '../../components/ui';
import { useI18n } from '../../i18n';
import { dual } from '../../lib/format';
import { useApi } from '../../lib/hooks';

const ENTITIES = ['', 'project', 'session', 'note', 'round', 'correction', 'user', 'settings', 'version', 'excuse', 'distribution', 'quality_rating', 'note_type'];
const PAGE = 50;

/** ADM-03: audit log of every change and decision. */
export function AuditPage() {
  const { t, locale } = useI18n();
  const [entity, setEntity] = useState('');
  const [offset, setOffset] = useState(0);
  const state = useApi<any>(`/audit?limit=${PAGE}&offset=${offset}${entity ? `&entity=${entity}` : ''}`);

  return (
    <>
      <div className="page-head">
        <h1>{t('audit.title')}</h1>
        <select className="input" style={{ maxWidth: 220 }} value={entity} onChange={(e) => { setEntity(e.target.value); setOffset(0); }} aria-label={t('audit.entity')}>
          {ENTITIES.map((x) => <option key={x} value={x}>{x || t('common.all')}</option>)}
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
                      <td><code>{e.action}</code></td>
                      <td className="num">{e.entity}{e.entity_id ? ` #${e.entity_id}` : ''}</td>
                      <td className="hide-sm" style={{ fontSize: '0.78rem', maxWidth: 380, wordBreak: 'break-word' }} dir="ltr">{e.details ? JSON.stringify(e.details) : ''}</td>
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
