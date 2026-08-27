import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import type {
  HomeAssistantConnectionOption,
  HomeAssistantConnectionTestResult,
  SaveHomeAssistantConnectionRequest,
} from '@hearth/shared';

import { connectionsApi as hearthApi } from '../api/connections';
import { createRequestId } from '../api/core';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { useHomeAssistantConnectionQuery } from '../hooks/useConnectionQueries';
import { useHearthRuntime } from '../runtime/context';

type MappingSelection = SaveHomeAssistantConnectionRequest['mappings'];

const EMPTY_MAPPINGS: MappingSelection = {
  occupancyId: '',
  televisionPowerId: '',
  hearthForegroundId: '',
  protectedMediaId: '',
  eveningScriptId: '',
  goodnightScriptId: '',
  screenOffScriptId: '',
};

export function HomeAssistantConnectionSettingsScreen() {
  const runtime = useHearthRuntime();
  const connection = useHomeAssistantConnectionQuery();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [testResult, setTestResult] = useState<HomeAssistantConnectionTestResult | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [label, setLabel] = useState('Living room Home Assistant');
  const [mappings, setMappings] = useState<MappingSelection>(EMPTY_MAPPINGS);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const testConnection = useMutation({
    mutationFn: hearthApi.testHomeAssistantConnection,
    onSuccess: (result) => {
      setTestResult(result);
      setMappings(defaultMappings(result));
      setAccessToken('');
      setConfirmation('Connected. Choose what Hearth may use.');
    },
  });
  const save = useMutation({
    mutationFn: hearthApi.saveHomeAssistantConnection,
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.homeAssistantConnection, result.connection);
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin });
      void queryClient.invalidateQueries({ queryKey: queryKeys.home });
      window.scrollTo({ top: 0, behavior: 'auto' });
      setEditing(false);
      setTestResult(null);
      setConfirmation('Home Assistant connection saved.');
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      hearthApi.removeHomeAssistantConnection(createRequestId('home_assistant_remove')),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.homeAssistantConnection, null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin });
      void queryClient.invalidateQueries({ queryKey: queryKeys.home });
      window.scrollTo({ top: 0, behavior: 'auto' });
      setConfirmRemove(false);
      setEditing(false);
      setTestResult(null);
      setConfirmation('Home Assistant disconnected.');
    },
  });

  if (connection.isPending) return <AdminLoading />;
  if (connection.isError) return <AdminError message={connection.error.message} />;

  const currentConnection = connection.data;
  const showForm = currentConnection === null || editing;
  const mutationError = testConnection.error ?? save.error ?? remove.error;

  function submitTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    testConnection.reset();
    save.reset();
    setConfirmation(null);
    setTestResult(null);
    setMappings(EMPTY_MAPPINGS);
    const data = new FormData(event.currentTarget);
    testConnection.mutate({
      serverUrl: String(data.get('serverUrl') ?? ''),
      accessToken,
    });
  }

  function saveConnection() {
    if (testResult === null || !Object.values(mappings).every(Boolean)) return;
    save.mutate({
      requestId: createRequestId('home_assistant_save'),
      testId: testResult.testId,
      label,
      mappings,
    });
  }

  function resetTest() {
    testConnection.reset();
    save.reset();
    setAccessToken('');
    setTestResult(null);
    setMappings(EMPTY_MAPPINGS);
    setConfirmation(null);
  }

  return (
    <AdminPage backLabel="Back to Connections" backTo="/admin/connections" title="Home Assistant">
      <div className="calendar-privacy-note home-assistant-privacy-note">
        <Icon name="shield" />
        <div>
          <strong>Strictly limited</strong>
          <p>
            Hearth reads four safety signals and may run only Evening, Goodnight and Screen off.
          </p>
        </div>
      </div>

      {confirmation === null ? null : (
        <p className="save-confirmation" role="status">
          {confirmation}
        </p>
      )}
      {mutationError === null ? null : <AdminError message={mutationError.message} />}

      {!showForm && currentConnection !== null ? (
        <ConnectionSummary
          connection={currentConnection}
          confirmRemove={confirmRemove}
          removing={remove.isPending}
          onEdit={() => {
            setLabel(currentConnection.label);
            setEditing(true);
            setConfirmation(null);
          }}
          onRemove={() => remove.mutate()}
          onRequestRemove={() => setConfirmRemove(true)}
          onKeep={() => setConfirmRemove(false)}
        />
      ) : (
        <>
          {testResult === null ? (
            <form className="admin-form calendar-connection-form" onSubmit={submitTest}>
              {runtime.mode === 'private' ? null : (
                <div className="calendar-demo-note">
                  <strong>Local demo:</strong> this uses fictional Home Assistant choices and does
                  not contact a real household system.
                </div>
              )}
              <label>
                Home Assistant address
                <input
                  autoCapitalize="none"
                  autoCorrect="off"
                  data-focus-entry="true"
                  data-focus-id="home-assistant-server-url"
                  defaultValue="http://homeassistant.local:8123"
                  inputMode="url"
                  maxLength={500}
                  name="serverUrl"
                  required
                  spellCheck={false}
                  type="url"
                />
              </label>
              <p className="field-help">Use the root address without an API path.</p>
              <label>
                Long-lived access token
                <input
                  autoCapitalize="none"
                  autoComplete="off"
                  maxLength={512}
                  minLength={20}
                  name="accessToken"
                  onChange={(event) => setAccessToken(event.target.value)}
                  placeholder="Paste token from your Home Assistant profile"
                  required
                  spellCheck={false}
                  type="password"
                  value={accessToken}
                />
              </label>
              <p className="field-help">
                Stored only in Hearth’s private server file and cleared here after testing.
              </p>
              <button className="admin-submit" disabled={testConnection.isPending} type="submit">
                {testConnection.isPending ? 'Testing securely…' : 'Test connection'}
              </button>
              {editing ? (
                <button
                  className="admin-secondary calendar-cancel"
                  onClick={() => {
                    setEditing(false);
                    resetTest();
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
                <strong>{testResult.instanceName}</strong>
                <span>
                  {testResult.serverHost} · Home Assistant {testResult.version}
                </span>
              </div>
              <button className="admin-secondary" onClick={resetTest} type="button">
                Test another system
              </button>
            </div>
          )}

          {testResult === null ? null : (
            <section
              aria-labelledby="home-assistant-mapping-title"
              className="calendar-picker home-assistant-mapping"
            >
              <header>
                <h2 id="home-assistant-mapping-title">Choose what Hearth may use</h2>
                <span className="connection-badge connection-badge--healthy">Connection works</span>
              </header>

              <label className="home-assistant-label-field">
                Connection name
                <input
                  maxLength={80}
                  onChange={(event) => setLabel(event.target.value)}
                  required
                  value={label}
                />
              </label>

              <MappingGroup title="Safety signals">
                <MappingField
                  description="Whether anyone is home"
                  label="Household occupancy"
                  onChange={(occupancyId) =>
                    setMappings((current) => ({ ...current, occupancyId }))
                  }
                  options={testResult.options.occupancy}
                  value={mappings.occupancyId}
                />
                <MappingField
                  description="Power state only—not media control"
                  label="Living room television"
                  onChange={(televisionPowerId) =>
                    setMappings((current) => ({ ...current, televisionPowerId }))
                  }
                  options={testResult.options.televisionPower}
                  value={mappings.televisionPowerId}
                />
                <MappingField
                  description="Whether Hearth is visible on the TV"
                  label="Hearth foreground"
                  onChange={(hearthForegroundId) =>
                    setMappings((current) => ({ ...current, hearthForegroundId }))
                  }
                  options={testResult.options.hearthForeground}
                  value={mappings.hearthForegroundId}
                />
                <MappingField
                  description="Prevents unsafe screen-off automation"
                  label="Protected native playback"
                  onChange={(protectedMediaId) =>
                    setMappings((current) => ({ ...current, protectedMediaId }))
                  }
                  options={testResult.options.protectedMedia}
                  value={mappings.protectedMediaId}
                />
              </MappingGroup>

              <MappingGroup title="Approved Home actions">
                <MappingField
                  description="Warm lights for the evening"
                  label="Evening"
                  onChange={(eveningScriptId) =>
                    setMappings((current) => ({ ...current, eveningScriptId }))
                  }
                  options={testResult.options.scripts}
                  value={mappings.eveningScriptId}
                />
                <MappingField
                  description="Settle the house for bedtime"
                  label="Goodnight"
                  onChange={(goodnightScriptId) =>
                    setMappings((current) => ({ ...current, goodnightScriptId }))
                  }
                  options={testResult.options.scripts}
                  value={mappings.goodnightScriptId}
                />
                <MappingField
                  description="Turn off the television safely"
                  label="Screen off"
                  onChange={(screenOffScriptId) =>
                    setMappings((current) => ({ ...current, screenOffScriptId }))
                  }
                  options={testResult.options.scripts}
                  value={mappings.screenOffScriptId}
                />
              </MappingGroup>

              <button
                className="admin-submit"
                disabled={
                  !label.trim() || !Object.values(mappings).every(Boolean) || save.isPending
                }
                onClick={saveConnection}
                type="button"
              >
                {save.isPending ? 'Saving securely…' : 'Save connection'}
              </button>
            </section>
          )}
        </>
      )}
    </AdminPage>
  );
}

function ConnectionSummary({
  connection,
  confirmRemove,
  removing,
  onEdit,
  onRemove,
  onRequestRemove,
  onKeep,
}: {
  connection: NonNullable<ReturnType<typeof useHomeAssistantConnectionQuery>['data']>;
  confirmRemove: boolean;
  removing: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onRequestRemove: () => void;
  onKeep: () => void;
}) {
  return (
    <section className="calendar-connection-summary home-assistant-connection-summary">
      <header>
        <span className="admin-setting-row__icon">
          <Icon name="home" />
        </span>
        <div>
          <h2>{connection.label}</h2>
          <p>
            {connection.instanceName} · Home Assistant {connection.version}
          </p>
        </div>
        <span className="connection-badge connection-badge--healthy">Connected</span>
      </header>
      <p className="calendar-connection-message">{connection.message}</p>
      <div className="home-assistant-saved-mappings">
        <SavedMappingGroup title="Safety signals" mappings={connection.stateMappings} />
        <SavedMappingGroup title="Approved actions" mappings={connection.actionMappings} />
      </div>
      <p className="field-help">
        {connection.serverHost} · Last checked {formatCheckedAt(connection.lastCheckedAt)}
      </p>
      <div className="calendar-connection-actions">
        <button
          className="admin-secondary focusable"
          data-focus-id="home-assistant-replace"
          onClick={onEdit}
          type="button"
        >
          Replace connection
        </button>
        {confirmRemove ? (
          <div
            aria-label="Remove Home Assistant connection"
            className="calendar-remove-confirmation"
            role="group"
          >
            <strong>Remove this connection?</strong>
            <span>Home actions will stop. Other Hearth features keep working.</span>
            <button className="admin-danger" disabled={removing} onClick={onRemove} type="button">
              {removing ? 'Removing…' : 'Yes, remove'}
            </button>
            <button className="admin-secondary" onClick={onKeep} type="button">
              Keep it
            </button>
          </div>
        ) : (
          <button className="admin-danger" onClick={onRequestRemove} type="button">
            Remove connection
          </button>
        )}
      </div>
    </section>
  );
}

function MappingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="home-assistant-mapping-group">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

function MappingField({
  label,
  description,
  options,
  value,
  onChange,
}: {
  label: string;
  description: string;
  options: HomeAssistantConnectionOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="home-assistant-mapping-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <select
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        required
        value={value}
      >
        <option disabled value="">
          Choose one…
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.displayName} · {option.kindLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function SavedMappingGroup({
  title,
  mappings,
}: {
  title: string;
  mappings: Record<string, string>;
}) {
  return (
    <section>
      <h3>{title}</h3>
      {Object.entries(mappings).map(([key, value]) => (
        <div key={key}>
          <span>{mappingLabel(key)}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}

function defaultMappings(result: HomeAssistantConnectionTestResult): MappingSelection {
  return {
    occupancyId: firstOption(result.options.occupancy),
    televisionPowerId: firstOption(result.options.televisionPower),
    hearthForegroundId: firstOption(result.options.hearthForeground),
    protectedMediaId: firstOption(result.options.protectedMedia),
    eveningScriptId: matchingScript(result.options.scripts, 'evening', 0),
    goodnightScriptId: matchingScript(result.options.scripts, 'goodnight', 1),
    screenOffScriptId: matchingScript(result.options.scripts, 'screen off', 2),
  };
}

function firstOption(options: HomeAssistantConnectionOption[]): string {
  return options[0]?.id ?? '';
}

function matchingScript(
  options: HomeAssistantConnectionOption[],
  phrase: string,
  fallbackIndex: number,
): string {
  return (
    options.find((option) => option.displayName.toLowerCase().includes(phrase))?.id ??
    options[fallbackIndex]?.id ??
    ''
  );
}

function mappingLabel(key: string): string {
  const labels: Record<string, string> = {
    occupancy: 'Occupancy',
    televisionPower: 'Television',
    hearthForeground: 'Hearth foreground',
    protectedMedia: 'Protected playback',
    evening: 'Evening',
    goodnight: 'Goodnight',
    screenOff: 'Screen off',
  };
  return labels[key] ?? key;
}

function formatCheckedAt(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
