import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="card empty">
      <h1>404</h1>
      <p>{t('errors.not_found')}</p>
      <Link className="btn" to="/">{t('nav.home')}</Link>
    </div>
  );
}
