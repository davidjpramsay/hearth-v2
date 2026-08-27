import { z } from 'zod';

import {
  CommandRequestSchema,
  LocalDateSchema,
  OpaqueIdSchema,
  PairingCodeSchema,
  PairingSecretSchema,
  TimestampSchema,
} from './schemas.js';

export const REMINDER_CONTRACT_VERSION = 1 as const;
export const MAX_REMINDER_SOURCE_LISTS = 50;
export const MAX_REMINDER_SNAPSHOT_ITEMS = 1_000;

/**
 * A source-scoped identifier supplied by EventKit. It is accepted only on the
 * native write boundary, hashed before persistence and never returned to a
 * household client.
 */
export const ReminderSourceExternalIdSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      [...value].every((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint > 0x1f && codePoint !== 0x7f;
      }),
    'Expected a bounded opaque source identifier',
  );

const ReminderTitleSchema = z
  .string()
  .trim()
  .max(240)
  .transform((value) => (value.length === 0 ? 'Untitled reminder' : value));

const ReminderListTitleSchema = z
  .string()
  .trim()
  .max(120)
  .transform((value) => (value.length === 0 ? 'Reminders' : value));

export const ReminderSourcePairingStatusSchema = z.enum([
  'pending',
  'approved',
  'exchanged',
  'expired',
  'cancelled',
]);

export const CreateReminderSourcePairingRequestSchema = CommandRequestSchema.extend({
  deviceName: z.string().trim().min(1).max(80),
  platform: z.literal('ios'),
  applicationVersion: z.string().trim().min(1).max(40),
  pairingSecret: PairingSecretSchema,
}).strict();

export const ReminderSourcePairingRequestSchema = z
  .object({
    id: OpaqueIdSchema,
    requestId: OpaqueIdSchema,
    code: PairingCodeSchema,
    deviceName: z.string().min(1).max(80),
    platform: z.literal('ios'),
    applicationVersion: z.string().min(1).max(40),
    status: ReminderSourcePairingStatusSchema,
    expiresAt: TimestampSchema,
  })
  .strict();

export const ApproveReminderSourcePairingRequestSchema = CommandRequestSchema.extend({
  code: PairingCodeSchema,
}).strict();

export const ExchangeReminderSourcePairingRequestSchema = CommandRequestSchema.extend({
  pairingSecret: PairingSecretSchema,
}).strict();

export const ReminderSourceScopeSchema = z.literal('reminders.snapshot.write');

export const ReminderSourceDeviceSessionSchema = z
  .object({
    contractVersion: z.literal(REMINDER_CONTRACT_VERSION),
    householdId: OpaqueIdSchema,
    deviceId: OpaqueIdSchema,
    sourceId: OpaqueIdSchema,
    scopes: z.tuple([ReminderSourceScopeSchema]),
    pairedAt: TimestampSchema,
    nextSnapshotSequence: z.number().int().positive(),
  })
  .strict();

export const ReminderSourceStatusSchema = z.enum([
  'awaiting-first-snapshot',
  'current',
  'stale',
  'revoked',
]);

export const ReminderSourceSummarySchema = z
  .object({
    id: OpaqueIdSchema,
    displayName: z.string().min(1).max(80),
    kind: z.literal('eventkit'),
    readOnly: z.literal(true),
    status: ReminderSourceStatusSchema,
    device: z.object({
      id: OpaqueIdSchema,
      name: z.string().min(1).max(80),
      platform: z.literal('ios'),
      applicationVersion: z.string().min(1).max(40),
      pairedAt: TimestampSchema,
      lastSeenAt: TimestampSchema.nullable(),
      revokedAt: TimestampSchema.nullable(),
    }),
    listCount: z.number().int().nonnegative().max(MAX_REMINDER_SOURCE_LISTS),
    reminderCount: z.number().int().nonnegative().max(MAX_REMINDER_SNAPSHOT_ITEMS),
    incompleteCount: z.number().int().nonnegative().max(MAX_REMINDER_SNAPSHOT_ITEMS),
    lastSnapshotGeneratedAt: TimestampSchema.nullable(),
    lastSnapshotReceivedAt: TimestampSchema.nullable(),
    nextSnapshotSequence: z.number().int().positive(),
  })
  .strict();

