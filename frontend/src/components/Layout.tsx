import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { useNotifications } from '../lib/notifications';
import { Icon } from './Icon';

function Brand() {
  const { t } = useI18n();
  return (
    <div className="brand">
      <div className="brand-mark"><Icon name="mic" size={18} /></div>
      <div>
        <div className="brand-name">{t('app.name')}</div>
        <div className="brand-sub">{t('app.tagline')}</div>
      </div>
    </div>
  );
}

export function Layout() {
  const { t, locale, setLocale } = useI18n();
  const { user, logout, has, isManagement } = useAuth();
  const { unread } = useNotifications();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  const link = (to: string, icon: string, label: string, badge?: number) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      <Icon name={icon} /> <span>{label}</span>
      {badge ? <span className="badge badge-count">{badge}</span> : null}
    </NavLink>
  );

  return (
    <div className="app">
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="navigation">
        <Brand />
        {link('/', 'home', t('nav.home'))}
        {link('/projects', 'folder', t('nav.projects'))}
        {link('/dashboard', 'chart', t('nav.dashboard'))}
        {isManagement && link('/reports', 'report', t('nav.reports'))}
        {link('/notifications', 'bell', t('nav.notifications'), unread)}
        {link('/profile', 'user', t('nav.profile'))}
        {(has('admin') || has('supervisor')) && (
          <>
            <div className="nav-section">{t('nav.admin')}</div>
            {has('admin') && link('/admin/users', 'users', t('nav.users'))}
            {has('admin') && link('/admin/settings', 'settings', t('nav.settings'))}
            {has('admin') && link('/admin/note-types', 'tag', t('nav.note_types'))}
            {link('/admin/audit', 'shield', t('nav.audit'))}
          </>
        )}
        <div className="sidebar-foot">
          <div className="user-chip">
            <strong>{user?.full_name}</strong>
            {user?.roles.map((r) => t(`roles.${r}`)).join('، ')}
          </div>
          <button className="nav-link btn-ghost" style={{ border: 0, background: 'none', cursor: 'pointer', font: 'inherit' }} onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
            <Icon name="globe" /> {t('common.language')}
          </button>
          <button className="nav-link" style={{ border: 0, background: 'none', cursor: 'pointer', font: 'inherit' }} onClick={logout}>
            <Icon name="logout" /> {t('nav.logout')}
          </button>
        </div>
      </aside>
      {open && <div className="drawer-backdrop" onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="menu"><Icon name="menu" size={22} /></button>
          <strong>{t('app.name')}</strong>
          <NavLink to="/notifications" className="icon-btn" style={{ color: '#fff', position: 'relative' }} aria-label={t('nav.notifications')}>
            <Icon name="bell" size={22} />
            {unread > 0 && <span className="badge badge-count" style={{ position: 'absolute', top: -2, insetInlineEnd: -4 }}>{unread}</span>}
          </NavLink>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
