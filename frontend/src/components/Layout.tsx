import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { useNotifications } from '../lib/notifications';
import { Icon } from './Icon';

/**
 * Top navigation: a floating pill bar (brand · section pills · actions).
 * Administration, profile, language and sign-out live in the user menu so the bar stays short.
 */
export function Layout() {
  const { t, locale, setLocale } = useI18n();
  const { user, logout, has, isManagement } = useAuth();
  const { unread } = useNotifications();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Close the user menu on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const pill = (to: string, icon: string, label: string) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `pill${isActive ? ' active' : ''}`}>
      <span className="pill-icon"><Icon name={icon} size={17} /></span>
      <span>{label}</span>
    </NavLink>
  );

  const menuLink = (to: string, icon: string, label: string) => (
    <NavLink to={to} className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}>
      <Icon name={icon} size={17} /> {label}
    </NavLink>
  );

  const initial = (user?.full_name ?? '?').trim().replace(/^ال/, '').charAt(0);
  const showAdmin = has('admin') || has('supervisor');

  return (
    <div className="app">
      <header className="topnav" aria-label="navigation">
        <Link to="/" className="brand">
          <span className="brand-mark"><Icon name="book" size={19} /></span>
          <span>
            <span className="brand-name" style={{ display: 'block' }}>{t('app.name')}</span>
            <span className="brand-motto">{t('app.motto')}</span>
          </span>
        </Link>

        <nav className="pills">
          {pill('/', 'home', t('nav.home'))}
          {pill('/projects', 'folder', t('nav.projects'))}
          {pill('/dashboard', 'chart', t('nav.dashboard'))}
          {isManagement && pill('/reports', 'report', t('nav.reports'))}
        </nav>

        <div className="nav-actions">
          <NavLink to="/notifications" className={({ isActive }) => `round-btn${isActive ? ' active' : ''}`} aria-label={t('nav.notifications')} title={t('nav.notifications')}>
            <Icon name="bell" size={19} />
            {unread > 0 && <span className="badge badge-count">{unread}</span>}
          </NavLink>
          <div className="menu-anchor" ref={menuRef}>
            <button className="user-pill" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
              <span className="avatar">{initial}</span>
              <span className="user-name">{user?.full_name}</span>
            </button>
            {menuOpen && (
              <div className="menu" role="menu">
                <div className="menu-head">
                  <strong>{user?.full_name}</strong>
                  {user?.roles.map((r) => t(`roles.${r}`)).join('، ')}
                </div>
                {menuLink('/profile', 'user', t('nav.profile'))}
                {showAdmin && (
                  <>
                    <div className="menu-label">{t('nav.admin')}</div>
                    {has('admin') && menuLink('/admin/users', 'users', t('nav.users'))}
                    {has('admin') && menuLink('/admin/settings', 'settings', t('nav.settings'))}
                    {has('admin') && menuLink('/admin/note-types', 'tag', t('nav.note_types'))}
                    {menuLink('/admin/audit', 'shield', t('nav.audit'))}
                  </>
                )}
                <div className="menu-sep" />
                <button className="menu-item" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
                  <Icon name="globe" size={17} /> {t('common.language')}
                </button>
                <button className="menu-item" onClick={logout}>
                  <Icon name="logout" size={17} /> {t('nav.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      {/* Al-Muzzammil 73:4 */}
      <footer className="verse-footer" lang="ar" dir="rtl">
        وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا
        <small>{t('app.quote_source')}</small>
      </footer>
    </div>
  );
}