export const ReminderSourceSettingsSchema = z
  .object({
    householdId: OpaqueIdSchema,
    sources: z.array(ReminderSourceSummarySchema).max(10),
  })
  .strict();

export const RevokeReminderSourceDeviceRequestSchema = CommandRequestSchema.strict();

export const ReminderSourceCommandResultSchema = z
  .object({
    source: ReminderSourceSummarySchema,
    replayed: z.boolean(),
  })
  .strict();

export const ReminderSnapshotListInputSchema = z
  .object({
    sourceListId: ReminderSourceExternalIdSchema,
    title: ReminderListTitleSchema,
  })
  .strict();

export const ReminderSnapshotItemInputSchema = z
  .object({
    sourceReminderId: ReminderSourceExternalIdSchema,
    sourceListId: ReminderSourceExternalIdSchema,
    title: ReminderTitleSchema,
    dueLocalDate: LocalDateSchema.nullable(),
    dueAt: TimestampSchema.nullable(),
    hasDueTime: z.boolean(),
    isCompleted: z.boolean(),
    completedAt: TimestampSchema.nullable(),
    sourceUpdatedAt: TimestampSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.hasDueTime && (value.dueAt === null || value.dueLocalDate === null)) {
      context.addIssue({
        code: 'custom',
        message: 'A timed due date requires both dueAt and dueLocalDate.',
        path: ['dueAt'],
      });
    }
    if (!value.hasDueTime && value.dueAt !== null) {
      context.addIssue({
        code: 'custom',
        message: 'A date-only reminder must not contain dueAt.',
        path: ['dueAt'],
      });
    }
    if (value.dueLocalDate === null && (value.dueAt !== null || value.hasDueTime)) {
      context.addIssue({
        code: 'custom',
        message: 'A reminder without a due date cannot contain due-time fields.',
        path: ['dueLocalDate'],
      });
    }
    if (!value.isCompleted && value.completedAt !== null) {
      context.addIssue({
        code: 'custom',
        message: 'An incomplete reminder must not contain completedAt.',
        path: ['completedAt'],
      });
    }
  });

export const ReplaceReminderSnapshotRequestSchema = CommandRequestSchema.extend({
  contractVersion: z.literal(REMINDER_CONTRACT_VERSION),
  snapshotId: OpaqueIdSchema,
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  generatedAt: TimestampSchema,
  lists: z.array(ReminderSnapshotListInputSchema).max(MAX_REMINDER_SOURCE_LISTS),
  reminders: z.array(ReminderSnapshotItemInputSchema).max(MAX_REMINDER_SNAPSHOT_ITEMS),
})
  .strict()
  .superRefine((value, context) => {
    const listIds = new Set<string>();
    for (const [index, list] of value.lists.entries()) {
      if (listIds.has(list.sourceListId)) {
        context.addIssue({
          code: 'custom',
          message: 'Every source list identifier must be unique.',
          path: ['lists', index, 'sourceListId'],
        });
      }
      listIds.add(list.sourceListId);
    }

    const reminderIds = new Set<string>();
    for (const [index, reminder] of value.reminders.entries()) {
      if (reminderIds.has(reminder.sourceReminderId)) {
        context.addIssue({
          code: 'custom',
          message: 'Every source reminder identifier must be unique.',
          path: ['reminders', index, 'sourceReminderId'],
        });
      }
      reminderIds.add(reminder.sourceReminderId);
      if (!listIds.has(reminder.sourceListId)) {
        context.addIssue({
          code: 'custom',
          message: 'Every reminder must reference a list in the same full snapshot.',
          path: ['reminders', index, 'sourceListId'],
        });
      }
    }
  });

