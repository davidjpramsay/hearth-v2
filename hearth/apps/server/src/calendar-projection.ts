import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';

import { sortByStart } from '@hearth/core';
import {
  CalendarEventSchema,
  CalendarSourceSchema,
  MemberSchema,
  type CalendarEvent,
  type CalendarSource,
  type IntegrationState,
} from '@hearth/shared';

import {
  CalendarProviderError,
  type CalendarDescriptor,
  type CalendarProvider,
  type CalendarSyncChange,
  type ProviderCalendarEvent,
} from './integrations/calendar-provider.js';

export type CalendarProjectionMode = 'sync' | 'stale' | 'unavailable';

export interface CalendarProjection {
  calendars: CalendarSource[];
  events: CalendarEvent[];
  freshness: 'current' | 'stale';
  statusMessage: string | null;
  integration: IntegrationState;
}

interface SeedSnapshot {
  calendars: readonly CalendarDescriptor[];
  events: readonly ProviderCalendarEvent[];
  cursor: string;
  syncedAt: string;
  startDate: string;
  endDate: string;
}

interface ConnectionRow {
  id: string;
  status: string;
  write_allowed: number;
  last_success_at: string | null;
  sync_cursor: string | null;
  sync_window_start: string | null;
  sync_window_end: string | null;
}

interface CalendarRow {
  id: string;
  display_name: string;
  colour: string;
  owner_member_id: string | null;
  write_allowed: number;
  member_id: string | null;
  display_name_member: string | null;
  member_colour: string | null;
  avatar_key: string | null;
  role: 'adult' | 'child' | null;
  capabilities_json: string | null;
}

interface EventRow extends CalendarRow {
  event_id: string;
  external_id: string;
  provider_version: string | null;
  title: string;
  location: string | null;
  all_day: number;
  starts_at: string;
  ends_at: string;
  start_local_date: string;
  end_local_date: string;
  recurrence_master_external_id: string | null;
  is_recurrence_exception: number;
}

export class CalendarProjectionService {
  private readonly connectionId: string;

  constructor(
    private readonly database: InstanceType<typeof Database>,
    private readonly provider: CalendarProvider,
    private readonly ownerForCalendarExternalId: (externalId: string) => string | null,
  ) {
    this.connectionId = opaqueId('calendar_connection', provider.providerType);
  }

