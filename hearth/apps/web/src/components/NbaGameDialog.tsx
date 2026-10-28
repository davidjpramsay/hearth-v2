import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NBA_TEAMS, type NbaBoxStats, type NbaBoxTeam, type NbaGame } from '@hearth/shared';
import { nbaApi } from '../api/nba';
import { queryKeys } from '../api/queryKeys';
import { NbaTeamMark } from './NbaArtwork';
import './NbaGameDialog.css';

const name = (id: string) => NBA_TEAMS.find(([team]) => team === id)?.[1] ?? 'Team';
const mainColumns = [
  ['points', 'Points'],
  ['assists', 'Assists'],
  ['rebounds', 'Rebounds'],
  ['steals', 'Steals'],
  ['blocks', 'Blocks'],
  ['turnovers', 'Turnovers'],
  ['fouls', 'Fouls'],
  ['minutes', 'Minutes'],
  ['plusMinus', '+/−'],
] as const;
const shootingColumns = [
  ['points', 'Points'],
  ['assists', 'Assists'],
  ['rebounds', 'Rebounds'],
  ['fieldGoals', 'Field goals'],
  ['threePointers', '3-pointers'],
  ['freeThrows', 'Free throws'],
  ['offensiveRebounds', 'Off. rebounds'],
  ['defensiveRebounds', 'Def. rebounds'],
] as const;
function value(stats: NbaBoxStats, key: keyof NbaBoxStats) {
  const item = stats[key];
  if (item === null) return '—';
  if (typeof item === 'object')
    return (
      <>
        {item.made}/{item.attempted}
        <small>
          {item.attempted ? `${((100 * item.made) / item.attempted).toFixed(1)}%` : '—'}
        </small>
      </>
    );
  return key === 'plusMinus' && typeof item === 'number' && item > 0 ? `+${item}` : item;
}