export const ReminderSnapshotReceiptSchema = z
  .object({
    contractVersion: z.literal(REMINDER_CONTRACT_VERSION),
    sourceId: OpaqueIdSchema,
    snapshotId: OpaqueIdSchema,
    sequence: z.number().int().positive(),
    generatedAt: TimestampSchema,
    acceptedAt: TimestampSchema,
    listCount: z.number().int().nonnegative().max(MAX_REMINDER_SOURCE_LISTS),
    reminderCount: z.number().int().nonnegative().max(MAX_REMINDER_SNAPSHOT_ITEMS),
    incompleteCount: z.number().int().nonnegative().max(MAX_REMINDER_SNAPSHOT_ITEMS),
    nextSnapshotSequence: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

export const HearthReminderListSchema = z
  .object({
    id: OpaqueIdSchema,
    title: z.string().min(1).max(120),
    reminderCount: z.number().int().nonnegative().max(MAX_REMINDER_SNAPSHOT_ITEMS),
    incompleteCount: z.number().int().nonnegative().max(MAX_REMINDER_SNAPSHOT_ITEMS),
  })
  .strict();

export const HearthReminderSchema = z
  .object({
    id: OpaqueIdSchema,
    listId: OpaqueIdSchema,
    title: z.string().min(1).max(240),
    dueLocalDate: LocalDateSchema.nullable(),
    dueAt: TimestampSchema.nullable(),
    hasDueTime: z.boolean(),
    isCompleted: z.boolean(),
    completedAt: TimestampSchema.nullable(),
    sourceUpdatedAt: TimestampSchema.nullable(),
  })
  .strict();

export const ReminderOverviewSchema = z
  .object({
    householdId: OpaqueIdSchema,
    generatedAt: TimestampSchema,
    source: ReminderSourceSummarySchema.nullable(),
    lists: z.array(HearthReminderListSchema).max(MAX_REMINDER_SOURCE_LISTS),
    reminders: z.array(HearthReminderSchema).max(MAX_REMINDER_SNAPSHOT_ITEMS),
  })
  .strict();

export type ReminderSourceExternalId = z.infer<typeof ReminderSourceExternalIdSchema>;
export type CreateReminderSourcePairingRequest = z.infer<
  typeof CreateReminderSourcePairingRequestSchema
>;
export type ReminderSourcePairingRequest = z.infer<typeof ReminderSourcePairingRequestSchema>;
export type ApproveReminderSourcePairingRequest = z.infer<
  typeof ApproveReminderSourcePairingRequestSchema
>;
export type ExchangeReminderSourcePairingRequest = z.infer<
  typeof ExchangeReminderSourcePairingRequestSchema
>;
export type ReminderSourceDeviceSession = z.infer<typeof ReminderSourceDeviceSessionSchema>;
export type ReminderSourceStatus = z.infer<typeof ReminderSourceStatusSchema>;
export type ReminderSourceSummary = z.infer<typeof ReminderSourceSummarySchema>;
export type ReminderSourceSettings = z.infer<typeof ReminderSourceSettingsSchema>;
export type RevokeReminderSourceDeviceRequest = z.infer<
  typeof RevokeReminderSourceDeviceRequestSchema
>;
export type ReminderSourceCommandResult = z.infer<typeof ReminderSourceCommandResultSchema>;
export type ReminderSnapshotListInput = z.infer<typeof ReminderSnapshotListInputSchema>;
export type ReminderSnapshotItemInput = z.infer<typeof ReminderSnapshotItemInputSchema>;
export type ReplaceReminderSnapshotRequest = z.infer<typeof ReplaceReminderSnapshotRequestSchema>;
export type ReminderSnapshotReceipt = z.infer<typeof ReminderSnapshotReceiptSchema>;
export type HearthReminderList = z.infer<typeof HearthReminderListSchema>;
export type HearthReminder = z.infer<typeof HearthReminderSchema>;
export type ReminderOverview = z.infer<typeof ReminderOverviewSchema>;