  seedSnapshot(householdId: string, snapshot: SeedSnapshot): void {
    const transaction = this.database.transaction(() => {
      this.ensureConnection(householdId, snapshot.syncedAt);
      this.upsertCalendars(snapshot.calendars);
      for (const event of snapshot.events) this.upsertEvent(event, snapshot.syncedAt);
      this.database
        .prepare(
          `UPDATE calendar_connections
           SET status = 'healthy', sync_cursor = ?, last_attempt_at = ?, last_success_at = ?,
               last_error_code = NULL, sync_window_start = ?, sync_window_end = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          snapshot.cursor,
          snapshot.syncedAt,
          snapshot.syncedAt,
          snapshot.startDate,
          snapshot.endDate,
          snapshot.syncedAt,
          this.connectionId,
        );
    });
    transaction();
  }

  hasSnapshot(): boolean {
    return (
      this.database
        .prepare('SELECT 1 FROM calendar_connections WHERE id = ?')
        .get(this.connectionId) !== undefined
    );
  }

  async projectRange(
    householdId: string,
    startDate: string,
    endDate: string,
    mode: CalendarProjectionMode = 'sync',
  ): Promise<CalendarProjection> {
    this.ensureConnection(householdId, new Date().toISOString());
    if (mode === 'stale') {
      return this.readProjection(householdId, startDate, endDate, 'stale');
    }
    if (mode === 'unavailable') {
      return this.readProjection(householdId, startDate, endDate, 'unavailable');
    }

    try {
      await this.sync(startDate, endDate);
      return this.readProjection(householdId, startDate, endDate, 'current');
    } catch (error) {
      const code = error instanceof CalendarProviderError ? error.code : ('UNAVAILABLE' as const);
      const attemptedAt = new Date().toISOString();
      this.database
        .prepare(
          `UPDATE calendar_connections
           SET status = ?, last_attempt_at = ?, last_error_code = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          code === 'AUTHENTICATION_REQUIRED'
            ? 'authentication-required'
            : code === 'CONFIGURATION_REQUIRED'
              ? 'not-configured'
              : 'unavailable',
          attemptedAt,
          code,
          attemptedAt,
          this.connectionId,
        );
      return this.readProjection(
        householdId,
        startDate,
        endDate,
        code === 'AUTHENTICATION_REQUIRED'
          ? 'authentication-required'
          : code === 'CONFIGURATION_REQUIRED'
            ? 'not-configured'
            : 'unavailable',
      );
    }
  }

  clear(): void {
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(
          `DELETE FROM calendar_events
           WHERE calendar_id IN (SELECT id FROM calendars WHERE connection_id = ?)`,
        )
        .run(this.connectionId);
      this.database.prepare('DELETE FROM calendars WHERE connection_id = ?').run(this.connectionId);
      this.database.prepare('DELETE FROM calendar_connections WHERE id = ?').run(this.connectionId);
    });
    transaction();
  }

  private async sync(startDate: string, endDate: string): Promise<void> {
    const calendars = await this.provider.listCalendars();
    const connection = this.readConnection();
    const withinWindow =
      connection.sync_window_start !== null &&
      connection.sync_window_end !== null &&
      startDate >= connection.sync_window_start &&
      endDate <= connection.sync_window_end;
    const cursor = withinWindow ? connection.sync_cursor : null;
    const result = await this.provider.syncEvents({ startDate, endDate, cursor });
    const transaction = this.database.transaction(() => {
      if (result.full) {
        this.database
          .prepare('UPDATE calendars SET visible = 0 WHERE connection_id = ?')
          .run(this.connectionId);
      }
      this.upsertCalendars(calendars);
      if (result.full) {
        this.database
          .prepare(
            `UPDATE calendar_events SET deleted_at = ?, synced_at = ?
             WHERE calendar_id IN (SELECT id FROM calendars WHERE connection_id = ?)
               AND start_local_date <= ? AND end_local_date >= ? AND deleted_at IS NULL`,
          )
          .run(result.syncedAt, result.syncedAt, this.connectionId, endDate, startDate);
      }
      for (const change of result.changes) this.applyChange(change, result.syncedAt);
      const windowStart =
        connection.sync_window_start === null || startDate < connection.sync_window_start
          ? startDate
          : connection.sync_window_start;
      const windowEnd =
        connection.sync_window_end === null || endDate > connection.sync_window_end
          ? endDate
          : connection.sync_window_end;
      this.database
        .prepare(
          `UPDATE calendar_connections
           SET status = 'healthy', sync_cursor = ?, last_attempt_at = ?, last_success_at = ?,
               last_error_code = NULL, sync_window_start = ?, sync_window_end = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          result.cursor,
          result.syncedAt,
          result.syncedAt,
          windowStart,
          windowEnd,
          result.syncedAt,
          this.connectionId,
        );
    });
    transaction();
  }

  private ensureConnection(householdId: string, timestamp: string): void {
    this.database
      .prepare(
        `INSERT OR IGNORE INTO calendar_connections
          (id, household_id, provider_type, credential_reference, status, read_allowed,
           write_allowed, last_success_at, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 'stale', 1, 0, NULL, ?, ?)`,
      )
      .run(this.connectionId, householdId, this.provider.providerType, timestamp, timestamp);
  }

  private readConnection(): ConnectionRow {
    const row = this.database
      .prepare(
        `SELECT id, status, write_allowed, last_success_at, sync_cursor,
                sync_window_start, sync_window_end
         FROM calendar_connections WHERE id = ?`,
      )
      .get(this.connectionId) as ConnectionRow | undefined;
    if (row === undefined) throw new Error('Calendar projection connection was not initialized.');
    return row;
  }

  private upsertCalendars(calendars: readonly CalendarDescriptor[]): void {
    const statement = this.database.prepare(
      `INSERT INTO calendars
        (id, connection_id, external_id, display_name, colour, owner_member_id, visible)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(connection_id, external_id) DO UPDATE SET
         display_name = excluded.display_name,
         colour = excluded.colour,
         owner_member_id = COALESCE(excluded.owner_member_id, calendars.owner_member_id),
         visible = 1`,
    );
    for (const calendar of calendars) {
      statement.run(
        opaqueId('calendar', calendar.externalId),
        this.connectionId,
        calendar.externalId,
        calendar.displayName,
        calendar.color,
        this.ownerForCalendarExternalId(calendar.externalId),
      );
    }
  }

  private applyChange(change: CalendarSyncChange, syncedAt: string): void {
    if (change.type === 'upsert') {
      this.upsertEvent(change.event, syncedAt);
      return;
    }
    this.database
      .prepare(
        `UPDATE calendar_events SET deleted_at = ?, synced_at = ?
         WHERE calendar_id = ? AND external_id = ?`,
      )
      .run(
        change.deletedAt,
        syncedAt,
        opaqueId('calendar', change.calendarExternalId),
        change.externalId,
      );
  }

  private upsertEvent(event: ProviderCalendarEvent, syncedAt: string): void {
    this.database
      .prepare(
        `INSERT INTO calendar_events
          (id, calendar_id, external_id, provider_version, title, description, location, all_day,
           starts_at, ends_at, start_local_date, end_local_date, recurrence_master_external_id,
           is_recurrence_exception, source_modified_at, synced_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(calendar_id, external_id) DO UPDATE SET
           provider_version = excluded.provider_version,
           title = excluded.title,
           description = excluded.description,
           location = excluded.location,
           all_day = excluded.all_day,
           starts_at = excluded.starts_at,
           ends_at = excluded.ends_at,
           start_local_date = excluded.start_local_date,
           end_local_date = excluded.end_local_date,
           recurrence_master_external_id = excluded.recurrence_master_external_id,
           is_recurrence_exception = excluded.is_recurrence_exception,
           source_modified_at = excluded.source_modified_at,
           synced_at = excluded.synced_at,
           deleted_at = NULL`,
      )
      .run(
        opaqueId('event', event.externalId),
        opaqueId('calendar', event.calendarExternalId),
        event.externalId,
        event.providerVersion,
        event.title,
        event.description,
        event.location,
        event.allDay ? 1 : 0,
        event.start,
        event.end,
        event.startLocalDate,
        event.endLocalDate,
        event.recurrenceMasterExternalId,
        event.isRecurrenceException ? 1 : 0,
        event.sourceModifiedAt,
        syncedAt,
      );
  }

  private readProjection(
    householdId: string,
    startDate: string,
    endDate: string,
    state: 'current' | 'stale' | 'unavailable' | 'authentication-required' | 'not-configured',
  ): CalendarProjection {
    const connection = this.readConnection();
    const calendars = this.readCalendars(householdId);
    const calendarById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
    const rows = this.database
      .prepare(
        `SELECT e.id AS event_id, e.external_id, e.provider_version, e.title, e.location,
                e.all_day, e.starts_at, e.ends_at, e.start_local_date, e.end_local_date,
                e.recurrence_master_external_id, e.is_recurrence_exception,
                c.id, c.display_name, c.colour, c.owner_member_id,
                cc.write_allowed,
                m.id AS member_id, m.display_name AS display_name_member,
                m.colour AS member_colour, m.avatar_key, m.role, m.capabilities_json
         FROM calendar_events e
         JOIN calendars c ON c.id = e.calendar_id
         JOIN calendar_connections cc ON cc.id = c.connection_id
         LEFT JOIN members m ON m.id = c.owner_member_id AND m.archived_at IS NULL
         WHERE cc.household_id = ? AND cc.id = ? AND c.visible = 1 AND e.deleted_at IS NULL
           AND e.start_local_date <= ? AND e.end_local_date >= ?
         ORDER BY e.all_day DESC, e.starts_at, e.id`,
      )
      .all(householdId, this.connectionId, endDate, startDate) as EventRow[];
    const events = rows.map((row) => {
      const source = calendarById.get(row.id);
      if (source === undefined)
        throw new Error(`Calendar ${row.id} is missing from its projection.`);
      return CalendarEventSchema.parse({
        id: row.event_id,
        calendarId: row.id,
        title: row.title,
        owner: source.owner,
        sourceLabel: source.displayName,
        color: source.color,
        start: row.starts_at,
        end: row.ends_at,
        startLocalDate: row.start_local_date,
        endLocalDate: row.end_local_date,
        allDay: row.all_day === 1,
        location: row.location,
        providerVersion: row.provider_version,
        recurrenceMasterId:
          row.recurrence_master_external_id === null
            ? null
            : opaqueId('event', row.recurrence_master_external_id),
        isRecurrenceException: row.is_recurrence_exception === 1,
      });
    });
    const freshness = state === 'current' ? 'current' : 'stale';
    const statusMessage =
      state === 'stale'
        ? 'Calendar last updated at 6:45 · Trying again quietly.'
        : state === 'authentication-required'
          ? 'Calendar needs attention · Showing saved plans.'
          : state === 'not-configured'
            ? 'Choose calendars in Admin · Showing saved plans.'
            : state === 'unavailable'
              ? 'Calendar is unavailable · Showing saved plans.'
              : null;
    const integrationStatus =
      state === 'current'
        ? 'healthy'
        : state === 'authentication-required'
          ? 'authentication-required'
          : state === 'not-configured'
            ? 'not-configured'
            : state;
    return {
      calendars,
      events: sortByStart(events),
      freshness,
      statusMessage,
      integration: {
        kind: 'calendar',
        status: integrationStatus,
        lastSuccessfulAt: connection.last_success_at,
        message:
          statusMessage ??
          `${calendars.length} ${calendars.length === 1 ? 'calendar is' : 'calendars are'} current.`,
      },
    };
  }

  private readCalendars(householdId: string): CalendarSource[] {
    const rows = this.database
      .prepare(
        `SELECT c.id, c.display_name, c.colour, c.owner_member_id, cc.write_allowed,
                m.id AS member_id, m.display_name AS display_name_member,
                m.colour AS member_colour, m.avatar_key, m.role, m.capabilities_json
         FROM calendars c
         JOIN calendar_connections cc ON cc.id = c.connection_id
         LEFT JOIN members m ON m.id = c.owner_member_id AND m.archived_at IS NULL
         WHERE cc.household_id = ? AND cc.id = ? AND c.visible = 1
         ORDER BY c.display_name, c.id`,
      )
      .all(householdId, this.connectionId) as CalendarRow[];
    return rows.map((row) =>
      CalendarSourceSchema.parse({
        id: row.id,
        displayName: row.display_name,
        color: row.colour,
        owner: memberFromCalendarRow(row),
        access: row.write_allowed === 1 ? 'read-write' : 'read-only',
      }),
    );
  }
}

function memberFromCalendarRow(row: CalendarRow) {
  if (
    row.member_id === null ||
    row.display_name_member === null ||
    row.member_colour === null ||
    row.role === null ||
    row.capabilities_json === null
  ) {
    return null;
  }
  return MemberSchema.parse({
    id: row.member_id,
    displayName: row.display_name_member,
    color: row.member_colour,
    avatarUrl: row.avatar_key ?? '/brand/hearth-mark.png',
    role: row.role,
    capabilities: JSON.parse(row.capabilities_json) as unknown,
  });
}

function opaqueId(prefix: string, externalId: string): string {
  if (/^[a-z][a-z0-9_-]{2,95}$/.test(externalId)) return externalId;
  const digest = createHash('sha256').update(externalId).digest('hex').slice(0, 24);
  return `${prefix}_${digest}`;
}
