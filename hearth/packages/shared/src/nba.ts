import { z } from 'zod';
import {
  AuditSummarySchema,
  LocalDateSchema,
  OpaqueIdSchema,
  TimestampSchema,
  TimezoneSchema,
} from './schemas.js';

export const NBA_TEAMS = [
  ['1', 'Atlanta Hawks', 'ATL'],
  ['2', 'Boston Celtics', 'BOS'],
  ['17', 'Brooklyn Nets', 'BKN'],
  ['30', 'Charlotte Hornets', 'CHA'],
  ['4', 'Chicago Bulls', 'CHI'],
  ['5', 'Cleveland Cavaliers', 'CLE'],
  ['6', 'Dallas Mavericks', 'DAL'],
  ['7', 'Denver Nuggets', 'DEN'],
  ['8', 'Detroit Pistons', 'DET'],
  ['9', 'Golden State Warriors', 'GS'],
  ['10', 'Houston Rockets', 'HOU'],
  ['11', 'Indiana Pacers', 'IND'],
  ['12', 'LA Clippers', 'LAC'],
  ['13', 'Los Angeles Lakers', 'LAL'],
  ['29', 'Memphis Grizzlies', 'MEM'],
  ['14', 'Miami Heat', 'MIA'],
  ['15', 'Milwaukee Bucks', 'MIL'],
  ['16', 'Minnesota Timberwolves', 'MIN'],
  ['3', 'New Orleans Pelicans', 'NO'],
  ['18', 'New York Knicks', 'NY'],
  ['25', 'Oklahoma City Thunder', 'OKC'],
  ['19', 'Orlando Magic', 'ORL'],
  ['20', 'Philadelphia 76ers', 'PHI'],
  ['21', 'Phoenix Suns', 'PHX'],
  ['22', 'Portland Trail Blazers', 'POR'],
  ['23', 'Sacramento Kings', 'SAC'],
  ['24', 'San Antonio Spurs', 'SA'],
  ['28', 'Toronto Raptors', 'TOR'],
  ['26', 'Utah Jazz', 'UTAH'],
  ['27', 'Washington Wizards', 'WSH'],
] as const;
/** Restrained ornamental accents, never the sole score/focus/status encoding. */
export const NBA_TEAM_COLOURS: Record<string, string> = {
  '1': '#c8102e',
  '2': '#008348',
  '17': '#343434',
  '30': '#008ca8',
  '4': '#ce1141',
  '5': '#860038',
  '6': '#0064b1',
  '7': '#0e2240',
  '8': '#1d428a',
  '9': '#fdb927',
  '10': '#ce0e2d',
  '11': '#0c2340',
  '12': '#12173f',
  '13': '#552583',
  '29': '#5d76a9',
  '14': '#98002e',
  '15': '#00471b',
  '16': '#266092',
  '3': '#0a2240',
  '18': '#1d428a',
  '25': '#007ac1',
  '19': '#0150b5',
  '20': '#1d428a',
  '21': '#29127a',
  '22': '#e03a3e',
  '23': '#5a2d81',
  '24': '#343434',
  '28': '#d91244',
  '26': '#4e008e',
  '27': '#e31837',
};
export const NbaPlayerIdSchema = z.string().regex(/^\d{1,10}$/);
export const NbaTeamIdSchema = z
  .string()
  .refine((id) => NBA_TEAMS.some(([team]) => team === id), 'Choose a current NBA team');
export const NbaSettingsSchema = z.object({
  standoutTeamIds: z
    .array(NbaTeamIdSchema)
    .max(5)
    .refine((ids) => new Set(ids).size === ids.length),
});
export const UpdateNbaSettingsSchema = NbaSettingsSchema.extend({
  requestId: OpaqueIdSchema,
}).strict();
export type NbaSettings = z.infer<typeof NbaSettingsSchema>;
export type UpdateNbaSettings = z.infer<typeof UpdateNbaSettingsSchema>;
export const NbaSettingsResultSchema = z.object({
  settings: NbaSettingsSchema,
  audit: AuditSummarySchema,
  replayed: z.boolean(),
});
export type NbaSettingsResult = z.infer<typeof NbaSettingsResultSchema>;
export const NbaStandingSchema = z.object({
  teamId: NbaTeamIdSchema,
  conference: z.enum(['East', 'West']),
  rank: z.number().int().min(1).max(30),
  wins: z.number().int().min(0).max(150),
  losses: z.number().int().min(0).max(150),
  winPercent: z.number().min(0).max(1),
  gamesBehind: z.number().min(0).max(150),
  streak: z.string().max(20),
});
export const NbaGameSchema = z.object({
  id: z.string().regex(/^\d{1,20}$/),
  startsAt: TimestampSchema,
  localDate: LocalDateSchema,
  homeTeamId: NbaTeamIdSchema,
  awayTeamId: NbaTeamIdSchema,
  homeScore: z.number().int().min(0).max(500).nullable(),
  awayScore: z.number().int().min(0).max(500).nullable(),
  status: z.enum(['scheduled', 'in-progress', 'final', 'postponed', 'cancelled']),
  detail: z.string().max(120),
  phase: z.enum(['Preseason', 'Regular season', 'Playoffs', 'Other']),
});
export type NbaGame = z.infer<typeof NbaGameSchema>;
export const NbaHighlightSchema = z.object({
  category: z.enum(['points', 'rebounds', 'assists']),
  value: z.number().int().min(0).max(200),
  player: z.string().min(1).max(100),
  playerId: NbaPlayerIdSchema.nullable().default(null),
  teamId: NbaTeamIdSchema,
  gameId: z.string().regex(/^\d{1,20}$/),
  localDate: LocalDateSchema,
});
export const NbaDataSchema = z.object({
  season: z.string().min(1).max(30),
  phase: z.string().min(1).max(40),
  standings: z.array(NbaStandingSchema).max(30),
  games: z.array(NbaGameSchema).max(250),
  highlights: z.array(NbaHighlightSchema).max(90),
});
export type NbaData = z.infer<typeof NbaDataSchema>;
export const NbaOverviewSchema = z.object({
  weekStart: LocalDateSchema,
  nextWeekStart: LocalDateSchema,
  endExclusive: LocalDateSchema,
  timezone: TimezoneSchema,
  settings: NbaSettingsSchema,
  status: z.enum(['current', 'stale', 'unavailable']),
  fetchedAt: TimestampSchema.nullable(),
  source: z.enum(['ESPN', 'Fictional demo']),
  data: NbaDataSchema.nullable(),
});
export type NbaOverview = z.infer<typeof NbaOverviewSchema>;
