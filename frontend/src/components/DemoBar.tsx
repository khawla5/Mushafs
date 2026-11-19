import { useI18n } from '../i18n';
import { DEMO } from '../demo/mode';
import { currentPersona, setPersona } from '../demo/api';
import { personas } from '../demo/data';
import { Icon } from './Icon';

/** Static demo only: explains that data is fictional and lets visitors switch roles. */
export function DemoBar() {
  const { t } = useI18n();
  if (!DEMO) return null;
  const persona = currentPersona();
  return (
    <div className="demo-bar" role="note">
      <span className="demo-tag"><Icon name="flag" size={15} /> {t('demo.title')}</span>
      <span className="demo-text">{t('demo.text')}</span>
      <label className="demo-switch">
        {t('demo.view_as')}
        <select
          value={persona.key}
          onChange={(e) => {
            setPersona(e.target.value);
            window.location.assign(`${import.meta.env.BASE_URL}`);
          }}
        >
          {personas.map((p) => <option key={p.key} value={p.key}>{t(`roles.${p.key}`)}</option>)}
        </select>
      </label>
    </div>
  );
}
