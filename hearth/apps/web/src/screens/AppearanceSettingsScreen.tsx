import './AppearanceSettingsScreen.css';

import { Link } from 'react-router-dom';

import { useAppearance, type ThemePreference } from '../appearance/appearance';
import { Icon, type IconName } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';

const themeOptions: {
  value: ThemePreference;
  title: string;
  description: string;
  icon: IconName;
}[] = [
  {
    value: 'light',
    title: 'Light',
    description: 'Always light',
    icon: 'sun',
  },
  {
    value: 'dark',
    title: 'Dark',
    description: 'Always dark',
    icon: 'moon',
  },
  {
    value: 'automatic',
    title: 'Automatic',
    description: 'Matches this device',
    icon: 'sunrise',
  },
];

export function AppearanceSettingsScreen() {
  const { preferences, setEveningDimming, setTheme } = useAppearance();
  return (
    <div className="screen appearance-screen">
      <ScreenHeader
        title="Appearance"
        actions={
          <Link
            aria-label="Back to More"
            className="appearance-back focusable"
            data-focus-id="appearance-back"
            to="/more"
          >
            <Icon name="chevron-left" />
            <span>Back to More</span>
          </Link>
        }
      />
      <section className="appearance-settings" aria-labelledby="theme-choice-heading">
        <div className="appearance-section-heading">
          <h2 id="theme-choice-heading">Theme</h2>
          <p>This device only</p>
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
                data-focus-left="appearance-back"
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
      </section>

      <section
        className="appearance-settings appearance-settings--comfort"
        aria-labelledby="comfort-heading"
      >
        <div className="appearance-section-heading">
          <h2 id="comfort-heading">Evening comfort</h2>
        </div>
        <button
          aria-checked={preferences.eveningDimming}
          className="appearance-dim-control focusable"
          data-focus-down="appearance-dim"
          data-focus-id="appearance-dim"
          data-focus-left="appearance-back"
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
            <small>Reduce glare across Hearth</small>
          </span>
          <span className="appearance-switch" aria-hidden="true">
            <span />
          </span>
        </button>
        <p className="appearance-help">
          Dims Hearth only. It does not change TV brightness or run Home Assistant.
        </p>
      </section>
    </div>
  );
}
