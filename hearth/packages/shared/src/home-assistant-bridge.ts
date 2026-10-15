import { z } from 'zod';
import { ConnectionCodeSchema } from './connection-codes.js';

import {
  ChoreStateSchema,
  LocalDateSchema,
  OpaqueIdSchema,
  TimestampSchema,
  TimezoneSchema,
} from './schemas.js';

export const SCREEN_TAB_PATHS = {
  today: '/today',
  calendar: '/calendar/agenda',
  calendar_week: '/calendar/week',
  calendar_month: '/calendar/month',
  weather: '/weather',
  reminders: '/reminders',
  chores: '/chores',
  lists: '/lists',
  meals: '/meals',
  home: '/home',
  photos: '/photos',
  games: '/games',
  more: '/more',
} as const;
export const ScreenTabSchema = z.enum(
  Object.keys(SCREEN_TAB_PATHS) as [
    keyof typeof SCREEN_TAB_PATHS,
    ...(keyof typeof SCREEN_TAB_PATHS)[],
  ],
);
export type ScreenTab = z.infer<typeof ScreenTabSchema>;
export function screenTabForPath(path: string): ScreenTab | null {
  return (
    (Object.entries(SCREEN_TAB_PATHS).find(([, route]) => route === path)?.[0] as
      ScreenTab | undefined) ?? null
  );
}
export const AutomationSecretSchema = z.string().regex(/^ha_[A-Za-z0-9_-]{43}$/);
const BridgeGrantFieldsSchema = z
  .object({
    requestId: OpaqueIdSchema,
    secret: AutomationSecretSchema,
    screenIds: z
      .array(OpaqueIdSchema)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length),
    shareChores: z.boolean(),
    shareCalendar: z.boolean(),
    controlChores: z.boolean().default(false),
  })
  .strict();
export const BridgeGrantRequestSchema = BridgeGrantFieldsSchema.refine(
  (value) => !value.controlChores || value.shareChores,
  'Share chores before allowing completion changes',
);
export type BridgeGrantRequest = z.infer<typeof BridgeGrantRequestSchema>;
// The integration generates the secret. The adult sees/types only the expiring code.
export const BridgePairingStartSchema = BridgeGrantFieldsSchema.pick({
  requestId: true,
  secret: true,
});
export const BridgePairingSchema = z.object({
  id: OpaqueIdSchema,
  code: ConnectionCodeSchema,
  expiresAt: TimestampSchema,
  interval: z.literal(3),
});
export const BridgePairingExchangeSchema = z.object({ secret: AutomationSecretSchema }).strict();
export const BridgePairingApprovalSchema = BridgeGrantFieldsSchema.omit({ secret: true })
  .extend({ code: ConnectionCodeSchema })
  .strict()
  .refine(
    (value) => !value.controlChores || value.shareChores,
    'Share chores before allowing completion changes',
  );
export type BridgePairingApproval = z.infer<typeof BridgePairingApprovalSchema>;
export const BridgePairingApprovalResultSchema = z.object({
  approved: z.literal(true),
  expiresAt: TimestampSchema,
});
export const BridgeConnectionSchema = BridgeGrantFieldsSchema.omit({
  secret: true,
  requestId: true,
}).extend({
  id: OpaqueIdSchema,
  createdAt: TimestampSchema,
  revokedAt: TimestampSchema.nullable(),
});
export type BridgeConnection = z.infer<typeof BridgeConnectionSchema>;
export const BridgeGrantResultSchema = z.object({
  connection: BridgeConnectionSchema,
  replayed: z.boolean(),
});
export const BridgePairingExchangeResultSchema = z.object({
  state: z.enum(['waiting', 'connected']),
  receipt: BridgeGrantResultSchema.nullable(),
});
export const ScreenNavigationRequestSchema = z
  .object({ requestId: OpaqueIdSchema, tab: ScreenTabSchema })
  .strict();
