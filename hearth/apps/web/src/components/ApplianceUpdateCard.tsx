import type { ApplianceUpdateStatus } from '@hearth/shared';

import { Icon } from './Icon';

export function ApplianceUpdateCard({
  error,
  installing,
  onInstall,
  status,
}: {
  error: string | null;
  installing: boolean;
  onInstall: (targetVersion: string) => void;
  status: ApplianceUpdateStatus;
}) {
  const release = status.availableRelease;
  const active = ['queued', 'installing', 'checking-health', 'rolling-back'].includes(
    status.operation.phase,
  );
  const terminal = status.operation.phase === 'succeeded' || status.operation.phase === 'failed';
  const blocker = updateBlocker(status, active);
  const canStart = status.canInstall && !active;
  return (
    <section className="system-update" aria-labelledby="system-update-title">
      <div className="system-section-heading">
        <div>
          <h2 id="system-update-title">Hearth update</h2>
          <p>
            {active ||
            (terminal &&
              (!status.updateAvailable ||
                (status.operation.phase === 'failed' &&
                  status.operation.targetVersion === release?.version)))
              ? status.operation.message
              : status.updateAvailable
                ? 'A verified update is ready.'
                : release === null
                  ? status.checks.internet.message
                  : 'Hearth is up to date.'}
          </p>
        </div>
        <span className={`system-update__state system-update__state--${updateTone(status)}`}>
          {updateLabel(status)}
        </span>
      </div>

      {release === null ? null : (
        <div className="system-update__release">
          <strong>{release.summary}</strong>
          <small>
            Installed {shortVersion(status.installedVersion)}
            {status.updateAvailable ? ` · Ready ${shortVersion(release.version)}` : ''}
          </small>
        </div>
      )}

      {active ? (
        <div className="system-update__progress" role="status">
          <div
            aria-label="Update progress"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={status.operation.progress}
            className="system-update__progress-track"
            role="progressbar"
          >
            <span style={{ width: `${status.operation.progress}%` }} />
          </div>
          <small>{status.operation.progress}%</small>
        </div>
      ) : null}

      {blocker === null && status.updateAvailable ? (
        <p className="system-update__safety">
          <Icon name="shield" />
          Backup and rollback are automatic.
        </p>
      ) : null}

      {blocker === null ? null : (
        <p className="system-update__blocker" role="status">
          <Icon name="warning" />
          {blocker}
        </p>
      )}

      {status.updateAvailable && release !== null && canStart ? (
        <button
          className="button button--primary focusable"
          data-focus-down="system-manage-connections"
          data-focus-entry="true"
          data-focus-id="system-update-install"
          data-focus-left="system-update-install"
          data-focus-right="system-update-install"
          data-focus-up="system-update-install"
          disabled={installing}
          onClick={() => onInstall(release.version)}
          type="button"
        >
          <Icon name="refresh" />
          {installing ? 'Updating…' : 'Install update'}
        </button>
      ) : null}

      {error === null ? null : (
        <p className="system-update__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function updateBlocker(status: ApplianceUpdateStatus, active: boolean): string | null {
  if (active) return null;
  if (status.checks.internet.state === 'attention') return status.checks.internet.message;
  if (status.checks.storage.state === 'attention') return status.checks.storage.message;
  if (status.updateAvailable && !status.canInstall) return status.operation.message;
  return null;
}

function updateLabel(status: ApplianceUpdateStatus): string {
  if (
    ['queued', 'installing', 'checking-health', 'rolling-back'].includes(status.operation.phase)
  ) {
    return 'Updating';
  }
  if (status.updateAvailable) return 'Available';
  if (status.operation.phase === 'succeeded') return 'Installed';
  if (status.operation.phase === 'failed') return 'Check needed';
  if (status.availableRelease === null) return 'Check needed';
  return 'Current';
}

function updateTone(status: ApplianceUpdateStatus): 'healthy' | 'attention' | 'neutral' {
  if (status.operation.phase === 'failed' || status.availableRelease === null) return 'attention';
  if (!status.updateAvailable) return 'healthy';
  return 'neutral';
}

function shortVersion(version: string): string {
  return /^[a-f0-9]{40}$/.test(version) ? version.slice(0, 8) : version;
}
