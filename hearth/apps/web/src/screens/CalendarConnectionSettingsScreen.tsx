import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import {
  FAMILY_CALENDAR_COLOR,
  type CalendarConnectionTestResult,
  type Member,
} from '@hearth/shared';

import { connectionsApi as hearthApi } from '../api/connections';
import { createRequestId } from '../api/core';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { useAdminQuery } from '../hooks/useAdminQueries';
import { useCalendarConnectionQuery } from '../hooks/useConnectionQueries';
import { useHearthRuntime } from '../runtime/context';

type OwnerByCalendar = Record<string, string>;
type CalendarEditMode = 'none' | 'selection' | 'connection';

export function CalendarConnectionSettingsScreen() {
  const runtime = useHearthRuntime();
  const admin = useAdminQuery();
  const connection = useCalendarConnectionQuery();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState<CalendarEditMode>('none');
  const [testResult, setTestResult] = useState<CalendarConnectionTestResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [owners, setOwners] = useState<OwnerByCalendar>({});
  const [appPassword, setAppPassword] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [mappingOwners, setMappingOwners] = useState<OwnerByCalendar>({});

  const testConnection = useMutation({
    mutationFn: hearthApi.testCalendarConnection,
    onSuccess: (result) => {
      setTestResult(result);
      setSelected(result.availableCalendars.map((calendar) => calendar.id));
      const householdMembers = admin.data?.household.members ?? [];
      setOwners(
        Object.fromEntries(
          result.availableCalendars.map((calendar) => {
            const owner = householdMembers.find(
              (member) => member.displayName.toLowerCase() === calendar.displayName.toLowerCase(),
            );
            return [calendar.id, owner?.id ?? ''];
          }),
        ),
      );
      setAppPassword('');
      setConfirmation('Connection worked. Choose the calendars Hearth may show.');
    },
  });
  const refreshSelection = useMutation({
    mutationFn: hearthApi.refreshCalendarSelection,
    onSuccess: (result) => {
      const connectedByName = new Map(
        (connection.data?.calendars ?? []).map((calendar) => [calendar.displayName, calendar]),
      );
      const householdMembers = admin.data?.household.members ?? [];
      setTestResult(result);
      setSelected(
        result.availableCalendars
          .filter((calendar) => connectedByName.has(calendar.displayName))
          .map((calendar) => calendar.id),
      );
      setOwners(
        Object.fromEntries(
          result.availableCalendars.map((calendar) => {
            const connected = connectedByName.get(calendar.displayName);
            const matchedMember = householdMembers.find(
              (member) => member.displayName.toLowerCase() === calendar.displayName.toLowerCase(),
            );
            return [calendar.id, connected?.owner?.id ?? matchedMember?.id ?? ''];
          }),
        ),
      );
      setEditMode('selection');
      setConfirmation('Calendars refreshed using the saved connection. Choose what Hearth shows.');
    },
  });
  const save = useMutation({
    mutationFn: hearthApi.saveCalendarConnection,
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.calendarConnection, result.connection);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin }),
        queryClient.invalidateQueries({ queryKey: queryKeys.today }),
        queryClient.invalidateQueries({ queryKey: queryKeys.weekRoot }),
        queryClient.invalidateQueries({ queryKey: [queryKeys.today[0], 'month'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.activity }),
      ]);
      window.scrollTo({ top: 0, behavior: 'auto' });
      const savedSelectionEdit = editMode === 'selection';
      setEditMode('none');
      setTestResult(null);
      setConfirmation(
        savedSelectionEdit ? 'Calendar choices saved.' : 'Calendar connection saved.',
      );
    },
  });
  const remove = useMutation({
    mutationFn: () => hearthApi.removeCalendarConnection(createRequestId('calendar_remove')),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.calendarConnection, null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin });
      window.scrollTo({ top: 0, behavior: 'auto' });
      setConfirmRemove(false);
      setEditMode('none');
      setTestResult(null);
      setConfirmation('Calendar connection removed. Saved event copies will age out safely.');
    },
  });
  const updateMappings = useMutation({
    mutationFn: hearthApi.updateCalendarMappings,
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.calendarConnection, result.connection);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.today }),
        queryClient.invalidateQueries({ queryKey: queryKeys.weekRoot }),
        queryClient.invalidateQueries({ queryKey: [queryKeys.today[0], 'month'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.activity }),
      ]);
      setMappingOwners({});
      setConfirmation('Calendar assignments saved. The TV will use the updated faces and colours.');
    },
  });

  if (admin.isPending || connection.isPending) return <AdminLoading />;
  if (admin.isError) return <AdminError message={admin.error.message} />;
  if (connection.isError) return <AdminError message={connection.error.message} />;

  const showForm = connection.data === null || editMode !== 'none';
  const mutationError =
    testConnection.error ??
    refreshSelection.error ??
    save.error ??
    remove.error ??
    updateMappings.error;

  function submitTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmation(null);
    setTestResult(null);
    const data = new FormData(event.currentTarget);
    testConnection.mutate({
      serverUrl: String(data.get('serverUrl') ?? ''),
      username: String(data.get('username') ?? ''),
      appPassword,
    });
  }

  function saveSelection() {
    if (testResult === null || selected.length === 0) return;
    save.mutate({
      requestId: createRequestId('calendar_save'),
      testId: testResult.testId,
      label: connection.data?.label ?? 'Family calendars',
      calendars: selected.map((calendarId) => ({
        calendarId,
        ownerMemberId: owners[calendarId] || null,
      })),
    });
  }

  function saveMappings() {
    const currentConnection = connection.data;
    if (currentConnection == null) return;
    updateMappings.mutate({
      requestId: createRequestId('calendar_mappings'),
      calendars: currentConnection.calendars.map((calendar) => ({
        calendarId: calendar.id,
        ownerMemberId:
          mappingOwners[calendar.id] === undefined
            ? (calendar.owner?.id ?? null)
            : mappingOwners[calendar.id] || null,
      })),
    });
  }

  return (
    <AdminPage
      backLabel="Back to Connections"
      backTo="/admin/connections"
      title="Calendar"
      subtitle="Connect iCloud or another CalDAV account"
    >
      <div className="calendar-privacy-note">
        <Icon name="shield" />
        <div>
          <strong>Read-only by design</strong>
          <p>
            Hearth stores the calendar credential only in its private server secret file. For
            iCloud, use a dedicated app-specific password—not the main Apple Account password.
            Hearth never sends it back to the phone or TV and cannot change calendar events.
          </p>
        </div>
      </div>

      {confirmation === null ? null : (
        <p className="save-confirmation" role="status">
          {confirmation}
        </p>
      )}
      {mutationError === null ? null : <AdminError message={mutationError.message} />}

      {!showForm && connection.data !== null ? (
        <section className="calendar-connection-summary">
          <header>
            <span className="admin-setting-row__icon">
              <Icon name="calendar" />
            </span>
            <div>
              <h2>{connection.data.label}</h2>
              <p>
                {connection.data.serverHost} · {connection.data.accountHint}
              </p>
            </div>
            <span className="connection-badge connection-badge--healthy">Read-only</span>
          </header>
          <p className="calendar-connection-message">{connection.data.message}</p>
          <div className="calendar-mapping-heading" aria-hidden="true">
            <span>Calendar name</span>
            <span>Assigned person</span>
            <span>Display colour</span>
          </div>
          <div className="calendar-selected-list">
            {connection.data.calendars.map((calendar) => {
              const ownerId = mappingOwners[calendar.id] ?? calendar.owner?.id ?? '';
              const owner = memberForId(admin.data.household.members, ownerId);
              const color = owner?.color ?? FAMILY_CALENDAR_COLOR;
              return (
                <div className="calendar-selected-row" key={calendar.id}>
                  <strong>{calendar.displayName}</strong>
                  <div className="calendar-owner-preview">
                    {owner === null ? (
                      <span className="calendar-family-avatar" aria-hidden="true">
                        <Icon name="home" />
                      </span>
                    ) : (
                      <Avatar member={owner} size="small" />
                    )}
                    <label>
                      <span className="sr-only">Assigned person for {calendar.displayName}</span>
                      <select
                        aria-label={`Assigned person for ${calendar.displayName}`}
                        onChange={(event) =>
                          setMappingOwners((current) => ({
                            ...current,
                            [calendar.id]: event.target.value,
                          }))
                        }
                        value={ownerId}
                      >
                        <option value="">Whole family</option>
                        {admin.data.household.members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <span className="calendar-colour-preview">
                    <i style={{ background: color }} />
                    <span>{color.toUpperCase()}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <button
            className="admin-submit calendar-mapping-save"
            disabled={Object.keys(mappingOwners).length === 0 || updateMappings.isPending}
            onClick={saveMappings}
            type="button"
          >
            {updateMappings.isPending ? 'Saving assignments…' : 'Save calendar assignments'}
          </button>
          <p className="field-help">
            Last checked {formatCheckedAt(connection.data.lastCheckedAt)}
          </p>
          <div className="calendar-family-note" role="note">
            <span className="calendar-family-avatar" aria-hidden="true">
              <Icon name="home" />
            </span>
            <p>
              <strong>Whole family calendars</strong> use Hearth&apos;s green household mark and
              family colour. Assign a calendar to one person to use their photo and colour instead.
            </p>
          </div>
          <div className="calendar-connection-actions">
            <button
              className="admin-secondary focusable"
              data-focus-id="calendar-edit-selection"
              disabled={refreshSelection.isPending}
              onClick={() => {
                setConfirmation(null);
                refreshSelection.mutate();
              }}
              type="button"
            >
              {refreshSelection.isPending ? 'Refreshing calendars…' : 'Edit calendars'}
            </button>
            <button
              className="admin-secondary focusable"
              data-focus-id="calendar-replace"
              onClick={() => {
                setEditMode('connection');
                setConfirmation(null);
              }}
              type="button"
            >
              Replace connection
            </button>
            {confirmRemove ? (
              <div
                className="calendar-remove-confirmation"
                role="group"
                aria-label="Remove calendar connection"
              >
                <strong>Remove this connection?</strong>
                <span>Hearth will stop refreshing these calendars.</span>
                <button
                  className="admin-danger"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                  type="button"
                >
                  {remove.isPending ? 'Removing…' : 'Yes, remove'}
                </button>
                <button
                  className="admin-secondary"
                  onClick={() => setConfirmRemove(false)}
                  type="button"
                >
                  Keep it
                </button>
              </div>
            ) : (
              <button className="admin-danger" onClick={() => setConfirmRemove(true)} type="button">
                Remove connection
              </button>
            )}
          </div>
        </section>
      ) : (
        <>
          {testResult === null ? (
            <form className="admin-form calendar-connection-form" onSubmit={submitTest}>
              {runtime.mode === 'private' ? null : (
                <div className="calendar-demo-note">
                  <strong>Local demo:</strong> this screen uses a fake calendar account and does not
                  contact iCloud. Use fictional sign-in details while testing the interface.
                </div>
              )}
              <label>
                Calendar server address
                <input
                  autoCapitalize="none"
                  autoCorrect="off"
                  data-focus-entry="true"
                  data-focus-id="calendar-server-url"
                  defaultValue="https://caldav.icloud.com"
                  inputMode="url"
                  maxLength={500}
                  name="serverUrl"
                  required
                  spellCheck={false}
                  type="url"
                />
              </label>
              <p className="field-help">
                For iCloud, keep the CalDAV address above. Hearth will securely discover the
                calendars available to this account.
              </p>
              <label>
                Apple Account email or CalDAV username
                <input
                  autoCapitalize="none"
                  autoComplete="username"
                  maxLength={320}
                  name="username"
                  placeholder="name@example.com"
                  required
                  spellCheck={false}
                />
              </label>
              <label>
                App-specific password
                <input
                  autoComplete="current-password"
                  maxLength={512}
                  minLength={4}
                  name="appPassword"
                  onChange={(event) => setAppPassword(event.target.value)}
                  required
                  type="password"
                  value={appPassword}
                />
              </label>
              <p className="field-help">
                For iCloud, create a dedicated app-specific password in Apple Account → Sign-In and
                Security. Never enter your main Apple Account password.
              </p>
              <button className="admin-submit" disabled={testConnection.isPending} type="submit">
                {testConnection.isPending ? 'Testing securely…' : 'Test connection'}
              </button>
              {editMode !== 'none' ? (
                <button
                  className="admin-secondary calendar-cancel"
                  onClick={() => {
                    setEditMode('none');
                    setTestResult(null);
                    setSelected([]);
                    setOwners({});
                    setConfirmation(null);
                  }}
                  type="button"
                >
                  Cancel
                </button>
              ) : null}
            </form>
          ) : (
            <div className="calendar-tested-account">
              <span className="admin-setting-row__icon">
                <Icon name="check" />
              </span>
              <div>
                <strong>
                  {editMode === 'selection' ? 'Calendars refreshed' : 'Connection tested'}
                </strong>
                <span>
                  {testResult.serverHost} · {testResult.accountHint}
                </span>
              </div>
              <button
                className="admin-secondary"
                onClick={() => {
                  if (editMode === 'selection') setEditMode('none');
                  setTestResult(null);
                  setSelected([]);
                  setOwners({});
                  setConfirmation(null);
                }}
                type="button"
              >
                {editMode === 'selection' ? 'Cancel' : 'Test another account'}
              </button>
            </div>
          )}

          {testResult === null ? null : (
            <section className="calendar-picker" aria-labelledby="calendar-picker-title">
              <header>
                <div>
                  <h2 id="calendar-picker-title">Choose calendars</h2>
                  <p>
                    {editMode === 'selection'
                      ? 'Add or remove calendars without changing the saved account.'
                      : 'Only selected calendars will be read by Hearth.'}
                  </p>
                </div>
                <span className="connection-badge connection-badge--healthy">
                  {editMode === 'selection' ? 'Saved sign-in' : 'Connection works'}
                </span>
              </header>
              <div className="calendar-family-note" role="note">
                <span className="calendar-family-avatar" aria-hidden="true">
                  <Icon name="home" />
                </span>
                <p>
                  Choose <strong>Whole family</strong> for a shared calendar. Hearth shows the green
                  household mark rather than one person&apos;s photo.
                </p>
              </div>
              <div className="calendar-picker__list">
                {testResult.availableCalendars.map((calendar) => {
                  const checked = selected.includes(calendar.id);
                  const owner = memberForId(
                    admin.data.household.members,
                    owners[calendar.id] ?? '',
                  );
                  const color = owner?.color ?? FAMILY_CALENDAR_COLOR;
                  return (
                    <div className="calendar-picker__row" key={calendar.id}>
                      <label className="calendar-picker__choice">
                        <input
                          checked={checked}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, calendar.id]
                                : current.filter((id) => id !== calendar.id),
                            )
                          }
                          type="checkbox"
                        />
                        <span style={{ background: color }} />
                        <strong>{calendar.displayName}</strong>
                      </label>
                      <label>
                        Show as
                        <select
                          aria-label={`Person for ${calendar.displayName}`}
                          disabled={!checked}
                          onChange={(event) =>
                            setOwners((current) => ({
                              ...current,
                              [calendar.id]: event.target.value,
                            }))
                          }
                          value={owners[calendar.id] ?? ''}
                        >
                          <option value="">Whole family</option>
                          {admin.data.household.members.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.displayName}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  );
                })}
              </div>
              <button
                className="admin-submit"
                disabled={selected.length === 0 || save.isPending}
                onClick={saveSelection}
                type="button"
              >
                {save.isPending
                  ? 'Saving…'
                  : editMode === 'selection'
                    ? 'Save calendar choices'
                    : `Save ${selected.length} calendar${selected.length === 1 ? '' : 's'}`}
              </button>
            </section>
          )}
        </>
      )}
    </AdminPage>
  );
}

function formatCheckedAt(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function memberForId(members: readonly Member[], memberId: string): Member | null {
  return members.find((member) => member.id === memberId) ?? null;
}