export const ScreenCommandSchema = z.object({
  id: OpaqueIdSchema,
  tab: ScreenTabSchema,
  status: z.enum(['pending', 'applied', 'expired', 'superseded', 'cancelled']),
  createdAt: TimestampSchema,
  expiresAt: TimestampSchema,
});
export type ScreenCommand = z.infer<typeof ScreenCommandSchema>;
export const ScreenNavigationResultSchema = z.object({
  command: ScreenCommandSchema,
  replayed: z.boolean(),
});
export const BridgeChoreCompletionRequestSchema = z
  .object({
    requestId: OpaqueIdSchema,
    localDate: LocalDateSchema,
    isCompleted: z.boolean(),
    completionId: OpaqueIdSchema.nullable(),
  })
  .strict()
  .refine(
    (value) => (value.isCompleted ? value.completionId === null : value.completionId !== null),
    'Reopening requires the observed completion ID; completing requires null',
  );
export type BridgeChoreCompletionRequest = z.infer<typeof BridgeChoreCompletionRequestSchema>;
export const BridgeChoreCompletionResultSchema = z.object({
  id: OpaqueIdSchema,
  localDate: LocalDateSchema,
  state: z.enum(['pending', 'completed']),
  completionId: OpaqueIdSchema.nullable(),
  replayed: z.boolean(),
});
export type BridgeChoreCompletionResult = z.infer<typeof BridgeChoreCompletionResultSchema>;
export const ScreenPresentationRequestSchema = z
  .object({
    instanceId: OpaqueIdSchema,
    tab: ScreenTabSchema.nullable(),
    acknowledgedCommandId: OpaqueIdSchema.nullable(),
  })
  .strict();
export type ScreenPresentationRequest = z.infer<typeof ScreenPresentationRequestSchema>;
export const ScreenPresentationResultSchema = z.object({
  serverTime: TimestampSchema,
  command: ScreenCommandSchema.nullable(),
});
export const BridgeCalendarEventSchema = z.object({
  id: OpaqueIdSchema,
  title: z.string().max(160),
  start: TimestampSchema,
  end: TimestampSchema,
  startLocalDate: LocalDateSchema,
  endLocalDate: LocalDateSchema,
  allDay: z.boolean(),
});
export const BridgeCalendarSchema = z.object({
  freshness: z.enum(['current', 'stale', 'offline']),
  events: z.array(BridgeCalendarEventSchema).max(2000),
});
export const BridgeCalendarQuerySchema = z
  .object({ start: TimestampSchema, end: TimestampSchema })
  .strict()
  .refine((value) => {
    const duration = Date.parse(value.end) - Date.parse(value.start);
    return duration > 0 && duration <= 31 * 86400000;
  }, 'Calendar range must be positive and at most 31 days');
export const BridgeStateSchema = z.object({
  version: z.literal(1),
  generatedAt: TimestampSchema,
  household: z.object({ id: OpaqueIdSchema, name: z.string(), timezone: TimezoneSchema }),
  permissions: z.object({
    shareChores: z.boolean(),
    shareCalendar: z.boolean(),
    controlChores: z.boolean().default(false),
  }),
  screens: z
    .array(
      z.object({
        id: OpaqueIdSchema,
        name: z.string(),
        online: z.boolean(),
        currentTab: ScreenTabSchema.nullable(),
        lastSeenAt: TimestampSchema.nullable(),
        command: ScreenCommandSchema.nullable(),
      }),
    )
    .max(20),
  chores: z
    .object({
      localDate: LocalDateSchema,
      open: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
      truncated: z.boolean(),
      items: z
        .array(
          z.object({
            id: OpaqueIdSchema,
            title: z.string(),
            assignee: z.string(),
            state: ChoreStateSchema,
            completionId: OpaqueIdSchema.nullable().default(null),
            locked: z.boolean().default(false),
          }),
        )
        .max(250),
    })
    .nullable(),
  calendar: BridgeCalendarSchema.nullable(),
});
export type BridgeState = z.infer<typeof BridgeStateSchema>;
