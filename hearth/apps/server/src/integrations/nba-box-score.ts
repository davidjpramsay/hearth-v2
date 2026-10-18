import { z } from 'zod';
import {
  NbaBoxStatsSchema,
  NbaGameBoxSchema,
  type NbaBoxStats,
  type NbaGame,
  type NbaGameBox,
} from '@hearth/shared';
import { boundResponse } from './bounded-response.js';

export interface NbaBoxScoreProvider {
  readonly source: 'ESPN' | 'Fictional demo';
  read(game: NbaGame): Promise<NbaGameBox>;
}
const text = z.string().max(200);
const block = z.object({
  keys: z
    .array(text)
    .min(1)
    .max(40)
    .refine((keys) => new Set(keys).size === keys.length),
  totals: z.array(text).max(40),
  athletes: z
    .array(
      z.object({
        athlete: z.object({ id: z.string(), displayName: text }),
        starter: z.boolean(),
        didNotPlay: z.boolean(),
        reason: text.optional(),
        stats: z.array(text).max(40),
      }),
    )
    .min(1)
    .max(40),
});
const summary = z.object({
  header: z.object({
    id: z.string(),
    competitions: z
      .array(
        z.object({
          id: z.string(),
          status: z.object({
            type: z.object({
              name: text,
              state: z.enum(['pre', 'in', 'post']),
              completed: z.boolean(),
              shortDetail: text,
            }),
          }),
          competitors: z
            .array(
              z.object({
                homeAway: z.enum(['home', 'away']),
                team: z.object({ id: z.string() }),
                score: z.string().max(10).optional(),
              }),
            )
            .length(2),
        }),
      )
      .length(1),
  }),
});
// Pregame rosters are not box scores; parse these only once play has begun.
const boxscore = z.object({
  players: z
    .array(
      z.object({
        team: z.object({ id: z.string() }),
        statistics: z.array(block).length(1),
      }),
    )
    .length(2),
});
const missing = (value: string | undefined) =>
  value === undefined || ['', '--', '—', '-'].includes(value);
