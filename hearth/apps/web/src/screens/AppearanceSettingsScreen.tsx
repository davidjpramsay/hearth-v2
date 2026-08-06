import { useAppearance, type ThemePreference } from '../appearance/appearance';
import { AdminPage } from '../components/AdminPage';
import { Icon, type IconName } from '../components/Icon';

const themeOptions: {
  value: ThemePreference;
  title: string;
  description: string;
  icon: IconName;
}[] = [
  {
    value: 'light',
    title: 'Light',
    description: 'Warm and bright throughout the day',
    icon: 'sun',
  },
  {
    value: 'dark',
    title: 'Dark',
    description: 'Warm charcoal with softer surfaces',
    icon: 'moon',
  },
  {
    value: 'automatic',
    title: 'Automatic',
    description: 'Follow this device’s light or dark setting',
    icon: 'sunrise',
  },
];

export function AppearanceSettingsScreen() {
  const { preferences, resolvedTheme, setEveningDimming, setTheme } = useAppearance();
  return (
    <AdminPage title="Appearance" subtitle="Make this display comfortable for your room">
      <section className="appearance-settings" aria-labelledby="theme-choice-heading">
        <div className="appearance-section-heading">
          <h2 id="theme-choice-heading">Theme</h2>
          <p>Saved on this device</p>
        </div>
        <div className="appearance-options" role="radiogroup" aria-label="Theme">
          {themeOptions.map((option, index) => {
            const checked = preferences.theme === option.value;
            const prior = themeOptions[index - 1]?.value ?? option.value;
            const next = themeOptions[index + 1]?.value ?? 'dim';
            return (
              <button
                aria-checked={checked}
                className={`appearance-option focusable${checked ? ' appearance-option--selected' : ''}`}
                data-focus-down={`appearance-${next}`}
                data-focus-id={`appearance-${option.value}`}
                data-focus-left="admin-back"
                data-focus-right={`appearance-${option.value}`}
                data-focus-up={`appearance-${prior}`}
                key={option.value}
                onClick={() => setTheme(option.value)}
                role="radio"
                type="button"
              >
                <span className="appearance-option__icon">
                  <Icon name={option.icon} />
                </span>
                <span className="appearance-option__copy">
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
                <span className="appearance-option__check" aria-hidden="true">
                  {checked ? <Icon name="check" /> : null}
                </span>
              </button>
            );
          })}
        </div>
        <p className="appearance-result" aria-live="polite">
          {preferences.theme === 'automatic'
            ? `This device currently uses ${resolvedTheme} mode.`
            : `${preferences.theme === 'dark' ? 'Dark' : 'Light'} mode is active on this device.`}
        </p>
      </section>

      <section
        className="appearance-settings appearance-settings--comfort"
        aria-labelledby="comfort-heading"
      >
        <div className="appearance-section-heading">
          <h2 id="comfort-heading">Evening comfort</h2>
          <p>Independent of the theme</p>
        </div>
        <button
          aria-checked={preferences.eveningDimming}
          className="appearance-dim-control focusable"
          data-focus-down="appearance-dim"
          data-focus-id="appearance-dim"
          data-focus-left="admin-back"
          data-focus-right="appearance-dim"
          data-focus-up="appearance-automatic"
          onClick={() => setEveningDimming(!preferences.eveningDimming)}
          role="switch"
          type="button"
        >
          <span className="appearance-option__icon appearance-option__icon--dim">
            <Icon name="moon" />
          </span>
          <span className="appearance-option__copy">
            <strong>Evening dimming</strong>
            <small>Reduce overall glare, including photos and ambient mode</small>
          </span>
          <span className="appearance-switch" aria-hidden="true">
            <span />
          </span>
        </button>
        <p className="appearance-help">
          This changes Hearth only. It does not run the Home Assistant Evening scene or alter the
          television’s hardware brightness.
        </p>
      </section>
    </AdminPage>
  );
}
