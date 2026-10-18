import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NBA_TEAMS, type NbaSettings, type UpdateNbaSettings } from '@hearth/shared';
import { nbaApi } from '../api/nba';
import { createRequestId, HearthApiError } from '../api/core';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminPage, AdminQueryState } from '../components/AdminPage';
import './NbaScreen.css';

export function NbaSettingsScreen() {
  const query = useQuery({
    queryKey: queryKeys.nbaSettings,
    queryFn: ({ signal }) => nbaApi.settings(signal),
    retry: false,
  });
  if (!query.data)
    return (
      <AdminQueryState
        title="NBA teams"
        backTo="/more"
        backLabel="Back to More"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  return <NbaTeamsForm initial={query.data} />;
}
function NbaTeamsForm({ initial }: { initial: NbaSettings }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState(initial.standoutTeamIds);
  const [busy, setBusy] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<UpdateNbaSettings | null>(null);
  const running = useRef(false);
  async function save() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFrozen(true);
    setError(null);
    setMessage('');
    pending.current ??= { requestId: createRequestId('nba'), standoutTeamIds: selected };
    try {
      await nbaApi.save(pending.current);
      pending.current = null;
      setFrozen(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.nbaSettings }),
        client.invalidateQueries({ queryKey: [queryKeys.nba[0], 'nba'] }),
      ]);
      setMessage('Standout teams saved.');
    } catch (failure) {
      if (
        failure instanceof HearthApiError &&
        [
          'VALIDATION_ERROR',
          'FORBIDDEN',
          'UNAUTHENTICATED',
          'CONFLICT',
          'MODULE_DISABLED',
        ].includes(failure.payload.error.code)
      ) {
        pending.current = null;
        setFrozen(false);
      }
      setError(failure instanceof Error ? failure.message : 'Could not confirm this change.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <AdminPage
      title="NBA teams"
      subtitle="A little more focus on your favourites"
      backTo="/more"
      backLabel="Back to More"
    >
      <p>
        Choose up to five standout teams for this home. Everyone can still browse the full league.
        Choose none to give all teams equal focus.
      </p>
      <p role="status">{busy ? 'Saving…' : message || `${selected.length} of 5 teams selected`}</p>
      {error ? <AdminError message={error} onRetry={() => void save()} /> : null}
      <fieldset className="nba-team-picker" disabled={busy || frozen}>
        <legend>Standout teams</legend>
        {NBA_TEAMS.map(([id, name]) => (
          <label key={id} className="nba-team-choice">
            <input
              type="checkbox"
              checked={selected.includes(id)}
              disabled={!selected.includes(id) && selected.length >= 5}
              onChange={() =>
                setSelected((current) =>
                  current.includes(id) ? current.filter((team) => team !== id) : [...current, id],
                )
              }
            />
            <span>{name}</span>
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="button button--primary nba-save focusable"
        disabled={busy}
        onClick={() => void save()}
      >
        Save teams
      </button>
      <p className="field-help">
        Scores and schedules come from a public ESPN feed, cached for 15 minutes. This is not live
        play-by-play. Turning NBA off keeps your teams saved.
      </p>
    </AdminPage>
  );
}
