import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import type { ReminderSourceSummary } from '@hearth/shared';

import { queryKeys } from '../api/queryKeys';
import { remindersApi } from '../api/reminders';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { useReminderSourcesQuery } from '../hooks/useConnectionQueries';
import { useHearthRuntime } from '../runtime/context';

export function ReminderConnectionSettingsScreen() {
  const runtime = useHearthRuntime();
  const sources = useReminderSourcesQuery();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const approve = useMutation({
    mutationFn: remindersApi.approvePairing,
    onSuccess: () => {
      setCode('');
      setConfirmation('Pairing approved. Keep Hearth Companion open while it uploads reminders.');
      void queryClient.invalidateQueries({ queryKey: queryKeys.reminderSources });
    },
  });
  const revoke = useMutation({
    mutationFn: remindersApi.revokeDevice,
    onSuccess: () => {
      setConfirmRemove(false);
      setConfirmation('The iPhone Reminders bridge has been disconnected.');
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.reminderSources }),
        queryClient.invalidateQueries({ queryKey: queryKeys.reminders }),
      ]);
    },
  });

  if (sources.isPending) return <AdminLoading />;
  if (sources.isError) return <AdminError message={sources.error.message} />;

  const activeSource = sources.data.sources.find((source) => source.status !== 'revoked');
  const mutationError = approve.error ?? revoke.error;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmation(null);
    approve.mutate(code);
  }

  return (
    <AdminPage
      backLabel="Back to Connections"
      backTo="/admin/connections"
      title="Apple Reminders"
      subtitle="Pair the read-only bridge on a trusted iPhone"
    >
      <div className="calendar-privacy-note">
        <Icon name="shield" />
        <div>
          <strong>Apple stays authoritative</strong>
          <p>
            Hearth receives only the selected reminder lists through EventKit. It cannot edit or
            complete Apple reminders, and no Apple ID or iCloud password enters Hearth.
          </p>
        </div>
      </div>

      {confirmation === null ? null : (
        <p className="save-confirmation" role="status">
          {confirmation}
        </p>
      )}
      {mutationError === null ? null : <AdminError message={mutationError.message} />}

      {activeSource === undefined ? (
        <form className="admin-form reminder-pairing-form" onSubmit={submit}>
          {runtime.mode === 'private' ? null : (
            <div className="calendar-demo-note">
              <strong>Local demo:</strong> use a code created by the demo bridge contract.
            </div>
          )}
          <h2>Connect Hearth Companion</h2>
          <ol className="reminder-pairing-steps">
            <li>Open Hearth Companion on the iPhone and choose the reminder lists to share.</li>
            <li>Tap Pair with Hearth and enter this Hearth address in the app.</li>
            <li>Enter the six-character code shown on the iPhone below.</li>
          </ol>
          <label>
            Pairing code
            <input
              autoCapitalize="characters"
              autoComplete="one-time-code"
              autoCorrect="off"
              data-focus-entry="true"
              inputMode="text"
              maxLength={6}
              minLength={6}
              onChange={(event) =>
                setCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 6),
                )
              }
              pattern="[A-Z0-9]{6}"
              placeholder="A1B2C3"
              required
              spellCheck={false}
              value={code}
            />
          </label>
          <p className="field-help">Codes expire after ten minutes and can be used only once.</p>
          <button className="admin-submit" disabled={approve.isPending || code.length !== 6}>
            {approve.isPending ? 'Approving securely…' : 'Approve iPhone'}
          </button>
        </form>
      ) : (
        <ReminderSourceSummaryCard
          confirmRemove={confirmRemove}
          onKeep={() => setConfirmRemove(false)}
          onRemove={() => revoke.mutate(activeSource.device.id)}
          onRequestRemove={() => setConfirmRemove(true)}
          removing={revoke.isPending}
          source={activeSource}
        />
      )}
    </AdminPage>
  );
}

function ReminderSourceSummaryCard({
  source,
  confirmRemove,
  removing,
  onRequestRemove,
  onRemove,
  onKeep,
}: {
  source: ReminderSourceSummary;
  confirmRemove: boolean;
  removing: boolean;
  onRequestRemove: () => void;
  onRemove: () => void;
  onKeep: () => void;
}) {
  const lastUpload = source.lastSnapshotReceivedAt;
  const statusLabel =
    source.status === 'current'
      ? 'Up to date'
      : source.status === 'awaiting-first-snapshot'
        ? 'Waiting for first upload'
        : 'Last upload is old';
  return (
    <section className="calendar-connection-summary reminder-source-summary">
      <header>
        <span className="admin-setting-row__icon">
          <Icon name="list" />
        </span>
        <div>
          <h2>{source.displayName}</h2>
          <p>
            {source.device.name} · Hearth Companion {source.device.applicationVersion}
          </p>
        </div>
        <span
          className={`connection-badge${
            source.status === 'current'
              ? ' connection-badge--healthy'
              : ' connection-badge--unavailable'
          }`}
        >
          {statusLabel}
        </span>
      </header>
      <dl className="reminder-source-facts">
        <div>
          <dt>Shared lists</dt>
          <dd>{source.listCount}</dd>
        </div>
        <div>
          <dt>Incomplete</dt>
          <dd>{source.incompleteCount}</dd>
        </div>
        <div>
          <dt>Last upload</dt>
          <dd>{lastUpload === null ? 'Not yet' : formatUploadTime(lastUpload)}</dd>
        </div>
      </dl>
      {confirmRemove ? (
        <div className="reminder-source-remove-confirmation">
          <p>
            Disconnect this iPhone? Cached reminders will disappear from Hearth and the device
            credential will stop working.
          </p>
          <button className="admin-danger" disabled={removing} onClick={onRemove} type="button">
            {removing ? 'Disconnecting…' : 'Disconnect iPhone'}
          </button>
          <button className="admin-secondary" onClick={onKeep} type="button">
            Keep connected
          </button>
        </div>
      ) : (
        <button className="admin-danger" onClick={onRequestRemove} type="button">
          Disconnect iPhone
        </button>
      )}
    </section>
  );
}

function formatUploadTime(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
