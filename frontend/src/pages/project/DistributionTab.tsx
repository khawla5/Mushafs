import { useState } from 'react';
import { Async, ConfirmModal, DualDate, Empty, ErrorBox, Field, fieldErrors, Modal, useToast } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { todayIso } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import type { ProjectCtx } from '../ProjectPage';

const CHANNELS = ['netia', 'satellite', 'direct', 'portal', 'other'];
const empty = { recipient: '', channel: 'netia', country: '', city: '', output_version: '', delivered_on: todayIso(), notes: '', feedback: '' };

/** DST-01: distribution log per mushaf (recipient, channel, date) plus feedback (step 11). */
export function DistributionTab({ ctx }: { ctx: ProjectCtx }) {
  const { t } = useI18n();
  const { isManagement } = useAuth();
  const toast = useToast();
  const p = ctx.data.project;
  const open = ['distribution', 'completed'].includes(p.status);
  const state = useApi<any>(`/projects/${p.id}/distributions`);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);

  const remove = async () => {
    try {
      await api.del(`/distributions/${deleting.id}`);
      setDeleting(null);
      state.reload(true);
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('distribution.title')}</h2>
        {open && isManagement && <button className="btn btn-primary btn-sm" onClick={() => setEditing({ ...empty })}><Icon name="plus" /> {t('distribution.add')}</button>}
      </div>
      {!open && <div className="alert-box info">{t('distribution.not_ready')}</div>}
      <Async state={state}>
        {(d) => d.distributions.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('distribution.recipient')}</th><th>{t('distribution.channel')}</th><th className="hide-sm">{t('distribution.country')}</th>
                  <th className="hide-sm">{t('distribution.output_version')}</th><th>{t('distribution.delivered_on')}</th><th className="hide-sm">{t('distribution.feedback')}</th>
                  {isManagement && <th />}
                </tr>
              </thead>
              <tbody>
                {d.distributions.map((x: any) => (
                  <tr key={x.id}>
                    <td>{x.recipient}{x.notes && <div className="faint" style={{ fontSize: '0.8rem' }}>{x.notes}</div>}</td>
                    <td>{t(`distribution.channels.${x.channel}`)}</td>
                    <td className="hide-sm">{[x.country, x.city].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="hide-sm">{x.output_version ?? '—'}</td>
                    <td><DualDate value={x.delivered_on} /></td>
                    <td className="hide-sm">{x.feedback ?? '—'}</td>
                    {isManagement && (
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => setEditing({ ...empty, ...Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v ?? ''])) })}>{t('common.edit')}</button>
                          <button className="btn btn-sm btn-ghost btn-danger" onClick={() => setDeleting(x)}>{t('common.delete')}</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>{t('distribution.none')}</Empty>}
      </Async>
      {editing && <DistributionModal projectId={p.id} initial={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); toast(t('common.saved')); state.reload(true); }} />}
      {deleting && <ConfirmModal danger message={`${t('common.delete')}: ${deleting.recipient}?`} onClose={() => setDeleting(null)} onConfirm={remove} />}
    </section>
  );
}

function DistributionModal({ projectId, initial, onClose, onDone }: { projectId: number; initial: any; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);
  const errs = fieldErrors(error);
  const set = (k: string, v: string) => setF((x: any) => ({ ...x, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    const body = {
      recipient: f.recipient, channel: f.channel, country: f.country || null, city: f.city || null, output_version: f.output_version || null,
      delivered_on: f.delivered_on, notes: f.notes || null, feedback: f.feedback || null,
    };
    try {
      if (f.id) await api.patch(`/distributions/${f.id}`, body);
      else await api.post(`/projects/${projectId}/distributions`, body);
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t('distribution.add')}
      onClose={onClose}
      wide
      footer={<><button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn btn-primary" disabled={busy || !f.recipient.trim()} onClick={submit}>{t('common.save')}</button></>}
    >
      <div className="form-grid">
        <Field label={t('distribution.recipient')} error={errs.recipient}><input className="input" value={f.recipient} onChange={(e) => set('recipient', e.target.value)} /></Field>
        <Field label={t('distribution.channel')}>
          <select className="input" value={f.channel} onChange={(e) => set('channel', e.target.value)}>
            {CHANNELS.map((c) => <option key={c} value={c}>{t(`distribution.channels.${c}`)}</option>)}
          </select>
        </Field>
        <Field label={t('distribution.country')}><input className="input" value={f.country} onChange={(e) => set('country', e.target.value)} /></Field>
        <Field label={t('distribution.city')}><input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label={t('distribution.output_version')}><input className="input" value={f.output_version} onChange={(e) => set('output_version', e.target.value)} /></Field>
        <Field label={t('distribution.delivered_on')} error={errs.delivered_on}><input className="input" type="date" value={f.delivered_on} onChange={(e) => set('delivered_on', e.target.value)} /></Field>
        <Field label={t('common.notes')} full><textarea className="input" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <Field label={t('distribution.feedback')} full><textarea className="input" value={f.feedback} onChange={(e) => set('feedback', e.target.value)} /></Field>
      </div>
      <div style={{ marginTop: 12 }}><ErrorBox error={error} /></div>
    </Modal>
  );
}
