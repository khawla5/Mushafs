import { useState } from 'react';
import { Async, DualDate, Empty, ErrorBox, Field } from '../../components/ui';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import type { ProjectCtx } from '../ProjectPage';

/** REV-05: general notes on a recurring habit of the reader, with scholarly references. */
export function GeneralNotesTab({ ctx }: { ctx: ProjectCtx }) {
  const { t } = useI18n();
  const p = ctx.data.project;
  const me = ctx.data.me;
  const canWrite = me.is_management || me.team_roles.some((r: string) => ['mujiz', 'reviewer1', 'reviewer2', 'final_reviewer', 'technician'].includes(r));
  const state = useApi<any>(`/projects/${p.id}/general-notes`);
  const [body, setBody] = useState('');
  const [refs, setRefs] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/projects/${p.id}/general-notes`, { body, references_text: refs || null });
      setBody('');
      setRefs('');
      state.reload(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-2">
      <section className="card">
        <div className="card-head"><h2>{t('general_notes.title')}</h2></div>
        <Async state={state}>
          {(d) => d.notes.length ? (
            <div>
              {d.notes.map((n: any) => (
                <div key={n.id} className="note">
                  <div className="note-head"><strong>{n.author_name}</strong><span className="faint"><DualDate value={n.created_at} /></span></div>
                  <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{n.body}</p>
                  {n.references_text && <p className="muted" style={{ fontSize: '0.85rem', margin: '6px 0 0' }}>{t('general_notes.references')}: {n.references_text}</p>}
                </div>
              ))}
            </div>
          ) : <Empty>{t('general_notes.none')}</Empty>}
        </Async>
      </section>
      {canWrite && p.status !== 'pending_approval' && (
        <section className="card">
          <div className="card-head"><h2>{t('general_notes.add')}</h2></div>
          <div className="stack">
            <Field label={t('session.text')}><textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} /></Field>
            <Field label={`${t('general_notes.references')} (${t('common.optional')})`}><textarea className="input" value={refs} onChange={(e) => setRefs(e.target.value)} maxLength={2000} /></Field>
            <ErrorBox error={error} />
            <button className="btn btn-primary" disabled={busy || !body.trim()} onClick={add}>{t('common.add')}</button>
          </div>
        </section>
      )}
    </div>
  );
}
