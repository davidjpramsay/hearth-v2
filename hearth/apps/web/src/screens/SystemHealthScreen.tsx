import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import './SystemHealthScreen.css';

import type { ApplianceUpdateStatus, SystemBackupStatus } from '@hearth/shared';

import { adminApi as hearthApi } from '../api/admin';
import { HearthApiError } from '../api/core';
import { queryKeys } from '../api/queryKeys';
import { authenticateWithPasskey } from '../auth/passkeys';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon, type IconName } from '../components/Icon';
import { focusById } from '../focus/focusGraph';
import { useApplianceUpdateQuery, useSystemStatusQuery } from '../hooks/useAdminQueries';
import {
  useCalendarConnectionQuery,
  useHomeAssistantConnectionQuery,
} from '../hooks/useConnectionQueries';
import { usePhotoSourceQuery } from '../hooks/usePhotoQueries';
import { useHearthRuntime } from '../runtime/context';

export function SystemHealthScreen() {
  const runtime = useHearthRuntime();
  const queryClient = useQueryClient();
  const query = useSystemStatusQuery();
  const applianceUpdate = useApplianceUpdateQuery(runtime.mode === 'private');
  const calendar = useCalendarConnectionQuery();
  const homeAssistant = useHomeAssistantConnectionQuery();
  const photos = usePhotoSourceQuery();
  const pendingRequestId = useRef<string | null>(null);
  const pendingUpdateRequestId = useRef<string | null>(null);
  const [waitingForRestart, setWaitingForRestart] = useState(false);
  const refetchApplianceUpdate = applianceUpdate.refetch;
  const createBackup = useMutation({
    mutationFn: () => {
      pendingRequestId.current ??= `request_system_backup_${crypto.randomUUID()}`;
      return hearthApi.createSystemBackup(pendingRequestId.current);
    },
    onSuccess: (result) => {
      pendingRequestId.current = null;
      queryClient.setQueryData(queryKeys.systemStatus, result.status);
    },
  });
  const installUpdate = useMutation({
    mutationFn: async (targetVersion: string) => {
      await authenticateWithPasskey();
      pendingUpdateRequestId.current ??= `request_appliance_update_${crypto.randomUUID()}`;
      return hearthApi.installApplianceUpdate(pendingUpdateRequestId.current, targetVersion);
    },
    onSuccess: (result) => {
      pendingUpdateRequestId.current = null;
      setWaitingForRestart(true);
      queryClient.setQueryData(queryKeys.applianceUpdate, result.status);
      queryClient.setQueryData(queryKeys.systemStatus, (current: typeof query.data) =>
        current === undefined ? current : { ...current, backup: result.backup },
      );
    },
    onError: () => {
      setWaitingForRestart(true);
      void queryClient.invalidateQueries({ queryKey: queryKeys.applianceUpdate });
    },
  });

  useEffect(() => {
    if (!waitingForRestart) return;
    const timer = window.setInterval(() => {
      void refetchApplianceUpdate().then((result) => {
        const phase = result.data?.operation.phase;
        if (phase === 'succeeded' || phase === 'failed') {
          window.clearInterval(timer);
          setWaitingForRestart(false);
        }
      });
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [refetchApplianceUpdate, waitingForRestart]);

  useLayoutEffect(() => {
    if (createBackup.isError) focusById('system-backup-retry');
  }, [createBackup.isError]);

  if (query.isPending) return <AdminLoading />;
  if (query.isError) return <AdminError message={query.error.message} />;

  const status = query.data;
  const healthy = status.database.state === 'ready' && status.backup.state === 'ready';
  const canCreateBackup = status.backup.state !== 'not-configured';

  return (
    <AdminPage title="System health">
      {runtime.mode === 'private' ? null : (
        <div className="admin-demo-note">Demo only · backups are not written.</div>
      )}
      <section
        className={`system-health-summary system-health-summary--${healthy ? 'healthy' : 'attention'}`}
        aria-labelledby="system-health-heading"
      >
        <span className="system-health-summary__icon">
          <Icon name={healthy ? 'shield' : 'warning'} />
        </span>
        <div>
          <h2 id="system-health-heading">
            {healthy ? 'Hearth is protected' : 'One setup item needs attention'}
          </h2>
          {healthy ? null : <p>{status.backup.message}</p>}
        </div>
      </section>

      <div className="system-health-grid">
        <HealthCard
          detail={`Migration ${status.database.migrationVersion} · checked ${formatDateTime(status.generatedAt)}`}
          icon="shield"
          label={status.database.state === 'ready' ? 'Ready' : 'Needs attention'}
          title="Household data"
          tone={status.database.state === 'ready' ? 'healthy' : 'attention'}
        >
          {status.database.state === 'ready' ? undefined : status.database.message}
        </HealthCard>
        <HealthCard
          detail={backupDetail(status.backup)}
          icon="refresh"
          label={backupLabel(status.backup.state)}
          title="Recovery copies"
          tone={status.backup.state === 'ready' ? 'healthy' : 'attention'}
        >
          {status.backup.state === 'ready' ? undefined : status.backup.message}
        </HealthCard>
      </div>

      {applianceUpdate.data?.supported ? (
        <ApplianceUpdateCard
          error={installUpdate.error}
          installing={installUpdate.isPending || waitingForRestart}
          onInstall={(targetVersion) => installUpdate.mutate(targetVersion)}
          status={applianceUpdate.data}
        />
      ) : null}

      <section className="system-connection-health" aria-labelledby="connection-health-title">
        <div className="system-section-heading">
          <h2 id="connection-health-title">Connections and photos</h2>
          <Link
            className="system-section-link focusable"
            data-focus-down="system-calendar-health"
            data-focus-entry={
              applianceUpdate.data?.canInstall &&
              applianceUpdate.data.operation.phase !== 'succeeded'
                ? undefined
                : 'true'
            }
            data-focus-id="system-manage-connections"
            data-focus-left="system-manage-connections"
            data-focus-right="system-manage-connections"
            data-focus-up={
              applianceUpdate.data?.canInstall &&
              applianceUpdate.data.operation.phase !== 'succeeded'
                ? 'system-update-install'
                : 'system-manage-connections'
            }
            to="/admin/connections"
          >
            Manage connections
          </Link>
        </div>
        <div className="system-connection-list">
          <IntegrationHealthRow
            detail={calendarDetail(calendar)}
            focusId="system-calendar-health"
            icon="calendar"
            label={calendarLabel(calendar)}
            nextFocusId="system-home-assistant-health"
            priorFocusId="system-manage-connections"
            title="Calendar"
            tone={calendarTone(calendar)}
            to="/admin/connections/calendar"
          />
          <IntegrationHealthRow
            detail={homeAssistantDetail(homeAssistant)}
            focusId="system-home-assistant-health"
            icon="home"
            label={homeAssistantLabel(homeAssistant)}
            nextFocusId="system-photo-health"
            priorFocusId="system-calendar-health"
            title="Home Assistant"
            tone={homeAssistantTone(homeAssistant)}
            to="/admin/connections/home-assistant"
          />
          <IntegrationHealthRow
            detail={photoDetail(photos)}
            focusId="system-photo-health"
            icon="image"
            label={photoLabel(photos)}
            nextFocusId="system-activity"
            priorFocusId="system-home-assistant-health"
            title="Family photos"
            tone={photoTone(photos)}
            to="/admin/photos"
          />
        </div>
      </section>

      <Link
        className="system-activity-entry focusable"
        data-focus-down="system-recovery-advanced"
        data-focus-id="system-activity"
        data-focus-left="system-activity"
        data-focus-right="system-activity"
        data-focus-up="system-photo-health"
        to="/admin/activity"
      >
        <span className="system-activity-entry__icon">
          <Icon name="list" />
        </span>
        <span className="system-activity-entry__copy">
          <strong>Recent activity</strong>
        </span>
        <Icon name="chevron-right" />
      </Link>

      <details className="system-advanced-recovery">
        <summary
          className="focusable"
          data-focus-down={canCreateBackup ? 'system-create-backup' : 'system-recovery-advanced'}
          data-focus-id="system-recovery-advanced"
          data-focus-left="system-recovery-advanced"
          data-focus-right="system-recovery-advanced"
          data-focus-up="system-activity"
        >
          Advanced recovery
        </summary>
        <div className="system-advanced-recovery__body">
          <p>Updates and scheduled backups already create recovery copies.</p>
          {canCreateBackup ? (
            <button
              className="button button--primary focusable"
              data-focus-down="system-create-backup"
              data-focus-id="system-create-backup"
              data-focus-left="system-create-backup"
              data-focus-right="system-create-backup"
              data-focus-up="system-recovery-advanced"
              disabled={createBackup.isPending}
              onClick={() => createBackup.mutate()}
              type="button"
            >
              <Icon name="refresh" />
              {createBackup.isPending ? 'Creating…' : 'Create extra copy'}
            </button>
          ) : (
            <div className="system-backup-unconfigured" role="status">
              Recovery storage is not configured.
            </div>
          )}
          {createBackup.isSuccess ? (
            <p className="admin-success" role="status">
              Recovery copy created and checked.
            </p>
          ) : null}
          {createBackup.isError ? (
            <div className="inline-command-error" role="alert">
              <p>{backupErrorMessage(createBackup.error)}</p>
              <button
                className="button focusable"
                data-focus-down="system-backup-retry"
                data-focus-id="system-backup-retry"
                data-focus-left="system-backup-retry"
                data-focus-right="system-backup-retry"
                data-focus-up="system-create-backup"
                onClick={() => createBackup.mutate()}
                type="button"
              >
                Try again
              </button>
            </div>
          ) : null}
        </div>
      </details>
    </AdminPage>
  );
}

function ApplianceUpdateCard({
  error,
  installing,
  onInstall,
  status,
}: {
  error: Error | null;
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
  const canStart = status.canInstall && status.operation.phase !== 'succeeded';
  return (
    <section className="system-update" aria-labelledby="system-update-title">
      <div className="system-section-heading">
        <div>
          <h2 id="system-update-title">Hearth update</h2>
          <p>
            {active || terminal
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
            Installed {shortVersion(status.installedVersion)} · Ready{' '}
            {shortVersion(release.version)}
          </small>
        </div>
      )}

      {active || terminal ? (
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
          {updateErrorMessage(error)}
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

type HealthTone = 'healthy' | 'attention' | 'neutral';
type ConnectionQuery = ReturnType<typeof useCalendarConnectionQuery>;
type HomeAssistantQuery = ReturnType<typeof useHomeAssistantConnectionQuery>;
type PhotoQuery = ReturnType<typeof usePhotoSourceQuery>;

function IntegrationHealthRow({
  detail,
  focusId,
  icon,
  label,
  nextFocusId,
  priorFocusId,
  title,
  tone,
  to,
}: {
  detail: string;
  focusId: string;
  icon: IconName;
  label: string;
  nextFocusId: string;
  priorFocusId: string;
  title: string;
  tone: HealthTone;
  to: string;
}) {
  return (
    <Link
      className="system-connection-row focusable"
      data-focus-down={nextFocusId}
      data-focus-id={focusId}
      data-focus-left={focusId}
      data-focus-right={focusId}
      data-focus-up={priorFocusId}
      to={to}
    >
      <span className={`system-connection-row__icon system-connection-row__icon--${tone}`}>
        <Icon name={icon} />
      </span>
      <span className="system-connection-row__copy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span
        className={`connection-badge${
          tone === 'healthy'
            ? ' connection-badge--healthy'
            : tone === 'attention'
              ? ' connection-badge--unavailable'
              : ''
        }`}
      >
        {label}
      </span>
      <Icon name="chevron-right" />
    </Link>
  );
}

function calendarTone(query: ConnectionQuery): HealthTone {
  if (query.isPending) return 'neutral';
  if (query.isError || query.data?.status === 'needs-attention') return 'attention';
  return query.data === null ? 'neutral' : 'healthy';
}

function calendarLabel(query: ConnectionQuery): string {
  if (query.isPending) return 'Checking';
  if (query.isError) return 'Unavailable';
  if (query.data === null) return 'Not set up';
  return query.data.status === 'ready' ? 'Connected' : 'Check needed';
}

function calendarDetail(query: ConnectionQuery): string {
  if (query.isPending) return 'Checking…';
  if (query.isError) return 'Could not read calendar status.';
  if (query.data === null) return 'Not connected';
  return `${query.data.label} · ${query.data.calendars.length} calendar${query.data.calendars.length === 1 ? '' : 's'}`;
}

function homeAssistantTone(query: HomeAssistantQuery): HealthTone {
  if (query.isPending) return 'neutral';
  if (query.isError || query.data?.status === 'needs-attention') return 'attention';
  return query.data === null ? 'neutral' : 'healthy';
}

function homeAssistantLabel(query: HomeAssistantQuery): string {
  if (query.isPending) return 'Checking';
  if (query.isError) return 'Unavailable';
  if (query.data === null) return 'Not set up';
  return query.data.status === 'ready' ? 'Connected' : 'Check needed';
}

function homeAssistantDetail(query: HomeAssistantQuery): string {
  if (query.isPending) return 'Checking…';
  if (query.isError) return 'Could not read Home Assistant status.';
  if (query.data === null) return 'Not connected';
  return `${query.data.label} · ${query.data.instanceName}`;
}

function photoTone(query: PhotoQuery): HealthTone {
  if (query.isPending) return 'neutral';
  if (query.isError || query.data.collection.source.status === 'unavailable') return 'attention';
  return query.data.collection.source.status === 'ready' ? 'healthy' : 'neutral';
}

function photoLabel(query: PhotoQuery): string {
  if (query.isPending) return 'Checking';
  if (query.isError) return 'Unavailable';
  if (query.data.collection.source.status === 'ready') return 'Ready';
  if (query.data.collection.source.status === 'unavailable') return 'Unavailable';
  return 'Needs selection';
}

function photoDetail(query: PhotoQuery): string {
  if (query.isPending) return 'Checking…';
  if (query.isError) return 'Could not read photo status.';
  return `${query.data.collection.name} · ${query.data.visiblePhotoCount} ready`;
}

function HealthCard({
  children,
  detail,
  icon,
  label,
  title,
  tone,
}: {
  children: string | undefined;
  detail: string;
  icon: 'refresh' | 'shield';
  label: string;
  title: string;
  tone: 'healthy' | 'attention';
}) {
  return (
    <article className="system-health-card">
      <span className={`system-health-card__icon system-health-card__icon--${tone}`}>
        <Icon name={icon} />
      </span>
      <div className="system-health-card__heading">
        <h2>{title}</h2>
        <span
          className={`connection-badge connection-badge--${tone === 'healthy' ? 'ready' : 'unavailable'}`}
        >
          {label}
        </span>
      </div>
      {children === undefined ? null : <p>{children}</p>}
      <small>{detail}</small>
    </article>
  );
}

function backupLabel(state: SystemBackupStatus['state']): string {
  const labels: Record<SystemBackupStatus['state'], string> = {
    ready: 'Ready',
    'never-run': 'Not created',
    'not-configured': 'Not configured',
    failed: 'Check needed',
  };
  return labels[state];
}

function backupDetail(backup: SystemBackupStatus): string {
  if (backup.lastSuccessfulAt === null) {
    return backup.scheduled ? 'Automatic checks are scheduled' : 'Automatic backups are off';
  }
  const size = backup.sizeBytes === null ? '' : ` · ${formatBytes(backup.sizeBytes)}`;
  return `Last backup ${formatDateTime(backup.lastSuccessfulAt)}${size}`;
}

function updateLabel(status: ApplianceUpdateStatus): string {
  if (status.operation.phase === 'succeeded') return 'Installed';
  if (status.operation.phase === 'failed') return 'Restored';
  if (
    ['queued', 'installing', 'checking-health', 'rolling-back'].includes(status.operation.phase)
  ) {
    return 'Updating';
  }
  if (status.updateAvailable) return 'Available';
  if (status.availableRelease === null) return 'Check needed';
  return 'Current';
}

function updateTone(status: ApplianceUpdateStatus): 'healthy' | 'attention' | 'neutral' {
  if (status.operation.phase === 'failed' || status.availableRelease === null) return 'attention';
  if (status.operation.phase === 'succeeded' || !status.updateAvailable) return 'healthy';
  return 'neutral';
}

function shortVersion(version: string): string {
  return /^[a-f0-9]{40}$/.test(version) ? version.slice(0, 8) : version;
}

function updateErrorMessage(error: Error): string {
  if (error instanceof HearthApiError) {
    if (error.payload.error.code === 'CONFIRMATION_REQUIRED') {
      return 'Confirm again with an adult passkey.';
    }
    return error.message;
  }
  return 'Hearth may be restarting. Reconnecting…';
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function backupErrorMessage(error: Error): string {
  if (error instanceof HearthApiError) return error.message;
  return 'Hearth could not confirm the recovery copy. Check the connection, then try again.';
}