function integer(value: string | undefined): number | null {
  if (missing(value)) return null;
  if (!/^[+-]?\d+$/.test(value!)) throw new Error('Invalid box score number');
  return Number(value);
}
function shots(value: string | undefined) {
  if (missing(value)) return null;
  const match = /^(\d+)-(\d+)$/.exec(value!);
  if (!match) throw new Error('Invalid shooting line');
  return { made: Number(match[1]), attempted: Number(match[2]) };
}
export function emptyBoxStats(): NbaBoxStats {
  return NbaBoxStatsSchema.parse(
    Object.fromEntries(Object.keys(NbaBoxStatsSchema.shape).map((key) => [key, null])),
  );
}
function stats(keys: string[], values: string[]): NbaBoxStats {
  if (values.length !== keys.length) throw new Error('Incomplete box score columns');
  const fields = new Map(keys.map((key, i) => [key, values[i]]));
  if (!['points', 'assists', 'rebounds'].every((key) => fields.has(key)))
    throw new Error('Missing core box score columns');
  const minutes = fields.get('minutes');
  return NbaBoxStatsSchema.parse({
    points: integer(fields.get('points')),
    assists: integer(fields.get('assists')),
    rebounds: integer(fields.get('rebounds')),
    steals: integer(fields.get('steals')),
    blocks: integer(fields.get('blocks')),
    turnovers: integer(fields.get('turnovers')),
    fouls: integer(fields.get('fouls')),
    plusMinus: integer(fields.get('plusMinus')),
    minutes: missing(minutes) ? null : minutes,
    fieldGoals: shots(fields.get('fieldGoalsMade-fieldGoalsAttempted')),
    threePointers: shots(fields.get('threePointFieldGoalsMade-threePointFieldGoalsAttempted')),
    freeThrows: shots(fields.get('freeThrowsMade-freeThrowsAttempted')),
    offensiveRebounds: integer(fields.get('offensiveRebounds')),
    defensiveRebounds: integer(fields.get('defensiveRebounds')),
  });
}
export function projectNbaBoxScore(raw: unknown, expected: NbaGame): NbaGameBox {
  const parsed = summary.parse(raw);
  const competition = parsed.header.competitions[0]!;
  const home = competition.competitors.find((team) => team.homeAway === 'home');
  const away = competition.competitors.find((team) => team.homeAway === 'away');
  if (
    parsed.header.id !== expected.id ||
    competition.id !== expected.id ||
    home?.team.id !== expected.homeTeamId ||
    away?.team.id !== expected.awayTeamId
  )
    throw new Error('Mismatched NBA game');
  const state = competition.status.type;
  const status = /POSTPONED/.test(state.name)
    ? 'postponed'
    : /CANCEL/.test(state.name)
      ? 'cancelled'
      : state.completed
        ? 'final'
        : state.state === 'in'
          ? 'in-progress'
          : 'scheduled';
  const game: NbaGame = {
    ...expected,
    status,
    detail: state.shortDetail,
    homeScore: status === 'final' || status === 'in-progress' ? integer(home.score) : null,
    awayScore: status === 'final' || status === 'in-progress' ? integer(away.score) : null,
  };
  if (['scheduled', 'postponed', 'cancelled'].includes(status))
    return NbaGameBoxSchema.parse({ game, teams: null });
  if (game.homeScore === null || game.awayScore === null) throw new Error('Box score unavailable');
  const teams = z
    .object({ boxscore })
    .parse(raw)
    .boxscore.players.map((team) => {
      const section = team.statistics[0]!;
      const totals = stats(section.keys, section.totals);
      if (totals.points !== (team.team.id === game.homeTeamId ? game.homeScore : game.awayScore))
        throw new Error('Inconsistent team score');
      return {
        teamId: team.team.id,
        totals,
        players: section.athletes.map((player) => ({
          id: player.athlete.id,
          name: player.athlete.displayName,
          starter: player.starter,
          didNotPlay: player.didNotPlay,
          reason: player.didNotPlay ? (player.reason?.slice(0, 100) ?? null) : null,
          stats: player.didNotPlay ? emptyBoxStats() : stats(section.keys, player.stats),
        })),
      };
    });
  return NbaGameBoxSchema.parse({ game, teams });
}
export class EspnNbaBoxScore implements NbaBoxScoreProvider {
  readonly source = 'ESPN' as const;
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async read(game: NbaGame) {
    if (!/^\d{1,20}$/.test(game.id)) throw new Error('Invalid game ID');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await this.fetcher(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${game.id}`,
        { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json' } },
      );
      if (!response.ok) throw new Error('NBA box score unavailable');
      const body = await boundResponse(response, 4 * 1024 * 1024, controller.signal);
      return projectNbaBoxScore(await body.json(), game);
    } finally {
      clearTimeout(timeout);
    }
  }
}
export class DemoNbaBoxScore implements NbaBoxScoreProvider {
  readonly source = 'Fictional demo' as const;
  async read(game: NbaGame): Promise<NbaGameBox> {
    const teams =
      game.status === 'scheduled'
        ? null
        : [game.awayTeamId, game.homeTeamId].map((teamId, side) => {
            const score = (side === 0 ? game.awayScore : game.homeScore) ?? 0;
            const players = Array.from({ length: 13 }, (_, i) => ({
              id: String(10000 + side * 100 + i),
              name: `${['Jordan', 'Taylor', 'Casey', 'Alex', 'Sam'][i % 5]} Example ${i + 1}`,
              starter: i < 5,
              didNotPlay: i === 12,
              reason: i === 12 ? "Coach's decision" : null,
              stats:
                i === 12
                  ? emptyBoxStats()
                  : {
                      points: i === 0 ? score - 88 : 8,
                      assists: i < 5 ? 3 : 1,
                      rebounds: i < 5 ? 4 : 2,
                      steals: 1,
                      blocks: 0,
                      turnovers: 1,
                      fouls: 2,
                      minutes: '20',
                      plusMinus: side ? 6 : -6,
                      fieldGoals: {
                        made: i === 0 ? Math.floor((score - 88) / 2) : 3,
                        attempted: i === 0 ? Math.floor((score - 88) / 2) + 4 : 8,
                      },
                      threePointers: { made: i === 0 ? 0 : 1, attempted: 3 },
                      freeThrows: {
                        made: i === 0 ? (score - 88) % 2 : 1,
                        attempted: i === 0 ? ((score - 88) % 2) + 1 : 2,
                      },
                      offensiveRebounds: 1,
                      defensiveRebounds: i < 5 ? 3 : 1,
                    },
            }));
            return {
              teamId,
              players,
              totals: {
                ...emptyBoxStats(),
                points: score,
                assists: 22,
                rebounds: 34,
                steals: 12,
                blocks: 0,
                turnovers: 12,
                fouls: 24,
                offensiveRebounds: 12,
                defensiveRebounds: 22,
                fieldGoals: {
                  made: Math.floor((score - 88) / 2) + 33,
                  attempted: Math.floor((score - 88) / 2) + 92,
                },
                threePointers: { made: 11, attempted: 36 },
                freeThrows: { made: ((score - 88) % 2) + 11, attempted: ((score - 88) % 2) + 23 },
              },
            };
          });
    return NbaGameBoxSchema.parse({ game, teams });
  }
}
