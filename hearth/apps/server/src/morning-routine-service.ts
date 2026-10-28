import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { localDateInTimezone, morningIsWeekday } from '@hearth/core';
import {
  AuditSummarySchema,
  MorningConfigurationSchema,
  MorningSettingsSchema,
  MorningSettingsResultSchema,
  MorningOverviewSchema,
  MorningCompletionResultSchema,
  type HouseholdSummary,
  type MorningConfiguration,
  type MorningSettings,
  type UpdateMorningSettings,
  type MorningSettingsResult,
  type SetMorningCompletion,
  type MorningCompletionResult,
  type AuditSummary,
} from '@hearth/shared';
import { RepositoryError, type CommandActor } from './repository.js';

type Saved = { revision: number; configuration: MorningConfiguration };
type Progress = { isCompleted: boolean; version: number };
type Result = MorningSettingsResult | MorningCompletionResult;

export class MorningRoutineService {
  private readonly settings = new Map<string, Saved>();
  private readonly progress = new Map<string, Progress>();
  private readonly receipts = new Map<string, { hash: string; result: Result }>();
  constructor(
    private readonly database?: Database.Database,
    private readonly now = () => new Date(),
  ) {}

  getSettings(home: HouseholdSummary): MorningSettings {
    const row = this.database
      ?.prepare(
        'SELECT revision,configuration_json FROM morning_routine_settings WHERE household_id=?',
      )
      .get(home.id) as { revision: number; configuration_json: string } | undefined;
    const stored = row
      ? {
          revision: row.revision,
          configuration: MorningConfigurationSchema.parse(JSON.parse(row.configuration_json)),
        }
      : this.settings.get(home.id);
    const children = home.members.filter((member) => member.role === 'child').slice(0, 20);
    const validPeople = new Set(home.members.map((person) => person.id));
    const configuration = stored?.configuration ?? {
      startTime: '07:00',
      endTime: '08:00',
      selectedMemberIds: children.map((person) => person.id),
      routines: children.map((person) => ({ memberId: person.id, steps: [] })),
    };
    return MorningSettingsSchema.parse({
      revision: stored?.revision ?? 0,
      configuration: {
        ...configuration,
        selectedMemberIds: configuration.selectedMemberIds.filter((id) => validPeople.has(id)),
        routines: configuration.routines.filter((routine) => validPeople.has(routine.memberId)),
      },
      people: home.members,
    });
  }

  overview(home: HouseholdSummary) {
    const settings = this.getSettings(home);
    const generatedAt = this.now().toISOString();
    const localDate = localDateInTimezone(generatedAt, home.timezone);
    return MorningOverviewSchema.parse({
      householdId: home.id,
      generatedAt,
      timezone: home.timezone,
      localDate,
      isWeekday: morningIsWeekday(localDate),
      settingsRevision: settings.revision,
      startTime: settings.configuration.startTime,
      endTime: settings.configuration.endTime,
      people: settings.configuration.selectedMemberIds.map((id) => ({
        person: settings.people.find((person) => person.id === id)!,
        steps: settings.configuration.routines
          .find((routine) => routine.memberId === id)!
          .steps.map((step) => ({
            ...step,
            ...this.readProgress(home.id, localDate, id, step.id),
          })),
      })),
    });
  }

  update(
    home: HouseholdSummary,
    input: UpdateMorningSettings,
    actor: CommandActor,
  ): MorningSettingsResult {
    const member = home.members.find((person) => person.id === actor.id);
    if (
      actor.type !== 'member' ||
      member?.role !== 'adult' ||
      !member.capabilities.includes('household.admin')
    )
      throw new RepositoryError('FORBIDDEN', 'An adult controller must edit Morning Routine.');
    return this.command(home.id, input, actor, 'morning-routine.settings.update', () => {
      const current = this.getSettings(home);
      if (input.expectedRevision !== current.revision)
        throw new RepositoryError(
          'CONFLICT',
          'Morning Routine changed on another device. Load the latest settings before saving.',
        );
      if (
        input.configuration.routines.some(
          (routine) => !home.members.some((person) => person.id === routine.memberId),
        )
      )
        throw new RepositoryError('VALIDATION_ERROR', 'Choose people from this home.');
      const saved = { revision: current.revision + 1, configuration: input.configuration };
      if (this.database)
        this.database
          .prepare(
            'INSERT INTO morning_routine_settings VALUES (?,?,?) ON CONFLICT(household_id) DO UPDATE SET revision=excluded.revision,configuration_json=excluded.configuration_json',
          )
          .run(home.id, saved.revision, JSON.stringify(saved.configuration));
      else this.settings.set(home.id, structuredClone(saved));
      return MorningSettingsResultSchema.parse({
        settings: this.getSettings(home),
        audit: this.audit(actor, 'morning-routine.settings.update', home.id),
        replayed: false,
      });
    }) as MorningSettingsResult;
  }