export function NbaGameDialog({
  game,
  timezone,
  onClose,
}: {
  game: NbaGame;
  timezone: string;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [teamId, setTeamId] = useState(game.awayTeamId);
  const [shooting, setShooting] = useState(false);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: queryKeys.nbaGame(game.id),
    queryFn: ({ signal }) => nbaApi.game(game.id, signal),
    staleTime: 60_000,
    gcTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    return () => {
      if (opener.current?.isConnected) opener.current.focus();
    };
  }, []);
  const detail = query.data;
  const revealed = detail?.game ?? game;
  const team = detail?.teams?.find((item) => item.teamId === teamId);
  const pages = Math.max(1, Math.ceil((team?.players.length ?? 0) / 8));
  const currentPage = Math.min(page, pages);
  const statsUnavailable = (query.isError && !detail?.teams) || detail?.status === 'unavailable';
  return (
    <div
      className="event-detail nba-detail"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nba-detail-title"
    >
      <div className="event-detail__panel nba-detail-panel">
        <header className="nba-detail-header">
          <div>
            <h2 id="nba-detail-title">Game box score</h2>
            <p>
              {new Intl.DateTimeFormat('en-AU', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: timezone,
              }).format(new Date(revealed.startsAt))}{' '}
              · {revealed.detail}
            </p>
          </div>
          <button
            ref={close}
            type="button"
            className="button focusable"
            data-back-dismiss="true"
            data-focus-id="nba-detail-close"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="nba-scoreboard" aria-label="Game score">
          {[
            { id: revealed.awayTeamId, score: revealed.awayScore, location: 'Away' },
            { id: revealed.homeTeamId, score: revealed.homeScore, location: 'Home' },
          ].map(({ id, score, location }) => (
            <div className="nba-score-team" key={id}>
              <NbaTeamMark teamId={id} />
              <span>
                {name(id)}
                <small>{location}</small>
              </span>
              <strong aria-label={`${name(id)} total score ${score ?? 'not available'}`}>
                {score ?? '—'}
              </strong>
            </div>
          ))}
        </div>
        {detail?.status === 'stale' || (query.isError && detail?.teams) ? (
          <p className="nba-warning" role="status">
            Saved box score · latest refresh unavailable. Check the fetched time below.
          </p>
        ) : null}
        {query.isPending ? <p role="status">Loading player stats…</p> : null}
        {statsUnavailable ? (
          <div className="nba-detail-message" role="status">
            <h3>Player stats unavailable</h3>
            <p>The feed could not be read. No missing stats have been replaced with zeroes.</p>
          </div>
        ) : null}
        {!query.isPending && !statsUnavailable && !team ? (
          <div className="nba-detail-message" role="status">
            <h3>
              {revealed.status === 'scheduled' ? 'This game has not started' : 'No box score yet'}
            </h3>
            <p>Player stats appear here once the game is under way. A dash means not available.</p>
          </div>
        ) : null}
        {team ? (
          <>
            <div className="nba-detail-controls" aria-label="Box score controls">
              <div className="nba-team-tabs" aria-label="Team player lists">
                {[revealed.awayTeamId, revealed.homeTeamId].map((id) => (
                  <button
                    type="button"
                    className="button focusable"
                    data-focus-id={`nba-detail-team-${id}`}
                    key={id}
                    aria-pressed={teamId === id}
                    onClick={() => {
                      setTeamId(id);
                      setPage(1);
                    }}
                  >
                    {name(id)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="button focusable"
                data-focus-id="nba-detail-stats"
                onClick={() => setShooting(!shooting)}
              >
                {shooting ? 'Player stats' : 'Shooting & rebounds'}
              </button>
            </div>
            <BoxTable team={team} shooting={shooting} page={currentPage} />
            <div className="nba-detail-pager">
              <button
                type="button"
                className="button focusable"
                data-focus-id="nba-detail-previous"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous players
              </button>
              <span role="status">
                {currentPage} / {pages} · {team.players.length} players
              </span>
              <button
                type="button"
                className="button focusable"
                data-focus-id="nba-detail-next"
                disabled={currentPage >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next players
              </button>
            </div>
          </>
        ) : null}
        <footer className="nba-detail-footnote">
          <p>
            {detail?.source ?? 'NBA'}
            {detail?.fetchedAt
              ? ` · Fetched ${new Intl.DateTimeFormat('en-AU', { timeStyle: 'short', timeZone: timezone }).format(new Date(detail.fetchedAt))}`
              : ''}{' '}
            · {timezone} · Cached 1 min, not live play-by-play.
          </p>
          <button
            type="button"
            className="button focusable"
            data-focus-id="nba-detail-refresh"
            aria-disabled={query.isFetching}
            aria-busy={query.isFetching}
            onClick={() => {
              if (!query.isFetching) void query.refetch();
            }}
          >
            {query.isFetching ? 'Checking…' : 'Check stats'}
          </button>
        </footer>
      </div>
    </div>
  );
}
function BoxTable({ team, shooting, page }: { team: NbaBoxTeam; shooting: boolean; page: number }) {
  const columns = shooting ? shootingColumns : mainColumns;
  const players = [...team.players].sort(
    (a, b) => Number(a.didNotPlay) - Number(b.didNotPlay) || Number(b.starter) - Number(a.starter),
  );
  return (
    <div className="nba-box-wrap">
      <table className="nba-box-table">
        <caption>
          {name(team.teamId)} ·{' '}
          {shooting
            ? 'Shooting: made/attempted, percentage; offensive & defensive rebounds'
            : 'Player stats · Fouls = personal fouls · +/− = team net points while on court'}{' '}
          · — = unavailable
        </caption>
        <thead>
          <tr>
            <th scope="col">Player</th>
            {columns.map(([key, label]) => (
              <th scope="col" key={key}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.slice((page - 1) * 8, page * 8).map((player) => (
            <tr key={player.id}>
              <th scope="row">
                {player.name}
                <small>
                  {player.didNotPlay
                    ? `Did not play${player.reason ? ` · ${player.reason}` : ''}`
                    : player.starter
                      ? 'Starter'
                      : 'Bench'}
                </small>
              </th>
              {columns.map(([key, label]) => (
                <td key={key} data-label={label}>
                  {value(player.stats, key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">
              Team totals<small>Entire game</small>
            </th>
            {columns.map(([key, label]) => (
              <td key={key} data-label={label}>
                {value(team.totals, key)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
