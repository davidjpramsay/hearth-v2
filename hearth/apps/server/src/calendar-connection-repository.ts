import { createHash, randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import {
  CalendarConnectionCommandResultSchema,
  CalendarConnectionSettingsSchema,
  CalendarConnectionTestResultSchema,
  FAMILY_CALENDAR_COLOR,
  type AuditSummary,
  type CalendarConnectionCommandResult,
  type CalendarConnectionSettings,
  type CalendarConnectionTestRequest,
  type CalendarConnectionTestResult,
  type Member,
  type SaveCalendarConnectionRequest,
  type UpdateCalendarMappingsRequest,
} from '@hearth/shared';

import type { AdminRepository } from './admin-repository.js';
import { discoverCalDavCalendars } from './integrations/caldav-calendar-provider.js';
import type { CalDavRuntimeConfig } from './integrations/calendar-runtime.js';
import { CalendarProviderError } from './integrations/calendar-provider.js';
import { RepositoryError } from './repository.js';

interface DiscoveredCalendar {
  externalId: string;
  displayName: string;
  color: string;
}

interface PendingCalendarTest {
  householdId: string;
  testId: string;
  serverUrl: string;
  username: string;
  appPassword: string;
  serverHost: string;
  accountHint: string;
  calendars: Array<DiscoveredCalendar & { id: string }>;
  expiresAt: string;
}

interface StoredCalendarSelection {
  displayName: string;
  color: string;
  ownerMemberId: string | null;
}

interface CalendarConnectionRow {
  id: string;
  label: string;
  server_host: string;
  account_hint: string;
  status: 'ready' | 'needs-attention';
  selected_calendars_json: string;
  last_checked_at: string;
  last_success_at: string | null;
}

export interface CalendarConnectionVerifier {
  verify(input: CalendarConnectionTestRequest): Promise<DiscoveredCalendar[]>;
}

export interface CalendarCredentialStore {
  save(config: CalDavRuntimeConfig): Promise<void>;
  updateMappings(
    calendars: CalDavRuntimeConfig['calendars'],
    householdTimezone: string,
  ): Promise<void>;
  remove(): Promise<void>;
}

export interface CalendarConnectionRepository {
  get(householdId: string, actorId: string): Promise<CalendarConnectionSettings | null>;
  test(
    householdId: string,
    actorId: string,
    input: CalendarConnectionTestRequest,
  ): Promise<CalendarConnectionTestResult>;
  save(
    householdId: string,
    actorId: string,
    input: SaveCalendarConnectionRequest,
  ): Promise<CalendarConnectionCommandResult>;
  updateMappings(
    householdId: string,
    actorId: string,
    input: UpdateCalendarMappingsRequest,
  ): Promise<CalendarConnectionCommandResult>;
  remove(
    householdId: string,
    actorId: string,
    requestId: string,
  ): Promise<CalendarConnectionCommandResult>;
  reset(): void;
  close(): void;
}

export class FakeCalendarConnectionVerifier implements CalendarConnectionVerifier {
  async verify(input: CalendarConnectionTestRequest): Promise<DiscoveredCalendar[]> {
    if (input.appPassword === 'wrong-password') {
      throw new CalendarProviderError(
        'AUTHENTICATION_REQUIRED',
        'Calendar sign-in needs attention.',
      );
    }
    return [
      {
        externalId: 'https://caldav.example.test/family/',
        displayName: 'Family',
        color: '#2f766d',
      },
      { externalId: 'https://caldav.example.test/ezra/', displayName: 'Ezra', color: '#4d82b8' },
      { externalId: 'https://caldav.example.test/maya/', displayName: 'Maya', color: '#c67a42' },
    ];
  }
}

export class CalDavCalendarConnectionVerifier implements CalendarConnectionVerifier {
  verify(input: CalendarConnectionTestRequest): Promise<DiscoveredCalendar[]> {
    return discoverCalDavCalendars(input);
  }
}

export class CalendarConnectionService implements CalendarConnectionRepository {
  private readonly pending = new Map<string, PendingCalendarTest>();
  private readonly receipts = new Map<string, CalendarConnectionCommandResult>();
  private memoryRow: CalendarConnectionRow | null = null;
  private sequence = 1;

  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly verifier: CalendarConnectionVerifier,
    private readonly options: {
      database?: InstanceType<typeof Database>;
      credentialStore?: CalendarCredentialStore;
      now?: () => Date;
    } = {},
  ) {}

  async get(householdId: string, actorId: string): Promise<CalendarConnectionSettings | null> {
    const overview = await this.adminRepository.getOverview(householdId, actorId);
    const row = this.readRow(householdId);
    return row === null ? null : settingsFromRow(row, overview.household.members);
  }

  async test(
    householdId: string,
    actorId: string,
    input: CalendarConnectionTestRequest,
  ): Promise<CalendarConnectionTestResult> {
    await this.adminRepository.getOverview(householdId, actorId);
    let discovered: DiscoveredCalendar[];
    try {
      discovered = await this.verifier.verify(input);
    } catch (error) {
      if (error instanceof CalendarProviderError) {
        throw new RepositoryError(
          'INTEGRATION_UNAVAILABLE',
          error.code === 'AUTHENTICATION_REQUIRED'
            ? 'Calendar sign-in was not accepted. Check the account and app-specific password.'
            : error.message,
          error.code === 'UNAVAILABLE',
        );
      }
      throw error;
    }
    if (discovered.length === 0) {
      throw new RepositoryError('INTEGRATION_UNAVAILABLE', 'No event calendars were found.');
    }
    const now = this.now();
    const testId = `calendar_test_${randomUUID().replaceAll('-', '_')}`;
    const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
    const pending: PendingCalendarTest = {
      householdId,
      testId,
      serverUrl: input.serverUrl,
      username: input.username,
      appPassword: input.appPassword,
      serverHost: new URL(input.serverUrl).hostname,
      accountHint: maskAccount(input.username),
      calendars: discovered.slice(0, 40).map((calendar) => ({
        ...calendar,
        id: opaqueId('calendar_option', calendar.externalId),
      })),
      expiresAt,
    };
    this.pending.set(testId, pending);
    return CalendarConnectionTestResultSchema.parse({
      testId,
      provider: 'caldav',
      serverHost: pending.serverHost,
      accountHint: pending.accountHint,
      availableCalendars: pending.calendars.map(({ id, displayName, color }) => ({
        id,
        displayName,
        color,
      })),
      expiresAt,
    });
  }

  async save(
    householdId: string,
    actorId: string,
    input: SaveCalendarConnectionRequest,
  ): Promise<CalendarConnectionCommandResult> {
    const overview = await this.adminRepository.getOverview(householdId, actorId);
    const replay = this.readReceipt(householdId, input.requestId, 'calendar.connection.save');
    if (replay !== null) return { ...replay, replayed: true };
    const tested = this.pending.get(input.testId);
    if (
      tested === undefined ||
      tested.householdId !== householdId ||
      Date.parse(tested.expiresAt) <= this.now().getTime()
    ) {
      throw new RepositoryError('CONFLICT', 'Test the calendar connection again before saving.');
    }
    const members = new Map(overview.household.members.map((member) => [member.id, member]));
    const available = new Map(tested.calendars.map((calendar) => [calendar.id, calendar]));
    const selected: StoredCalendarSelection[] = input.calendars.map((selection) => {
      const calendar = available.get(selection.calendarId);
      if (calendar === undefined) {
        throw new RepositoryError('VALIDATION_ERROR', 'Choose a calendar from the tested account.');
      }
      if (selection.ownerMemberId !== null && !members.has(selection.ownerMemberId)) {
        throw new RepositoryError('VALIDATION_ERROR', 'Choose a person in this household.');
      }
      return {
        displayName: calendar.displayName,
        color: calendar.color,
        ownerMemberId: selection.ownerMemberId,
      };
    });
    const config: CalDavRuntimeConfig = {
      version: 1,
      provider: 'caldav',
      serverUrl: tested.serverUrl,
      username: tested.username,
      appPassword: tested.appPassword,
      householdTimezone: overview.household.timezone,
      calendars: selected.map(({ displayName, ownerMemberId }) => ({
        displayName,
        ownerMemberId,
      })),
    };
    if (this.options.credentialStore !== undefined) {
      try {
        await this.options.credentialStore.save(config);
      } catch {
        throw new RepositoryError(
          'COMMAND_FAILED',
          'Hearth could not store the calendar sign-in securely.',
          true,
        );
      }
    }
    const occurredAt = this.now().toISOString();
    const row: CalendarConnectionRow = {
      id: opaqueId('calendar_setup', householdId),
      label: input.label,
      server_host: tested.serverHost,
      account_hint: tested.accountHint,
      status: 'ready',
      selected_calendars_json: JSON.stringify(selected),
      last_checked_at: occurredAt,
      last_success_at: occurredAt,
    };
    const audit = this.audit(actorId, 'calendar.connection.save', row.id, 'succeeded', occurredAt);
    const connection = settingsFromRow(row, overview.household.members);
    const result = CalendarConnectionCommandResultSchema.parse({
      connection,
      audit,
      replayed: false,
    });
    this.commit(() => {
      this.writeAudit(householdId, audit, input.requestId);
      this.persistRow(householdId, row, occurredAt);
      this.writeReceipt(
        householdId,
        input.requestId,
        'calendar.connection.save',
        result,
        occurredAt,
      );
    });
    this.pending.delete(input.testId);
    return result;
  }

  async remove(
    householdId: string,
    actorId: string,
    requestId: string,
  ): Promise<CalendarConnectionCommandResult> {
    await this.adminRepository.getOverview(householdId, actorId);
    const replay = this.readReceipt(householdId, requestId, 'calendar.connection.remove');
    if (replay !== null) return { ...replay, replayed: true };
    const row = this.readRow(householdId);
    if (row === null) throw new RepositoryError('NOT_FOUND', 'No calendar connection is saved.');
    if (this.options.credentialStore !== undefined) {
      try {
        await this.options.credentialStore.remove();
      } catch {
        throw new RepositoryError(
          'COMMAND_FAILED',
          'Hearth could not remove the stored calendar sign-in.',
          true,
        );
      }
    }
    const occurredAt = this.now().toISOString();
    const audit = this.audit(actorId, 'calendar.connection.remove', row.id, 'reversed', occurredAt);
    const result = CalendarConnectionCommandResultSchema.parse({
      connection: null,
      audit,
      replayed: false,
    });
    this.commit(() => {
      this.writeAudit(householdId, audit, requestId);
      if (this.options.database === undefined) this.memoryRow = null;
      else
        this.options.database
          .prepare('DELETE FROM calendar_connection_settings WHERE household_id = ?')
          .run(householdId);
      this.writeReceipt(householdId, requestId, 'calendar.connection.remove', result, occurredAt);
    });
    return result;
  }

  async updateMappings(
    householdId: string,
    actorId: string,
    input: UpdateCalendarMappingsRequest,
  ): Promise<CalendarConnectionCommandResult> {
    const overview = await this.adminRepository.getOverview(householdId, actorId);
    const replay = this.readReceipt(householdId, input.requestId, 'calendar.mappings.update');
    if (replay !== null) return { ...replay, replayed: true };
    const row = this.readRow(householdId);
    if (row === null) throw new RepositoryError('NOT_FOUND', 'No calendar connection is saved.');
    const members = new Map(overview.household.members.map((member) => [member.id, member]));
    const existing = JSON.parse(row.selected_calendars_json) as StoredCalendarSelection[];
    const existingById = new Map(
      existing.map((calendar) => [calendarMappingId(calendar.displayName), calendar]),
    );
    if (input.calendars.length !== existing.length) {
      throw new RepositoryError('VALIDATION_ERROR', 'Assign every connected calendar.');
    }
    const selected = input.calendars.map((mapping) => {
      const calendar = existingById.get(mapping.calendarId);
      if (calendar === undefined) {
        throw new RepositoryError('VALIDATION_ERROR', 'Choose a connected calendar.');
      }
      if (mapping.ownerMemberId !== null && !members.has(mapping.ownerMemberId)) {
        throw new RepositoryError('VALIDATION_ERROR', 'Choose a person in this household.');
      }
      return { ...calendar, ownerMemberId: mapping.ownerMemberId };
    });
    if (new Set(input.calendars.map(({ calendarId }) => calendarId)).size !== existing.length) {
      throw new RepositoryError('VALIDATION_ERROR', 'Assign every connected calendar once.');
    }
    if (this.options.credentialStore !== undefined) {
      try {
        await this.options.credentialStore.updateMappings(
          selected.map(({ displayName, ownerMemberId }) => ({ displayName, ownerMemberId })),
          overview.household.timezone,
        );
      } catch {
        throw new RepositoryError(
          'COMMAND_FAILED',
          'Hearth could not update the calendar assignments securely.',
          true,
        );
      }
    }
    const occurredAt = this.now().toISOString();
    const updatedRow: CalendarConnectionRow = {
      ...row,
      selected_calendars_json: JSON.stringify(selected),
      last_checked_at: occurredAt,
    };
    const audit = this.audit(actorId, 'calendar.mappings.update', row.id, 'succeeded', occurredAt);
    const result = CalendarConnectionCommandResultSchema.parse({
      connection: settingsFromRow(updatedRow, overview.household.members),
      audit,
      replayed: false,
    });
    this.commit(() => {
      this.writeAudit(householdId, audit, input.requestId);
      this.persistRow(householdId, updatedRow, occurredAt);
      this.persistProjectionMappings(householdId, selected);
      this.writeReceipt(
        householdId,
        input.requestId,
        'calendar.mappings.update',
        result,
        occurredAt,
      );
    });
    return result;
  }

  reset(): void {
    this.pending.clear();
    this.receipts.clear();
    this.memoryRow = null;
    this.options.database?.prepare('DELETE FROM calendar_connection_settings').run();
  }

  close(): void {}

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private commit(operation: () => void): void {
    if (this.options.database === undefined) operation();
    else this.options.database.transaction(operation)();
  }

  private readRow(householdId: string): CalendarConnectionRow | null {
    if (this.options.database === undefined) {
      return this.memoryRow === null ? null : { ...this.memoryRow };
    }
    return (
      (this.options.database
        .prepare(
          `SELECT id, label, server_host, account_hint, status, selected_calendars_json,
                  last_checked_at, last_success_at
           FROM calendar_connection_settings WHERE household_id = ?`,
        )
        .get(householdId) as CalendarConnectionRow | undefined) ?? null
    );
  }

  private persistRow(householdId: string, row: CalendarConnectionRow, occurredAt: string): void {
    if (this.options.database === undefined) {
      this.memoryRow = { ...row };
      return;
    }
    this.options.database
      .prepare(
        `INSERT INTO calendar_connection_settings
          (household_id, id, provider_type, label, server_host, account_hint, status,
           selected_calendars_json, last_checked_at, last_success_at, last_error_code,
           created_at, updated_at)
         VALUES (?, ?, 'caldav', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
         ON CONFLICT(household_id) DO UPDATE SET
           label = excluded.label, server_host = excluded.server_host,
           account_hint = excluded.account_hint, status = excluded.status,
           selected_calendars_json = excluded.selected_calendars_json,
           last_checked_at = excluded.last_checked_at,
           last_success_at = excluded.last_success_at, last_error_code = NULL,
           updated_at = excluded.updated_at`,
      )
      .run(
        householdId,
        row.id,
        row.label,
        row.server_host,
        row.account_hint,
        row.status,
        row.selected_calendars_json,
        row.last_checked_at,
        row.last_success_at,
        occurredAt,
        occurredAt,
      );
  }

  private persistProjectionMappings(
    householdId: string,
    selections: readonly StoredCalendarSelection[],
  ): void {
    if (this.options.database === undefined) return;
    const statement = this.options.database.prepare(
      `UPDATE calendars
       SET owner_member_id = ?
       WHERE display_name = ? AND connection_id IN (
         SELECT id FROM calendar_connections WHERE household_id = ?
       )`,
    );
    for (const selection of selections) {
      statement.run(selection.ownerMemberId, selection.displayName, householdId);
    }
  }

  private readReceipt(
    householdId: string,
    requestId: string,
    commandType: string,
  ): CalendarConnectionCommandResult | null {
    if (this.options.database === undefined) {
      return this.receipts.get(`${householdId}:${requestId}:${commandType}`) ?? null;
    }
    const row = this.options.database
      .prepare(
        `SELECT response_json FROM command_receipts
         WHERE household_id = ? AND request_id = ? AND command_type = ?`,
      )
      .get(householdId, requestId, commandType) as { response_json: string } | undefined;
    return row === undefined
      ? null
      : CalendarConnectionCommandResultSchema.parse(JSON.parse(row.response_json) as unknown);
  }

  private writeReceipt(
    householdId: string,
    requestId: string,
    commandType: string,
    result: CalendarConnectionCommandResult,
    occurredAt: string,
  ): void {
    if (this.options.database === undefined) {
      this.receipts.set(`${householdId}:${requestId}:${commandType}`, result);
      return;
    }
    this.options.database
      .prepare(
        `INSERT INTO command_receipts
          (household_id, request_id, command_type, response_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(householdId, requestId, commandType, JSON.stringify(result), occurredAt);
  }

  private audit(
    actorId: string,
    action: AuditSummary['action'],
    targetId: string,
    result: AuditSummary['result'],
    occurredAt: string,
  ): AuditSummary {
    const audit: AuditSummary = {
      id: `audit_calendar_${this.sequence++}_${randomUUID().slice(0, 8)}`,
      actorType: 'member',
      actorId,
      source: 'companion',
      action,
      targetId,
      occurredAt,
      result,
    };
    return audit;
  }

  private writeAudit(householdId: string, audit: AuditSummary, requestId: string): void {
    this.options.database
      ?.prepare(
        `INSERT INTO audit_events
          (id, occurred_at, household_id, actor_type, actor_id, source_channel, action_type,
           target_type, target_id, request_id, result, safe_summary_json)
         VALUES (?, ?, ?, 'member', ?, 'companion', ?, 'calendar_connection', ?, ?, ?, ?)`,
      )
      .run(
        audit.id,
        audit.occurredAt,
        householdId,
        audit.actorId,
        audit.action,
        audit.targetId,
        requestId,
        audit.result,
        JSON.stringify({ action: audit.action, targetId: audit.targetId }),
      );
  }
}

function settingsFromRow(
  row: CalendarConnectionRow,
  members: readonly Member[],
): CalendarConnectionSettings {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const selections = JSON.parse(row.selected_calendars_json) as StoredCalendarSelection[];
  return CalendarConnectionSettingsSchema.parse({
    id: row.id,
    provider: 'caldav',
    label: row.label,
    serverHost: row.server_host,
    accountHint: row.account_hint,
    status: row.status,
    readOnly: true,
    calendars: selections.map((selection) => ({
      id: calendarMappingId(selection.displayName),
      displayName: selection.displayName,
      color:
        selection.ownerMemberId === null
          ? FAMILY_CALENDAR_COLOR
          : (memberById.get(selection.ownerMemberId)?.color ?? FAMILY_CALENDAR_COLOR),
      owner:
        selection.ownerMemberId === null ? null : (memberById.get(selection.ownerMemberId) ?? null),
    })),
    lastCheckedAt: row.last_checked_at,
    lastSuccessfulAt: row.last_success_at,
    message: `${selections.length} calendar${selections.length === 1 ? '' : 's'} connected · Read-only`,
  });
}

function calendarMappingId(displayName: string): string {
  return opaqueId('calendar_mapping', displayName);
}

function opaqueId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 20)}`;
}

function maskAccount(username: string): string {
  const [local = '', domain] = username.trim().split('@');
  if (domain !== undefined) {
    return `${local.slice(0, 1)}${local.length > 1 ? '•••' : ''}@${domain}`.slice(0, 80);
  }
  return `${username.trim().slice(0, 2)}•••`.slice(0, 80);
}