  complete(
    home: HouseholdSummary,
    input: SetMorningCompletion,
    actor: CommandActor,
  ): MorningCompletionResult {
    if (
      actor.type !== 'device' &&
      (actor.type !== 'member' ||
        !home.members.some(
          (person) => person.id === actor.id && person.capabilities.includes('household.view'),
        ))
    )
      throw new RepositoryError('FORBIDDEN', 'Use a connected Hearth screen or phone.');
    return this.command(home.id, input, actor, 'morning-routine.completion', () => {
      const today = localDateInTimezone(this.now().toISOString(), home.timezone);
      if (input.localDate !== today || !morningIsWeekday(today))
        throw new RepositoryError(
          'CONFLICT',
          'That morning has changed. Refresh to see today’s routine.',
        );
      const settings = this.getSettings(home);
      if (settings.revision !== input.settingsRevision)
        throw new RepositoryError(
          'CONFLICT',
          'The routine was edited. Refresh before ticking a step.',
        );
      if (
        !settings.configuration.selectedMemberIds.includes(input.memberId) ||
        !settings.configuration.routines
          .find((routine) => routine.memberId === input.memberId)
          ?.steps.some((step) => step.id === input.stepId)
      )
        throw new RepositoryError('NOT_FOUND', 'That step is no longer in this morning’s routine.');
      const current = this.readProgress(home.id, today, input.memberId, input.stepId);
      if (current.version !== input.expectedVersion)
        throw new RepositoryError(
          'CONFLICT',
          'That step changed on another device. Refresh to see its latest check.',
        );
      const next = { isCompleted: input.isCompleted, version: current.version + 1 };
      if (this.database)
        this.database
          .prepare(
            'INSERT INTO morning_routine_progress VALUES (?,?,?,?,?,?,?) ON CONFLICT(household_id,local_date,member_id,step_id) DO UPDATE SET completed=excluded.completed,version=excluded.version,updated_at=excluded.updated_at',
          )
          .run(
            home.id,
            today,
            input.memberId,
            input.stepId,
            Number(next.isCompleted),
            next.version,
            this.now().toISOString(),
          );
      else this.progress.set(JSON.stringify([home.id, today, input.memberId, input.stepId]), next);
      return MorningCompletionResultSchema.parse({
        ...next,
        localDate: today,
        memberId: input.memberId,
        stepId: input.stepId,
        audit: this.audit(
          actor,
          input.isCompleted ? 'morning-routine.complete' : 'morning-routine.reopen',
          input.stepId,
        ),
        replayed: false,
      });
    }) as MorningCompletionResult;
  }

  private readProgress(home: string, date: string, member: string, step: string): Progress {
    if (this.database) {
      const row = this.database
        .prepare(
          'SELECT completed,version FROM morning_routine_progress WHERE household_id=? AND local_date=? AND member_id=? AND step_id=?',
        )
        .get(home, date, member, step) as { completed: number; version: number } | undefined;
      return row
        ? { isCompleted: row.completed === 1, version: row.version }
        : { isCompleted: false, version: 0 };
    }
    return (
      this.progress.get(JSON.stringify([home, date, member, step])) ?? {
        isCompleted: false,
        version: 0,
      }
    );
  }

  private audit(
    actor: CommandActor,
    action: AuditSummary['action'],
    targetId: string,
  ): AuditSummary {
    return AuditSummarySchema.parse({
      id: `audit_${randomUUID()}`,
      actorType: actor.type,
      actorId: actor.id,
      source: actor.source,
      action,
      targetId,
      occurredAt: this.now().toISOString(),
      result: 'succeeded',
    });
  }

  private command(
    home: string,
    input: { requestId: string },
    actor: CommandActor,
    action: string,
    execute: () => Result,
  ): Result {
    const scope = `${actor.type}:${actor.id}`;
    const key = JSON.stringify([home, scope, input.requestId]);
    const hash = createHash('sha256').update(JSON.stringify({ action, input })).digest('hex');
    const run = () => {
      const row = this.database
        ?.prepare(
          'SELECT input_hash,result_json FROM morning_routine_receipts WHERE household_id=? AND actor_scope=? AND request_id=?',
        )
        .get(home, scope, input.requestId) as
        { input_hash: string; result_json: string } | undefined;
      const previous = row
        ? { hash: row.input_hash, result: JSON.parse(row.result_json) as Result }
        : this.receipts.get(key);
      if (previous) {
        if (previous.hash !== hash)
          throw new RepositoryError(
            'CONFLICT',
            'That request identifier was already used with different content.',
          );
        return { ...previous.result, replayed: true };
      }
      const result = execute();
      if (this.database) {
        this.database
          .prepare('INSERT INTO morning_routine_receipts VALUES (?,?,?,?,?)')
          .run(home, scope, input.requestId, hash, JSON.stringify(result));
        const audit = result.audit;
        this.database
          .prepare(
            "INSERT INTO audit_events(id,occurred_at,household_id,actor_type,actor_id,source_channel,action_type,target_type,target_id,request_id,result,safe_summary_json) VALUES (?,?,?,?,?,?,?,'morning-routine',?,?,'succeeded','{}')",
          )
          .run(
            audit.id,
            audit.occurredAt,
            home,
            actor.type,
            actor.id,
            actor.source,
            audit.action,
            audit.targetId,
            input.requestId,
          );
      } else this.receipts.set(key, { hash, result: structuredClone(result) });
      return result;
    };
    return structuredClone(this.database ? this.database.transaction(run)() : run());
  }

  reset(): void {
    this.settings.clear();
    this.progress.clear();
    this.receipts.clear();
    this.database?.exec(
      'DELETE FROM morning_routine_progress; DELETE FROM morning_routine_receipts; DELETE FROM morning_routine_settings;',
    );
  }
}
