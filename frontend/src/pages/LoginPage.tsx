import { useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { t, errorText, locale, setLocale } = useI18n();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card stack" onSubmit={submit} noValidate>
        <div className="row-between">
          <div className="brand">
            <div className="brand-mark" style={{ color: '#fff' }}><Icon name="mic" /></div>
            <div>
              <div className="brand-name">{t('app.name')}</div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>{t('app.tagline')}</div>
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>{t('common.language')}</button>
        </div>
        <h1 style={{ fontSize: '1.25rem' }}>{t('login.title')}</h1>
        {!!error && <div className="alert-box error" role="alert">{errorText(error)}</div>}
        <div className="field">
          <label htmlFor="email">{t('login.email')}</label>
          <input id="email" className="input ltr-input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
        </div>
        <div className="field">
          <label htmlFor="password">{t('login.password')}</label>
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
        </div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy || !email || !password}>
          {busy ? t('common.loading') : t('login.submit')}
        </button>
      </form>
    </div>
  );
}
