import { useState } from 'react';
import { Async, DualDate, ErrorBox, Field, fieldErrors, Modal, useToast } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import type { Role } from '../../lib/auth';

const ROLES: Role[] = ['admin', 'supervisor', 'production_manager', 'mujiz', 'technician', 'reader', 'reviewer', 'mixing_lead'];

/** ADM-01: manage users, roles and permissions. */
export function UsersPage() {
  const { t } = useI18n();
  const toast = useToast();
  const state = useApi<any>('/users');
  const [editing, setEditing] = useState<any | null>(null);
  const [resetting, setResetting] = useState<any | null>(null);
  const [privateOf, setPrivateOf] = useState<any | null>(null);
  const [q, setQ] = useState('');

  return (
    <>
      <div className="page-head">
        <h1>{t('users.title')}</h1>
        <button className="btn btn-primary" onClick={() => setEditing({ email: '', full_name: '', phone: '', roles: [], password: '', locale: 'ar', is_active: true })}>
          <Icon name="plus" /> {t('users.new')}
        </button>
      </div>
      <input className="input" style={{ maxWidth: 300, marginBottom: 12 }} placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <Async state={state}>
        {(d) => (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('common.name')}</th><th className="hide-sm">{t('common.email')}</th><th>{t('common.roles')}</th><th>{t('common.status')}</th><th className="hide-sm">{t('users.last_login')}</th><th /></tr></thead>
              <tbody>
                {d.users.filter((u: any) => !q || `${u.full_name} ${u.email}`.toLowerCase().includes(q.toLowerCase())).map((u: any) => (
                  <tr key={u.id}>
                    <td>{u.full_name}</td>
                    <td className="hide-sm" dir="ltr" style={{ textAlign: 'start' }}>{u.email}</td>
                    <td><div className="chips">{u.roles.map((r: string) => <span key={r} className="badge">{t(`roles.${r}`)}</span>)}</div></td>
                    <td><span className={`badge ${u.is_active ? 'badge-ok' : 'badge-muted'}`}>{u.is_active ? t('common.active') : t('common.inactive')}</span></td>
                    <td className="hide-sm">{u.last_login_at ? <DualDate value={u.last_login_at} /> : '—'}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => setEditing({ ...u, phone: u.phone ?? '' })}>{t('common.edit')}</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setResetting(u)}>{t('users.reset_password')}</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setPrivateOf(u)}>{t('users.private')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
      {editing && <UserModal user={editing} onClose={() => setEditing(null)} onDone={(created) => { setEditing(null); toast(t(created ? 'users.created' : 'users.updated')); state.reload(true); }} />}
      {resetting && <ResetModal user={resetting} onClose={() => setResetting(null)} onDone={() => { setResetting(null); toast(t('common.saved')); }} />}
      {privateOf && <PrivateModal user={privateOf} onClose={() => setPrivateOf(null)} />}
    </>
  );
}

function UserModal({ user, onClose, onDone }: { user: any; onClose: () => void; onDone: (created: boolean) => void }) {
  const { t } = useI18n();
  const [f, setF] = useState(user);
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const errs = fieldErrors(error);
  const isNew = !user.id;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (isNew) await api.post('/users', { email: f.email, full_name: f.full_name, phone: f.phone || null, roles: f.roles, password: f.password, locale: f.locale });
      else await api.patch(`/users/${user.id}`, { full_name: f.full_name, phone: f.phone || null, roles: f.roles, is_active: f.is_active, locale: f.locale });
      onDone(isNew);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={isNew ? t('users.new') : f.full_name} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn btn-primary" disabled={busy || !f.roles.length} onClick={save}>{t('common.save')}</button></>}>
      <div className="form-grid">
        <Field label={t('common.name')} error={errs.full_name}><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label={t('common.email')} error={errs.email}><input className="input" dir="ltr" value={f.email} disabled={!isNew} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label={t('common.phone')}><input className="input" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        {isNew ? (
          <Field label={t('users.password')} error={errs.password} hint="8+"><input className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        ) : (
          <Field label={t('common.status')}>
            <label className="checkbox"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> {t('common.active')}</label>
          </Field>
        )}
        <Field label={t('common.roles')} full error={errs.roles}>
          <div className="chips">
            {ROLES.map((r) => (
              <button type="button" key={r} className={`chip-toggle${f.roles.includes(r) ? ' on' : ''}`}
                onClick={() => setF({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x: string) => x !== r) : [...f.roles, r] })}>
                {t(`roles.${r}`)}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div style={{ marginTop: 12 }}><ErrorBox error={error?.code === 'validation_failed' ? null : error} /></div>
    </Modal>
  );
}

function ResetModal({ user, onClose, onDone }: { user: any; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [pw, setPw] = useState('');
  const [error, setError] = useState<unknown>(null);
  return (
    <Modal title={`${t('users.reset_password')}: ${user.full_name}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
      <button className="btn btn-primary" disabled={pw.length < 8} onClick={async () => { try { await api.post(`/users/${user.id}/reset-password`, { password: pw }); onDone(); } catch (err) { setError(err); } }}>{t('common.save')}</button>
    </>}>
      <Field label={t('profile.new_password')} hint="8+"><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      <div style={{ marginTop: 10 }}><ErrorBox error={error} /></div>
    </Modal>
  );
}

/** Personal data is visible only to its owner and the responsible admin function (access is audited). */
function PrivateModal({ user, onClose }: { user: any; onClose: () => void }) {
  const { t } = useI18n();
  const [reveal, setReveal] = useState(false);
  const state = useApi<any>(`/auth/private/${user.id}${reveal ? '?reveal=true' : ''}`, [reveal]);
  return (
    <Modal title={`${t('users.private')}: ${user.full_name}`} onClose={onClose}>
      <Async state={state}>
        {(p) => (
          <div className="stack">
            <div className="row-between"><span className="muted">{t('profile.national_id')}</span><span dir="ltr" className="num">{p.national_id ?? '—'}</span></div>
            <div className="row-between"><span className="muted">{t('profile.iban')}</span><span dir="ltr" className="num">{p.iban ?? '—'}</span></div>
            <div className="row-between"><span className="muted">{t('profile.id_document')}</span>{p.has_document ? <a href={`/api/auth/private/${user.id}/document`} target="_blank" rel="noreferrer">{p.document_name}</a> : '—'}</div>
            {!reveal && (p.national_id || p.iban) && <button className="btn btn-sm" onClick={() => setReveal(true)}>{t('profile.show')}</button>}
          </div>
        )}
      </Async>
    </Modal>
  );
}
