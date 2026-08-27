import { z } from 'zod';

import {
  AuditSummarySchema,
  CommandRequestSchema,
  LocalDateSchema,
  OpaqueIdSchema,
  TimestampSchema,
} from './schemas.js';

export const MAX_HEARTH_REMINDER_LISTS = 20;
export const MAX_HEARTH_REMINDERS = 1_000;

export const ReminderTitleSchema = z.string().trim().min(1).max(240);

export const HearthReminderListSchema = z
  .object({
    id: OpaqueIdSchema,
    title: z.string().trim().min(1).max(120),
    reminderCount: z.number().int().nonnegative().max(MAX_HEARTH_REMINDERS),
    incompleteCount: z.number().int().nonnegative().max(MAX_HEARTH_REMINDERS),
  })
  .strict();

export const HearthReminderSchema = z
  .object({
    id: OpaqueIdSchema,
    listId: OpaqueIdSchema,
    title: ReminderTitleSchema,
    dueLocalDate: LocalDateSchema.nullable(),
    dueAt: TimestampSchema.nullable(),
    hasDueTime: z.boolean(),
    isCompleted: z.boolean(),
    completedAt: TimestampSchema.nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();

export const ReminderOverviewSchema = z
  .object({
    householdId: OpaqueIdSchema,
    generatedAt: TimestampSchema,
    lists: z.array(HearthReminderListSchema).max(MAX_HEARTH_REMINDER_LISTS),
    reminders: z.array(HearthReminderSchema).max(MAX_HEARTH_REMINDERS),
  })
  .strict();

export const CreateReminderRequestSchema = CommandRequestSchema.extend({
  title: ReminderTitleSchema,
  dueLocalDate: LocalDateSchema.nullable(),
  dueAt: TimestampSchema.nullable(),
  hasDueTime: z.boolean(),
})
  .strict()
  .superRefine((value, context) => {
    if (value.hasDueTime && (value.dueAt === null || value.dueLocalDate === null)) {
      context.addIssue({
        code: 'custom',
        message: 'A timed reminder requires a due date and time.',
        path: ['dueAt'],
      });
    }
    if (!value.hasDueTime && value.dueAt !== null) {
      context.addIssue({
        code: 'custom',
        message: 'A date-only reminder must not contain a due time.',
        path: ['dueAt'],
      });
    }
    if (value.dueLocalDate === null && (value.dueAt !== null || value.hasDueTime)) {
      context.addIssue({
        code: 'custom',
        message: 'A reminder without a due date cannot contain a due time.',
        path: ['dueLocalDate'],
      });
    }
  });

export const UpdateReminderRequestSchema = CreateReminderRequestSchema;

export const SetReminderCompletionRequestSchema = CommandRequestSchema.extend({
  isCompleted: z.boolean(),
}).strict();

export const DeleteReminderRequestSchema = CommandRequestSchema.strict();

export const ReminderCommandResultSchema = z
  .object({
    reminder: HearthReminderSchema,
    audit: AuditSummarySchema,
    replayed: z.boolean(),
  })
  .strict();

export const ReminderDeletionResultSchema = z
  .object({
    reminderId: OpaqueIdSchema,
    audit: AuditSummarySchema,
    replayed: z.boolean(),
  })
  .strict();

export type HearthReminderList = z.infer<typeof HearthReminderListSchema>;
export type HearthReminder = z.infer<typeof HearthReminderSchema>;
export type ReminderOverview = z.infer<typeof ReminderOverviewSchema>;
export type CreateReminderRequest = z.infer<typeof CreateReminderRequestSchema>;
export type UpdateReminderRequest = z.infer<typeof UpdateReminderRequestSchema>;
export type SetReminderCompletionRequest = z.infer<typeof SetReminderCompletionRequestSchema>;
export type DeleteReminderRequest = z.infer<typeof DeleteReminderRequestSchema>;
export type ReminderCommandResult = z.infer<typeof ReminderCommandResultSchema>;
export type ReminderDeletionResult = z.infer<typeof ReminderDeletionResultSchema>;
