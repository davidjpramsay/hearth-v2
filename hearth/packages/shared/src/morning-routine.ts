import { z } from 'zod';
import {
  AuditSummarySchema,
  LocalDateSchema,
  LocalTimeSchema,
  MemberSchema,
  OpaqueIdSchema,
  TimestampSchema,
  TimezoneSchema,
} from './schemas.js';

export const MorningPersonSchema = MemberSchema.pick({
  id: true,
  displayName: true,
  color: true,
  avatarUrl: true,
  role: true,
});
export const MorningStepSchema = z
  .object({ id: OpaqueIdSchema, title: z.string().trim().min(1).max(80) })
  .strict();
export const MorningConfigurationSchema = z
  .object({
    startTime: LocalTimeSchema,
    endTime: LocalTimeSchema,
    selectedMemberIds: z.array(OpaqueIdSchema).max(20),
    routines: z
      .array(
        z.object({ memberId: OpaqueIdSchema, steps: z.array(MorningStepSchema).max(12) }).strict(),
      )
      .max(20),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endTime <= value.startTime)
      context.addIssue({
        code: 'custom',
        message: 'End time must be after start time on the same day.',
        path: ['endTime'],
      });
    const selected = value.selectedMemberIds;
    const people = value.routines.map((routine) => routine.memberId);
    const steps = value.routines.flatMap((routine) => routine.steps.map((step) => step.id));
    if (
      new Set(selected).size !== selected.length ||
      new Set(people).size !== people.length ||
      new Set(steps).size !== steps.length
    )
      context.addIssue({ code: 'custom', message: 'People and step identifiers must be unique.' });
    if (selected.some((id) => !people.includes(id)))
      context.addIssue({
        code: 'custom',
        message: 'Every selected person needs a routine, even if empty.',
      });
  });
export const MorningSettingsSchema = z.object({
  revision: z.number().int().nonnegative(),
  configuration: MorningConfigurationSchema,
  people: z.array(MorningPersonSchema),
});
export const UpdateMorningSettingsSchema = z
  .object({
    requestId: OpaqueIdSchema,
    expectedRevision: z.number().int().nonnegative(),
    configuration: MorningConfigurationSchema,
  })
  .strict();
export const MorningSettingsResultSchema = z.object({
  settings: MorningSettingsSchema,
  audit: AuditSummarySchema,
  replayed: z.boolean(),
});
export const MorningProgressSchema = MorningStepSchema.extend({
  isCompleted: z.boolean(),
  version: z.number().int().nonnegative(),
});
export const MorningOverviewSchema = z.object({
  householdId: OpaqueIdSchema,
  generatedAt: TimestampSchema,
  timezone: TimezoneSchema,
  localDate: LocalDateSchema,
  isWeekday: z.boolean(),
  settingsRevision: z.number().int().nonnegative(),
  startTime: LocalTimeSchema,
  endTime: LocalTimeSchema,
  people: z
    .array(z.object({ person: MorningPersonSchema, steps: z.array(MorningProgressSchema).max(12) }))
    .max(20),
});
export const SetMorningCompletionSchema = z
  .object({
    requestId: OpaqueIdSchema,
    localDate: LocalDateSchema,
    memberId: OpaqueIdSchema,
    stepId: OpaqueIdSchema,
    settingsRevision: z.number().int().nonnegative(),
    expectedVersion: z.number().int().nonnegative(),
    isCompleted: z.boolean(),
  })
  .strict();
export const MorningCompletionResultSchema = z.object({
  localDate: LocalDateSchema,
  memberId: OpaqueIdSchema,
  stepId: OpaqueIdSchema,
  isCompleted: z.boolean(),
  version: z.number().int().positive(),
  audit: AuditSummarySchema,
  replayed: z.boolean(),
});
export type MorningConfiguration = z.infer<typeof MorningConfigurationSchema>;
export type MorningSettings = z.infer<typeof MorningSettingsSchema>;
export type UpdateMorningSettings = z.infer<typeof UpdateMorningSettingsSchema>;
export type MorningSettingsResult = z.infer<typeof MorningSettingsResultSchema>;
export type MorningOverview = z.infer<typeof MorningOverviewSchema>;
export type SetMorningCompletion = z.infer<typeof SetMorningCompletionSchema>;
export type MorningCompletionResult = z.infer<typeof MorningCompletionResultSchema>;
