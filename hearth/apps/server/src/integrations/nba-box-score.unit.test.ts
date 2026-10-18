import { describe, expect, it, vi } from 'vitest';
import { NbaGameBoxSchema, type NbaGame } from '@hearth/shared';
import { EspnNbaBoxScore, DemoNbaBoxScore, projectNbaBoxScore } from './nba-box-score.js';

const game: NbaGame = {
  id: '1000',
  homeTeamId: '1',
  awayTeamId: '2',
  homeScore: 110,
  awayScore: 108,
  status: 'final',
  detail: 'Final',
  phase: 'Regular season',
  startsAt: '2026-10-18T01:00:00Z',
  localDate: '2026-10-18',
};
function fixture() {
  const keys = [
    'minutes',
    'rebounds',
    'assists',
    'points',
    'fouls',
    'fieldGoalsMade-fieldGoalsAttempted',
    'threePointFieldGoalsMade-threePointFieldGoalsAttempted',
    'freeThrowsMade-freeThrowsAttempted',
    'plusMinus',
    'offensiveRebounds',
    'defensiveRebounds',
  ];
  return {
    header: {
      id: game.id,
      competitions: [
        {
          id: game.id,
          status: {
            type: { name: 'STATUS_FINAL', state: 'post', completed: true, shortDetail: 'Final' },
          },
          competitors: [
            { homeAway: 'home', team: { id: '1' }, score: '110' },
            { homeAway: 'away', team: { id: '2' }, score: '108' },
          ],
        },
      ],
    },
    boxscore: {
      players: ['1', '2'].map((id, i) => ({
        team: { id },
        statistics: [
          {
            keys: [...keys],
            totals: [
              '',
              '48',
              '23',
              String(110 - i * 2),
              '21',
              '40-80',
              '10-30',
              '20-25',
              '',
              '10',
              '38',
            ],
            athletes: [
              {
                athlete: { id: String(123 + i * 10), displayName: 'Example Player' },
                starter: true,
                didNotPlay: false,
                reason: "COACH'S DECISION",
                stats: ['32:15', '11', '7', '29', '3', '10-18', '3-7', '6-8', '+9', '2', '9'],
              },
              {
                athlete: { id: String(124 + i * 10), displayName: 'Bench Example' },
                starter: false,
                didNotPlay: true,
                reason: "COACH'S DECISION",
                stats: [],
              },
            ],
          },
        ],
      })),
    },
    odds: { privateProjectionMustNotContain: 'odds' },
  };
}
describe('NBA game box score projection', () => {
  it('maps named keys rather than column positions, separates teams, preserves reported totals and omits unrelated provider fields', () => {
    const result = projectNbaBoxScore(fixture(), game);
    expect(result.teams?.[0]?.players[0]?.stats).toMatchObject({
      points: 29,
      assists: 7,
      rebounds: 11,
      fouls: 3,
      minutes: '32:15',
      plusMinus: 9,
      steals: null,
      fieldGoals: { made: 10, attempted: 18 },
    });
    expect(result.teams?.[0]?.totals.points).toBe(110);
    expect(result.teams?.[0]?.players[0]?.reason).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/odds|headshot|https:/);
    const raw = fixture();
    for (const team of raw.boxscore.players) {
      const section = team.statistics[0]!;
      section.keys.reverse();
      section.totals.reverse();
      section.athletes[0]!.stats.reverse();
    }
    expect(projectNbaBoxScore(raw, game)).toEqual(result);
  });
  it('keeps DNP explicit with all stats null rather than invented zeroes', () => {
    const dnp = projectNbaBoxScore(fixture(), game).teams?.[0]?.players[1];
    expect(dnp?.didNotPlay).toBe(true);
    expect(dnp?.reason).toBe("COACH'S DECISION");
    expect(Object.values(dnp!.stats).every((value) => value === null)).toBe(true);
  });
  it('handles a scheduled game without a box score and strips scheduled zero scores', () => {
    const raw = fixture();
    Object.assign(raw.header.competitions[0]!.status.type, {
      completed: false,
      state: 'pre',
      name: 'STATUS_SCHEDULED',
    });
    const result = projectNbaBoxScore({ header: raw.header }, game);
    expect(result.teams).toBeNull();
    expect(result.game.homeScore).toBeNull();
    expect(result.game.status).toBe('scheduled');
    expect(
      projectNbaBoxScore(
        { header: raw.header, boxscore: { players: [{ team: { id: '1' }, statistics: [] }] } },
        game,
      ),
    ).toEqual(result);
  });
  it.each([
    'wrong-game',
    'wrong-team',
    'duplicate-player',
    'duplicate-team',
    'short-stats',
    'bad-number',
    'bad-shooting',
    'wrong-total',
    'duplicate-key',
    'missing-box',
  ])('fails safely on %s', (kind) => {
    const raw = fixture();
    const section = raw.boxscore.players[0]!.statistics[0]!;
    if (kind === 'wrong-game') raw.header.id = '999';
    if (kind === 'wrong-team') raw.header.competitions[0]!.competitors[0]!.team.id = '3';
    if (kind === 'duplicate-player') section.athletes.push(section.athletes[0]!);
    if (kind === 'duplicate-team') raw.boxscore.players[1]!.team.id = '1';
    if (kind === 'short-stats') section.athletes[0]!.stats.pop();
    if (kind === 'bad-number') section.athletes[0]!.stats[3] = 'unknown';
    if (kind === 'bad-shooting') section.athletes[0]!.stats[5] = '19-18';
    if (kind === 'wrong-total') section.totals[3] = '109';
    if (kind === 'duplicate-key') section.keys[0] = 'points';
    if (kind === 'missing-box') raw.boxscore.players = [];
    expect(() => projectNbaBoxScore(raw, game)).toThrow();
  });
  it('uses a fixed HTTPS endpoint, rejects redirects and limits decoded bytes', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixture()));
    await new EspnNbaBoxScore(fetcher).read(game);
    expect(fetcher).toHaveBeenCalledWith(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=1000',
      expect.objectContaining({ redirect: 'error' }),
    );
    fetcher.mockResolvedValue(new Response('x'.repeat(4 * 1024 * 1024 + 1)));
    await expect(new EspnNbaBoxScore(fetcher).read(game)).rejects.toThrow('size limit');
    await expect(new EspnNbaBoxScore(fetcher).read({ ...game, id: '../999' })).rejects.toThrow(
      'Invalid game',
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('aborts a stalled request at eight seconds', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(
          (_url, init) =>
            new Promise((_resolve, reject) =>
              init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
            ),
        );
      const failure = expect(new EspnNbaBoxScore(fetcher).read(game)).rejects.toThrow('aborted');
      await vi.advanceTimersByTimeAsync(8_000);
      await failure;
    } finally {
      vi.useRealTimers();
    }
  });
  it('provides deterministic, schema-valid fictional lists with starters, bench and DNP', async () => {
    const provider = new DemoNbaBoxScore();
    const result = await provider.read(game);
    expect(NbaGameBoxSchema.safeParse(result).success).toBe(true);
    expect(result).toEqual(await provider.read(game));
    expect(result.teams?.[0]?.players).toHaveLength(13);
  });
});
