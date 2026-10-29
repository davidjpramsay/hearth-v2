import { useState } from 'react';
import './SetupGuidance.css';

export function HomeAssistantInstallGuide() {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <details className="connection-help">
      <summary data-focus-entry="true" data-focus-id="home-assistant-bridge-setup">
        Install or update Hearth in Home Assistant
      </summary>
      <p>
        Do this once on the computer that manages HA. The download includes the matching
        integration, an installer and a rollback copy when updating.
      </p>
      <a className="admin-secondary" href="/downloads/hearth-home-assistant.zip" download>
        Download HA integration
      </a>
      <ol>
        <li>
          Unzip the download. Run <code>python3 install.py</code> and choose your HA configuration
          folder. If HA runs on another device, copy the included{' '}
          <code>custom_components/hearth</code> folder into its configuration folder instead.
        </li>
        <li>
          Restart Home Assistant when convenient. The installer does not restart it or change
          automations.
        </li>
        <li>
          In HA, open Settings → Devices &amp; services → Add integration → Hearth. Enter this
          Hearth address:
        </li>
      </ol>
      <p>
        <code>{window.location.origin}</code>{' '}
        <button
          type="button"
          className="admin-secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.origin);
              setCopyState('copied');
            } catch {
              setCopyState('failed');
            }
          }}
        >
          Copy address
        </button>
        {copyState !== 'idle' ? (
          <span role="status">
            {copyState === 'copied' ? ' Address copied' : ' Select and copy the address above.'}
          </span>
        ) : null}
      </p>
      <p>
        HA shows six letters. Enter them below and approve. For an existing connection, use its
        repair or reconfigure flow instead of adding another.
      </p>
      <p className="field-help">
        Hearth’s integration selects tabs on an already open screen. HA’s separate TV integration
        handles power and launching the app. Indoor sensors and home-action controls are separate
        optional connections.
      </p>
    </details>
  );
}
