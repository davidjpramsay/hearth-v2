import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import {
  SaveIndoorSettingsSchema,
  type IndoorDiscovery,
  type IndoorRoomSelection,
  type IndoorSettings,
  type SaveIndoorSettings,
} from '@hearth/shared';
import { indoorApi } from '../api/indoorClimate';
import { createRequestId, HearthApiError } from '../api/core';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminPage, AdminQueryState } from '../components/AdminPage';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import './IndoorSensorsSettingsScreen.css';

export function IndoorSensorsSettingsScreen() {
  const query = useQuery({
    queryKey: queryKeys.indoorSettings,
    queryFn: ({ signal }) => indoorApi.settings(signal),
    retry: false,
  });
  if (!query.data)
    return (
      <AdminQueryState
        title="Indoor sensors"
        backTo="/weather?view=indoors"
        backLabel="Back to Indoors"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  return <IndoorSensorsForm initial={query.data} />;
}
function IndoorSensorsForm({ initial }: { initial: IndoorSettings }) {
  const client = useQueryClient();
  const [rooms, setRooms] = useState(initial.rooms);
  const [saved, setSaved] = useState(initial);
  const [discovery, setDiscovery] = useState<IndoorDiscovery | null>(null);
  const [replace, setReplace] = useState(false);
  const [token, setToken] = useState('');
  const [url, setUrl] = useState('http://homeassistant.local');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const pending = useRef<SaveIndoorSettings | null>(null);
  const running = useRef(false);
  const [frozen, setFrozen] = useState(false);
  useUnsavedChanges(
    JSON.stringify(rooms) !== JSON.stringify(saved.rooms) || token !== '' || frozen,
  );
  const discover = async (event?: FormEvent) => {
    event?.preventDefault();
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      // Source credentials never enter React Query mutation/query caches or browser storage.
      const result = event
        ? await indoorApi.test({ serverUrl: url, accessToken: token })
        : await indoorApi.discover();
      setDiscovery(result);
      if (event) setRooms([]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not check these sensors.');
    } finally {
      setToken('');
      setBusy(false);
      running.current = false;
    }
  };
  const change = (index: number, patch: Partial<IndoorRoomSelection>) =>
    setRooms((current) => current.map((room, i) => (i === index ? { ...room, ...patch } : room)));
  const save = async () => {
    if (running.current || !discovery) return;
    const parsed = SaveIndoorSettingsSchema.safeParse({
      requestId: createRequestId('indoor_sensors'),
      testId: discovery.testId,
      revision: saved.revision,
      rooms,
    });
    if (!parsed.success) {
      setError(
        'Name every room and choose at least one sensor for each. Choose each sensor only once.',
      );
      return;
    }
    pending.current ??= parsed.data;
    running.current = true;
    setBusy(true);
    setFrozen(true);
    setError(null);
    setMessage('');
    try {
      const result = await indoorApi.save(pending.current);
      pending.current = null;
      setSaved(result.settings);
      setRooms(result.settings.rooms);
      setDiscovery(null);
      setReplace(false);
      setFrozen(false);
      setMessage('Indoor sensors saved.');
      client.setQueryData(queryKeys.indoorSettings, result.settings);
      await client.invalidateQueries({ queryKey: queryKeys.indoorClimate });
    } catch (failure) {
      if (
        failure instanceof HearthApiError &&
        [
          'VALIDATION_ERROR',
          'CONFLICT',
          'FORBIDDEN',
          'UNAUTHENTICATED',
          'MODULE_DISABLED',
        ].includes(failure.payload.error.code)
      ) {
        pending.current = null;
        setFrozen(false);
      }
      setError(
        failure instanceof Error ? failure.message : 'Could not confirm this save. Try again.',
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <AdminPage title="Indoor sensors" backTo="/weather?view=indoors" backLabel="Back to Indoors">
      <p>
        Show selected temperature and humidity sensors in Weather. Home Assistant keeps their
        history.
      </p>
      {message ? (
        <p className="save-confirmation" role="status">
          {message}
        </p>
      ) : null}
      {error ? <AdminError message={error} /> : null}
      {(!saved.configured || replace) && discovery === null ? (
        <form className="admin-form" onSubmit={(event) => void discover(event)}>
          <label>
            Home Assistant address
            <input
              required
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              maxLength={500}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Home Assistant access token
            <input
              required
              type="password"
              minLength={20}
              maxLength={512}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              disabled={busy}
            />
          </label>
          <p className="field-help">
            Paste a long-lived token from your HA administrator profile. Kept only in Hearth’s
            private server file; cleared here after checking. Hearth only reads the sensors you
            choose.
          </p>
          <button className="admin-submit" type="submit" disabled={busy}>
            {busy ? 'Checking sensors…' : 'Check sensors'}
          </button>
          {replace ? (
            <button
              className="admin-secondary"
              type="button"
              disabled={busy}
              onClick={() => setReplace(false)}
            >
              Cancel
            </button>
          ) : null}
        </form>
      ) : discovery === null ? (
        <>
          <div className="indoor-saved-rooms">
            {saved.rooms.map((room) => (
              <div key={room.id}>
                <strong>{room.label}</strong>
                <span>
                  {[room.temperatureId ? 'Temperature' : null, room.humidityId ? 'Humidity' : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
            ))}
          </div>
          <div className="indoor-settings-actions">
            <button
              type="button"
              className="admin-submit"
              disabled={busy}
              onClick={() => void discover()}
            >
              {busy ? 'Checking sensors…' : 'Choose sensors'}
            </button>
            <button
              type="button"
              className="admin-secondary"
              disabled={busy}
              onClick={() => setReplace(true)}
            >
              Replace source
            </button>
          </div>
        </>
      ) : null}
      {discovery ? (
        <section className="indoor-sensor-editor" aria-label="Selected indoor sensors">
          {discovery.options.length === 0 ? (
            <p>
              No compatible measurement sensors were found. In HA, check that your sensors report
              temperature or humidity and support statistics.
            </p>
          ) : null}
          <fieldset disabled={busy || frozen} className="indoor-room-editor">
            {rooms.map((room, index) => (
              <fieldset key={room.id} className="indoor-room-fields">
                <legend>Room {index + 1}</legend>
                <label>
                  Room name
                  <input
                    aria-label={`Room ${index + 1} name`}
                    value={room.label}
                    maxLength={60}
                    onChange={(event) => change(index, { label: event.target.value })}
                  />
                </label>
                {(['temperature', 'humidity'] as const).map((metric) => (
                  <label key={metric}>
                    {metric === 'temperature' ? 'Temperature' : 'Humidity'}
                    <select
                      aria-label={`Room ${index + 1} ${metric}`}
                      value={room[metric === 'temperature' ? 'temperatureId' : 'humidityId'] ?? ''}
                      onChange={(event) =>
                        change(index, {
                          [metric === 'temperature' ? 'temperatureId' : 'humidityId']:
                            event.target.value || null,
                        })
                      }
                    >
                      <option value="">Not selected</option>
                      {discovery.options
                        .filter((option) => option.metric === metric)
                        .map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
                <button
                  type="button"
                  className="admin-secondary"
                  onClick={() => setRooms((current) => current.filter((_, i) => i !== index))}
                >
                  Remove room {index + 1}
                </button>
              </fieldset>
            ))}
            <button
              className="admin-secondary"
              type="button"
              disabled={rooms.length >= 8 || discovery.options.length === 0}
              onClick={() =>
                setRooms((current) => [
                  ...current,
                  { id: createRequestId('room'), label: '', temperatureId: null, humidityId: null },
                ])
              }
            >
              Add room
            </button>
          </fieldset>
          <p className="field-help">Removing a room hides it in Hearth. Its HA history is kept.</p>
          <button
            className="admin-submit"
            type="button"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : frozen ? 'Retry exact save' : 'Save sensors'}
          </button>
          {!frozen ? (
            <button
              className="admin-secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                setRooms(saved.rooms);
                setDiscovery(null);
                setReplace(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          ) : null}
        </section>
      ) : null}
    </AdminPage>
  );
}
