import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import type { SystemBackupStatus } from '@hearth/shared';

import { adminApi as hearthApi } from '../api/admin';
import { HearthApiError } from '../api/core';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon, type IconName } from '../components/Icon';
import { focusById } from '../focus/focusGraph';
import { useSystemStatusQuery } from '../hooks/useAdminQueries';
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
  const calendar = useCalendarConnectionQuery();
  const homeAssistant = useHomeAssistantConnectionQuery();
  const photos = usePhotoSourceQuery();
  const pendingRequestId = useRef<string | null>(null);
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

  useLayoutEffect(() => {
    if (createBackup.isError) focusById('system-backup-retry');
  }, [createBackup.isError]);

  if (query.isPending) return <AdminLoading />;
  if (query.isError) return <AdminError message={query.error.message} />;

  const status = query.data;
  const healthy = status.database.state === 'ready' && status.backup.state === 'ready';
  const canCreateBackup = status.backup.state !== 'not-configured';

  return (
    <AdminPage title="System health" subtitle="Recovery, storage and this Hearth version">
      {runtime.mode === 'private' ? null : (
        <div className="admin-demo-note">
          Demo preview: backup actions are simulated and do not write a household database.
        </div>
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
          <p>
            {healthy
              ? 'Household data is ready and a recent local recovery copy is available.'
              : status.backup.message}
          </p>
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
          {status.database.message}
        </HealthCard>
        <HealthCard
          detail={backupDetail(status.backup)}
          icon="refresh"
          label={backupLabel(status.backup.state)}
          title="Recovery copies"
          tone={status.backup.state === 'ready' ? 'healthy' : 'attention'}
        >
          {status.backup.message}
        </HealthCard>
      </div>

      <section className="system-connection-health" aria-labelledby="connection-health-title">
        <div className="system-section-heading">
          <div>
            <h2 id="connection-health-title">Connections and photos</h2>
            <p>Safe setup state for the services Hearth uses directly.</p>
          </div>
          <Link
            className="system-section-link focusable"
            data-focus-down="system-calendar-health"
            data-focus-id="system-manage-connections"
            data-focus-left="system-manage-connections"
            data-focus-right="system-manage-connections"
            data-focus-up="system-manage-connections"
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
        data-focus-down={canCreateBackup ? 'system-create-backup' : 'system-activity'}
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
          <small>See who changed household settings, planning and connections.</small>
        </span>
        <Icon name="chevron-right" />
      </Link>

      <section className="system-backup-actions" aria-labelledby="system-backup-actions-title">
        <div>
          <h2 id="system-backup-actions-title">Create a recovery copy</h2>
          <p>
            Hearth takes a consistent online copy while the family keeps using the display. It keeps
            the newest {status.backup.retentionCount} local copies.
          </p>
        </div>
        {canCreateBackup ? (
          <button
            className="button button--primary focusable"
            data-focus-entry="true"
            data-focus-down="system-create-backup"
            data-focus-id="system-create-backup"
            data-focus-left="system-create-backup"
            data-focus-right="system-create-backup"
            data-focus-up="system-activity"
            disabled={createBackup.isPending}
            onClick={() => createBackup.mutate()}
            type="button"
          >
            <Icon name="refresh" />
            {createBackup.isPending ? 'Creating backup…' : 'Create backup now'}
          </button>
        ) : (
          <div className="system-backup-unconfigured" role="status">
            Add the private backup folder in Synology deployment settings first.
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
      </section>

      <section
        className="system-recovery-boundary"
        aria-labelledby="system-recovery-boundary-title"
      >
        <h2 id="system-recovery-boundary-title">Recovery boundary</h2>
        <ul>
          <li>The local copy contains Hearth household data and audit history.</li>
          <li>Provider tokens stay in the separate protected secrets folder.</li>
          <li>Photo originals remain in the approved Synology photo folder.</li>
          <li>Home Assistant keeps its own independent backup on the Pi and Synology.</li>
        </ul>
      </section>

      <footer className="system-version">
        <span>Hearth version</span>
        <strong>{status.version}</strong>
        <small>{status.mode === 'private' ? 'Private household mode' : 'Demo/test mode'}</small>
      </footer>
    </AdminPage>
  );
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
  if (query.isPending) return 'Checking the saved read-only calendar setup.';
  if (query.isError) return 'Hearth could not read calendar setup just now.';
  if (query.data === null) return 'Add a read-only calendar connection when you are ready.';
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
  if (query.isPending) return 'Checking the approved household-action setup.';
  if (query.isError) return 'Hearth could not read Home Assistant setup just now.';
  if (query.data === null) return 'Connect approved states and actions when you are ready.';
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
  if (query.isPending) return 'Checking the approved photo source.';
  if (query.isError) return 'Hearth could not read photo source status just now.';
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
  children: string;
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
      <p>{children}</p>
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
