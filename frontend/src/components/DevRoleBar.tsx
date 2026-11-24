import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Icon } from './Icon';

interface DevUser { id: number; full_name: string; email: string; roles: string[] }

/**
 * Development-only role switcher for the real app (`npm run dev`): signs in as any active user
 * without a password, so changes made in one role can be checked from another.
 * The server only offers it when NODE_ENV=development and DEV_ROLE_SWITCHER=true; otherwise it stays hidden.
 */
export function DevRoleBar() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [users, setUsers] = useState<DevUser[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ users: DevUser[] }>('/auth/dev-users').then((r) => setUsers(r.users)).catch(() => setUsers(null));
  }, []);

  if (!users?.length) return null;

  const switchTo = async (id: number) => {
    setBusy(true);
    try {
      await api.post('/auth/dev-login', { user_id: id });
      window.location.assign('/');
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="demo-bar dev-bar" role="note">
      <span className="demo-tag"><Icon name="settings" size={15} /> {t('dev.title')}</span>
      <span className="demo-text">{t('dev.text')}</span>
      <label className="demo-switch">
        {t('dev.view_as')}
        <select value={user?.id ?? ''} disabled={busy} onChange={(e) => switchTo(Number(e.target.value))}>
          {!user && <option value="">{t('dev.choose')}</option>}
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.roles.map((r) => t(`roles.${r}`)).join('، ')} — {u.full_name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
