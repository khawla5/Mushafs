import { useState } from 'react';
import { Async, DualDate, Empty, ErrorBox, Field, fieldErrors, useToast } from '../components/ui';
import { useI18n } from '../i18n';
import { api, uploadWithProgress } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';

/** RDR-01: ID and IBAN in the app (encrypted), plus preferences, password and my attendance log. */
export function ProfilePage() {
  const { t, locale, setLocale } = useI18n();
  const { user, refresh, has } = useAuth();
  const toast = useToast();
  const priv = useApi<any>('/auth/private/me');
  const attendance = useApi<any>(user && has('reader', 'mujiz', 'technician') ? `/attendance?user_id=${user.id}` : null);
  const [nid, setNid] = useState('');
  const [iban, setIban] = useState('');
  const [privErr, setPrivErr] = useState<any>(null);
  const [doc, setDoc] = useState<File | null>(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwErr, setPwErr] = useState<any>(null);
  const [name, setName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');

  const savePrivate = async () => {
    setPrivErr(null);
    try {
      const body: Record<string, string> = {};
      if (nid.trim()) body.national_id = nid.trim();
      if (iban.trim()) body.iban = iban.trim();
      if (Object.keys(body).length) await api.put('/auth/private/me', body);
      if (doc) {
        const fd = new FormData();
        fd.append('file', doc);
        await uploadWithProgress('/auth/private/me/document', fd, () => undefined);
      }
      setNid(''); setIban(''); setDoc(null);
      toast(t('profile.saved'));
      priv.reload(true);
    } catch (err) {
      setPrivErr(err);
    }
  };

  const savePrefs = async () => {
    try {
      await api.patch('/auth/me', { full_name: name, phone: phone || null, locale });
      await refresh();
      toast(t('profile.saved'));
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  const changePassword = async () => {
    setPwErr(null);
    try {
      await api.patch('/auth/me', { current_password: pw.current, new_password: pw.next });
      setPw({ current: '', next: '' });
      toast(t('profile.password_changed'));
    } catch (err) {
      setPwErr(err);
    }
  };

  const pe = fieldErrors(privErr);

  return (
    <>
      <div className="page-head"><h1>{t('profile.title')}</h1></div>
      <div className="grid grid-2">
        <section className="card">
          <div className="card-head"><h2>{t('profile.personal')}</h2></div>
          <div className="alert-box info" style={{ marginBottom: 12 }}>{t('profile.personal_hint')}</div>
          <Async state={priv}>
            {(p) => (
              <div className="stack">
                <Field label={t('profile.national_id')} hint={p.national_id ?? '—'} error={pe.national_id}>
                  <input className="input" dir="ltr" value={nid} onChange={(e) => setNid(e.target.value)} placeholder={p.national_id ?? ''} autoComplete="off" />
                </Field>
                <Field label={t('profile.iban')} hint={p.iban ?? '—'} error={pe.iban}>
                  <input className="input" dir="ltr" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="SA00 0000 0000 0000 0000 0000" autoComplete="off" />
                </Field>
                <Field label={t('profile.id_document')} hint={p.has_document ? t('profile.has_document', { name: p.document_name }) : t('profile.no_document')}>
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setDoc(e.target.files?.[0] ?? null)} />
                </Field>
                {p.has_document && <a className="btn btn-sm" href="/api/auth/private/me/document" target="_blank" rel="noreferrer">{t('profile.view_document')}</a>}
                <ErrorBox error={privErr?.code === 'validation_failed' ? null : privErr} />
                <button className="btn btn-primary" disabled={!nid.trim() && !iban.trim() && !doc} onClick={savePrivate}>{t('common.save')}</button>
              </div>
            )}
          </Async>
        </section>
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>{t('profile.preferences')}</h2></div>
            <div className="stack">
              <Field label={t('common.name')}><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label={t('common.phone')}><input className="input" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
              <Field label={t('common.email')}><input className="input" dir="ltr" value={user?.email ?? ''} disabled /></Field>
              <div className="segmented">
                <button className={locale === 'ar' ? 'on' : ''} onClick={() => setLocale('ar')}>العربية</button>
                <button className={locale === 'en' ? 'on' : ''} onClick={() => setLocale('en')}>English</button>
              </div>
              <button className="btn btn-primary" onClick={savePrefs}>{t('common.save')}</button>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>{t('profile.change_password')}</h2></div>
            <div className="stack">
              <Field label={t('profile.current_password')}><input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
              <Field label={t('profile.new_password')} error={fieldErrors(pwErr).new_password} hint="8+">
                <input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              </Field>
              <ErrorBox error={pwErr?.code === 'validation_failed' ? null : pwErr} />
              <button className="btn" disabled={!pw.current || pw.next.length < 8} onClick={changePassword}>{t('profile.change_password')}</button>
            </div>
          </section>
        </div>
      </div>
      {attendance.data && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><h2>{t('profile.attendance')}</h2></div>
          <div className="grid grid-2">
            <div>
              <h3>{t('attendance.sittings')}</h3>
              {attendance.data.sittings.length ? attendance.data.sittings.map((s: any) => (
                <div key={s.id} className="work-item" style={{ cursor: 'default' }}>
                  <div style={{ flex: 1 }}><div className="title">{s.project_title}</div><div className="meta"><DualDate value={s.sitting_date} /></div></div>
                  {s.outcome && <span className="badge">{t(`outcome.${s.outcome}`)}</span>}
                </div>
              )) : <Empty />}
            </div>
            <div>
              <h3>{t('attendance.excuses')}</h3>
              {attendance.data.excuses.length ? attendance.data.excuses.map((e: any) => (
                <div key={e.id} className="work-item" style={{ cursor: 'default' }}>
                  <div style={{ flex: 1 }}><div className="title">{e.reason}</div><div className="meta">{e.project_title} · <DualDate value={e.date_from} /></div></div>
                  {e.is_late && <span className="badge badge-orange">{t('attendance.late')}</span>}
                  <span className={`badge ${e.status === 'accepted' ? 'badge-ok' : 'badge-red'}`}>{t(`attendance.${e.status}`)}</span>
                </div>
              )) : <Empty />}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
