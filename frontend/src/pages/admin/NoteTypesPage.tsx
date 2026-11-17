import { useState } from 'react';
import { Async, ErrorBox, Field, Modal, useToast } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';

/** Section 11.2: note types are configurable by center management (the current five by default). */
export function NoteTypesPage() {
  const { t } = useI18n();
  const toast = useToast();
  const state = useApi<any>('/note-types?all=true');
  const [editing, setEditing] = useState<any | null>(null);

  const toggle = async (nt: any) => {
    await api.patch(`/note-types/${nt.id}`, { is_active: !nt.is_active });
    state.reload(true);
  };

  return (
    <>
      <div className="page-head">
        <h1>{t('note_types.title')}</h1>
        <button className="btn btn-primary" onClick={() => setEditing({ code: '', name_ar: '', name_en: '', severity: 1, is_clear_error: false, is_technical: false, sort_order: 10 })}><Icon name="plus" /> {t('note_types.new')}</button>
      </div>
      <Async state={state}>
        {(d) => (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('note_types.code')}</th><th>{t('note_types.name_ar')}</th><th>{t('note_types.name_en')}</th><th>{t('note_types.severity')}</th><th>{t('note_types.clear_error')}</th><th>{t('note_types.technical')}</th><th>{t('common.status')}</th><th /></tr></thead>
              <tbody>
                {d.note_types.map((nt: any) => (
                  <tr key={nt.id}>
                    <td className="num">{nt.code}</td><td>{nt.name_ar}</td><td>{nt.name_en}</td><td className="num">{nt.severity}</td>
                    <td>{nt.is_clear_error ? '✓' : ''}</td><td>{nt.is_technical ? '✓' : ''}</td>
                    <td><span className={`badge ${nt.is_active ? 'badge-ok' : 'badge-muted'}`}>{nt.is_active ? t('common.active') : t('common.inactive')}</span></td>
                    <td><div className="row" style={{ gap: 4 }}>
                      <button className="btn btn-sm" onClick={() => setEditing(nt)}>{t('common.edit')}</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => toggle(nt)}>{nt.is_active ? t('users.deactivate') : t('users.activate')}</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
      {editing && <NoteTypeModal nt={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); toast(t('common.saved')); state.reload(true); }} />}
    </>
  );
}

function NoteTypeModal({ nt, onClose, onDone }: { nt: any; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState(nt);
  const [error, setError] = useState<unknown>(null);
  const save = async () => {
    setError(null);
    const body = { name_ar: f.name_ar, name_en: f.name_en, severity: Number(f.severity), is_clear_error: f.is_clear_error, is_technical: f.is_technical, sort_order: Number(f.sort_order) };
    try {
      if (nt.id) await api.patch(`/note-types/${nt.id}`, body);
      else await api.post('/note-types', { ...body, code: f.code });
      onDone();
    } catch (err) {
      setError(err);
    }
  };
  return (
    <Modal title={nt.id ? nt.code : t('note_types.new')} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn btn-primary" onClick={save}>{t('common.save')}</button></>}>
      <div className="form-grid">
        <Field label={t('note_types.code')} hint="a-z, _"><input className="input" dir="ltr" value={f.code} disabled={!!nt.id} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        <Field label={t('note_types.severity')}><input className="input" type="number" min={1} max={5} value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })} /></Field>
        <Field label={t('note_types.name_ar')}><input className="input" value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} /></Field>
        <Field label={t('note_types.name_en')}><input className="input" dir="ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} /></Field>
        <Field label={t('note_types.order')}><input className="input" type="number" min={0} value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></Field>
        <div className="stack" style={{ justifyContent: 'center' }}>
          <label className="checkbox"><input type="checkbox" checked={f.is_clear_error} onChange={(e) => setF({ ...f, is_clear_error: e.target.checked })} /> {t('note_types.clear_error')}</label>
          <label className="checkbox"><input type="checkbox" checked={f.is_technical} onChange={(e) => setF({ ...f, is_technical: e.target.checked })} /> {t('note_types.technical')}</label>
        </div>
      </div>
      <div style={{ marginTop: 10 }}><ErrorBox error={error} /></div>
    </Modal>
  );
}
