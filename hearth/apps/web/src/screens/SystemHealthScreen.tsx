import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import type { SystemBackupStatus } from '@hearth/shared';

import { HearthApiError, hearthApi, queryKeys } from '../api/client';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { focusById } from '../focus/focusGraph';
import { useSystemStatusQuery } from '../hooks/useHearthQueries';
import { useHearthRuntime } from '../runtime/context';

export function SystemHealthScreen() {
  const runtime = useHearthRuntime();
  const queryClient = useQueryClient();
  const query = useSystemStatusQuery();
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
    onError: () => {
      requestAnimationFrame(() => focusById('system-backup-retry'));
    },
  });

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
            data-focus-id="system-create-backup"
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
              data-focus-id="system-backup-retry"
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
