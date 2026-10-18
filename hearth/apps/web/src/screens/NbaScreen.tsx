import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { NBA_TEAMS, type NbaGame, type NbaOverview } from '@hearth/shared';
import { addLocalDays } from '@hearth/core';
import { nbaApi } from '../api/nba';
import { queryKeys } from '../api/queryKeys';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState, FailureState, LoadingState } from '../components/Status';
import { Icon } from '../components/Icon';
import { useHearthRuntime } from '../runtime/context';
import './NbaScreen.css';

const views = {
  week: 'This week',
  next: 'Next week',
  standings: 'Standings',
  highlights: 'Weekly best',
} as const;
type View = keyof typeof views;
const teamName = (id: string) => NBA_TEAMS.find(([team]) => team === id)?.[1] ?? 'Team';
const teamShort = (id: string) => NBA_TEAMS.find(([team]) => team === id)?.[2] ?? id;
function day(date: string) {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

export function NbaScreen() {
  const query = useQuery({
    queryKey: queryKeys.nba,
    queryFn: ({ signal }) => nbaApi.get(signal),
    staleTime: 60_000,
    retry: false,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  return (
    <div className="screen nba-screen">
      <ScreenHeader
        title="NBA"
        meta={
          query.data?.data
            ? `${query.data.data.season} · ${query.data.data.phase}`
            : 'Around the league'
        }
      />
      {query.isPending ? (
        <LoadingState />
      ) : !query.data ? (
        <FailureState onRetry={() => void query.refetch()} />
      ) : (
        <NbaContent
          overview={query.data}
          failed={query.isError}
          busy={query.isFetching}
          onRefresh={() => void query.refetch()}
        />
      )}
    </div>
  );
}
function NbaContent({
  overview,
  failed,
  busy,
  onRefresh,
}: {
  overview: NbaOverview;
  failed: boolean;
  busy: boolean;
  onRefresh: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const runtime = useHearthRuntime();
  const requested = params.get('view');
  const view: View =
    requested !== null && Object.hasOwn(views, requested) ? (requested as View) : 'week';
  const favourites = overview.settings.standoutTeamIds;
  const focused = favourites.length > 0 && (params.get('teams') ?? 'standout') === 'standout';
  const conference = params.get('conference') === 'West' ? 'West' : 'East';
  const matches = (id: string) => !focused || favourites.includes(id);
  const allGames = (overview.data?.games ?? []).filter(
    (game) =>
      (view === 'next'
        ? game.localDate >= overview.nextWeekStart
        : game.localDate < overview.nextWeekStart) &&
      (matches(game.homeTeamId) || matches(game.awayTeamId)),
  );
  const rows = (overview.data?.standings ?? [])
    .filter((row) => row.conference === conference && matches(row.teamId))
    .sort((a, b) => a.rank - b.rank);
  const highlights = (overview.data?.highlights ?? []).filter((mark) => matches(mark.teamId));
  const count =
    view === 'standings'
      ? rows.length
      : view === 'highlights'
        ? highlights.length
        : allGames.length;
  const pageSize = view === 'standings' ? 8 : 6;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const requestedPage = Number(params.get('page') ?? 1);
  const page = Number.isInteger(requestedPage) ? Math.min(pages, Math.max(1, requestedPage)) : 1;
  function choose(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  }
  const start = view === 'next' ? overview.nextWeekStart : overview.weekStart;
  return (
    <>
      {overview.status === 'stale' || failed ? (
        <p className="nba-warning" role="status">
          Showing saved NBA data. The latest feed refresh is unavailable; check the fetched time
          below.
        </p>
      ) : null}
      <div className="nba-toolbar" aria-label="NBA views">
        {Object.entries(views).map(([id, label], index) => (
          <button
            type="button"
            className="button focusable"
            key={id}
            aria-pressed={view === id}
            data-focus-id={`nba-${id}`}
            data-focus-entry={index === 0 ? 'true' : undefined}
            data-focus-left={index === 0 ? 'nav-nba' : undefined}
            onClick={() => choose('view', id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="nba-filter-row">
        <p>
          {view === 'standings'
            ? 'Conference records'
            : `${day(start)} – ${day(addLocalDays(start, 6))}`}{' '}
          <span>· {overview.timezone}</span>
        </p>
        <div className="nba-controls">
          {favourites.length > 0 ? (
            <button
              className="button focusable"
              data-focus-id="nba-teams"
              aria-pressed={focused}
              onClick={() => choose('teams', focused ? 'all' : 'standout')}
            >
              {focused ? '★ Standout teams' : 'All teams'}
            </button>
          ) : null}
          {view === 'standings' ? (
            <button
              className="button focusable"
              data-focus-id="nba-conference"
              onClick={() => choose('conference', conference === 'East' ? 'West' : 'East')}
            >
              {conference} · switch conference
            </button>
          ) : null}
        </div>
      </div>
      <div className="nba-body" aria-live="polite">
        {overview.data === null ? (
          <EmptyState
            title="NBA data is unavailable"
            description="The sports feed could not be read. Try again shortly; no settings have been lost."
          />
        ) : count === 0 ? (
          <EmptyState
            title={
              view === 'highlights'
                ? 'No weekly highlights yet'
                : view === 'standings'
                  ? 'No matching teams in this conference'
                  : 'No games in this selection'
            }
            description={
              view === 'highlights'
                ? 'League-wide best single-game marks appear after completed games. Switch to all teams to see every highlight.'
                : 'Try all teams or another view. Off-season weeks can be quiet.'
            }
          />
        ) : view === 'standings' ? (
          <div className="nba-table-wrap">
            <table className="nba-table">
              <caption>
                {conference} · {overview.data.season} · {overview.data.phase}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Rank / team</th>
                  <th scope="col">W</th>
                  <th scope="col">L</th>
                  <th scope="col">Win %</th>
                  <th scope="col">GB</th>
                  <th scope="col">Streak</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice((page - 1) * pageSize, page * pageSize).map((row) => (
                  <tr key={row.teamId} data-standout={favourites.includes(row.teamId)}>
                    <th scope="row" aria-label={`${row.rank}. ${teamName(row.teamId)}`}>
                      <span>{row.rank}</span> {teamShort(row.teamId)}
                      {favourites.includes(row.teamId) ? (
                        <span aria-label="Standout team"> ★</span>
                      ) : null}
                      <small>{teamName(row.teamId)}</small>
                    </th>
                    <td>{row.wins}</td>
                    <td>{row.losses}</td>
                    <td>{(row.winPercent * 100).toFixed(1)}</td>
                    <td>{row.gamesBehind === 0 ? '—' : row.gamesBehind}</td>
                    <td>{row.streak}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : view === 'highlights' ? (
          <div className="nba-highlights">
            {highlights.slice((page - 1) * pageSize, page * pageSize).map((mark) => (
              <article
                className="nba-highlight"
                key={`${mark.category}-${mark.gameId}-${mark.player}`}
              >
                <p>Most {mark.category} · single game</p>
                <strong>{mark.value}</strong>
                <h2>{mark.player}</h2>
                <p>{teamName(mark.teamId)}</p>
                <small>
                  {day(mark.localDate)}
                  {overview.data!.highlights.filter((other) => other.category === mark.category)
                    .length > 1
                    ? ' · Tied best'
                    : ''}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className="nba-games">
            {allGames.slice((page - 1) * pageSize, page * pageSize).map((game) => (
              <GameCard
                key={game.id}
                game={game}
                favourites={favourites}
                timezone={overview.timezone}
                locale={runtime.locale}
              />
            ))}
          </div>
        )}
      </div>
      {view === 'highlights' ? (
        <p className="nba-note">
          Best single-game marks from completed games this week—not weekly totals or averages.
          Standout filter shows only league-leading marks by those teams.
        </p>
      ) : null}
      <div className="nba-footer">
        <div className="nba-pager" aria-label="NBA pages">
          <button
            className="button focusable"
            data-focus-id="nba-previous"
            disabled={page <= 1}
            onClick={() => choose('page', String(page - 1))}
          >
            Previous
          </button>
          <span role="status">
            {page} / {pages} · {count}{' '}
            {view === 'standings' ? 'teams' : view === 'highlights' ? 'highlights' : 'games'}
          </span>
          <button
            className="button focusable"
            data-focus-id="nba-next"
            disabled={page >= pages}
            onClick={() => choose('page', String(page + 1))}
          >
            Next
          </button>
        </div>
        <button
          className="button focusable"
          data-focus-id="nba-refresh"
          disabled={busy}
          onClick={onRefresh}
        >
          <Icon name="refresh" />
          {busy ? 'Checking…' : 'Check for updates'}
        </button>
      </div>
      <p className="nba-source" role="status">
        {overview.status === 'stale' || failed ? 'Saved data · refresh unavailable. ' : ''}
        {overview.source === 'Fictional demo' ? (
          'Fictional demo · not actual NBA results'
        ) : (
          <>
            Data:{' '}
            <a href="https://www.espn.com/nba/" target="_blank" rel="noreferrer">
              ESPN
            </a>
          </>
        )}
        {overview.fetchedAt
          ? ` · Fetched ${new Intl.DateTimeFormat(runtime.locale, { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short', timeZone: overview.timezone }).format(new Date(overview.fetchedAt))}`
          : ''}{' '}
        · Cached 15 min, not live play-by-play.
      </p>
    </>
  );
}
function GameCard({
  game,
  favourites,
  timezone,
  locale,
}: {
  game: NbaGame;
  favourites: string[];
  timezone: string;
  locale: string;
}) {
  return (
    <article
      className="nba-game"
      data-standout={favourites.includes(game.homeTeamId) || favourites.includes(game.awayTeamId)}
    >
      <header>
        <span>{day(game.localDate)}</span>
        <span>
          {game.status === 'scheduled'
            ? new Intl.DateTimeFormat(locale, {
                hour: 'numeric',
                minute: '2-digit',
                timeZone: timezone,
              }).format(new Date(game.startsAt))
            : game.detail}
        </span>
      </header>
      {[
        [game.awayTeamId, game.awayScore, 'Away'],
        [game.homeTeamId, game.homeScore, 'Home'],
      ].map(([id, score, location]) => (
        <div className="nba-game-team" key={id}>
          <span>
            <small>{location}</small> {teamName(String(id))}
            {favourites.includes(String(id)) ? <span aria-label="Standout team"> ★</span> : null}
          </span>
          <strong>{score ?? '—'}</strong>
        </div>
      ))}
      <footer>
        {game.phase}
        {game.status === 'in-progress' ? ' · In progress at last fetch' : ''}
      </footer>
    </article>
  );
}
