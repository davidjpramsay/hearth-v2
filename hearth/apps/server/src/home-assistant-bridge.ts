import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { addLocalDays, localDateInTimezone } from '@hearth/core';
import {
  AutomationSecretSchema,
  BridgeCalendarSchema,
  BridgeChoreCompletionResultSchema,
  ChoreCommandResultSchema,
  BridgeConnectionSchema,
  BridgeStateSchema,
  ScreenCommandSchema,
  type BridgeConnection,
  type BridgeGrantRequest,
  type BridgeChoreCompletionRequest,
  type BridgeChoreCompletionResult,
  type ScreenCommand,
  type ScreenPresentationRequest,
  type TvDeviceSession,
  type ScreenTab,
  type CalendarEvent,
} from '@hearth/shared';

import type { AdminRepository } from './admin-repository.js';
import { RepositoryError, type HearthRepository } from './repository.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const newId = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '_')}`;
const ONLINE_MS = 15_000;
const COMMAND_MS = 30_000;
const RECEIPT_MS = 24 * 60 * 60_000;
type ConnectionRow = {
  connection: BridgeConnection;
  householdId: string;
  requestId: string;
  secretHash: string;
  inputHash: string;
};
type CommandRow = {
  command: ScreenCommand;
  connectionId: string;
  deviceId: string;
  requestId: string;
  instanceId: string;
  inputHash: string;
};
type Presentation = ScreenPresentationRequest & { receivedAt: string };
type ChoreReceipt = {
  connectionId: string;
  requestId: string;
  inputHash: string;
  createdAt: string;
  result: BridgeChoreCompletionResult | null;
};

/** Inbound authority only. Never accepts an HA long-lived token or an adult/TV credential. */
export class HomeAssistantBridgeService {
  private readonly connections = new Map<string, ConnectionRow>();
  private readonly commands = new Map<string, CommandRow>();
  private readonly presentations = new Map<string, Presentation>();
  private readonly revocations = new Set<string>();
  private readonly choreReceipts = new Map<string, ChoreReceipt>();

  constructor(
    private readonly admin: AdminRepository,
    private readonly repository: HearthRepository,
    private readonly options: { database?: InstanceType<typeof Database>; now?: () => Date } = {},
  ) {
    const db = options.database;
    if (db === undefined) return;
    for (const row of db
      .prepare('SELECT * FROM home_assistant_bridge_connections ORDER BY rowid')
      .all() as {
      record_json: string;
      household_id: string;
      request_id: string;
      secret_hash: string;
      input_hash: string;
    }[]) {
      const connection = BridgeConnectionSchema.parse(JSON.parse(row.record_json));
      this.connections.set(connection.id, {
        connection,
        householdId: row.household_id,
        requestId: row.request_id,
        secretHash: row.secret_hash,
        inputHash: row.input_hash,
      });
    }
    for (const row of db
      .prepare(
        'SELECT record_json FROM home_assistant_bridge_commands WHERE created_at >= ? ORDER BY rowid',
      )
      .all(new Date(this.now().getTime() - RECEIPT_MS).toISOString()) as {
      record_json: string;
    }[]) {
      const parsed = JSON.parse(row.record_json) as CommandRow;
      parsed.command = ScreenCommandSchema.parse(parsed.command);
      // No live display lease survives a process restart. Receipts still replay, never redeliver.
      if (parsed.command.status === 'pending') parsed.command.status = 'cancelled';
      this.commands.set(parsed.command.id, parsed);
      this.saveCommand(parsed);
    }
    for (const row of db
      .prepare('SELECT household_id,request_id FROM home_assistant_bridge_revocations')
      .all() as { household_id: string; request_id: string }[])
      this.revocations.add(`${row.household_id}:${row.request_id}`);
    for (const row of db
      .prepare('SELECT record_json FROM home_assistant_bridge_chore_receipts')
      .all() as { record_json: string }[]) {
      const receipt = JSON.parse(row.record_json) as ChoreReceipt;
      if (receipt.result !== null)
        receipt.result = BridgeChoreCompletionResultSchema.parse(receipt.result);
      this.choreReceipts.set(`${receipt.connectionId}:${receipt.requestId}`, receipt);
    }
  }

  async get(householdId: string, actorId: string) {
    await this.admin.getOverview(householdId, actorId);
    return this.active(householdId)?.connection ?? null;
  }

  /** Called only by the existing demo reset route, never by private household APIs. */
  reset() {
    this.options.database?.transaction(() => {
      this.options.database?.exec(
        'DELETE FROM home_assistant_bridge_chore_receipts; DELETE FROM home_assistant_bridge_commands; DELETE FROM home_assistant_bridge_revocations; DELETE FROM home_assistant_bridge_connections;',
      );
    })();
    this.connections.clear();
    this.commands.clear();
    this.presentations.clear();
    this.revocations.clear();
    this.choreReceipts.clear();
  }

  async grant(householdId: string, actorId: string, input: BridgeGrantRequest) {
    const overview = await this.admin.getOverview(householdId, actorId);
    const inputHash = digest(JSON.stringify(input));
    const previous = [...this.connections.values()].find(
      (row) => row.householdId === householdId && row.requestId === input.requestId,
    );
    if (previous !== undefined) {
      if (previous.inputHash !== inputHash) this.conflict();
      return { connection: structuredClone(previous.connection), replayed: true };
    }
    if (this.active(householdId) !== undefined)
      throw new RepositoryError(
        'CONFLICT',
        'Disconnect the existing Home Assistant access before replacing it.',
      );
    if (
      input.screenIds.some(
        (id) =>
          !overview.pairedDevices.some((device) => device.id === id && device.revokedAt === null),
      )
    )
      throw new RepositoryError('FORBIDDEN', 'Choose only currently connected Hearth screens.');
    const connection: BridgeConnection = {
      id: newId('ha_bridge'),
      createdAt: this.now().toISOString(),
      revokedAt: null,
      screenIds: [...input.screenIds],
      shareChores: input.shareChores,
      shareCalendar: input.shareCalendar,
      controlChores: input.controlChores,
    };
    const row: ConnectionRow = {
      connection,
      householdId,
      requestId: input.requestId,
      secretHash: digest(input.secret),
      inputHash,
    };
    // A reused secret must never restore a revoked grant.
    if ([...this.connections.values()].some((existing) => existing.secretHash === row.secretHash))
      this.conflict();
    this.atomic(() => {
      this.saveConnection(row);
      this.audit(
        householdId,
        actorId,
        'member',
        'home-assistant.bridge.grant',
        connection.id,
        input.requestId,
      );
    });
    this.connections.set(connection.id, row);
    return { connection: structuredClone(connection), replayed: false };
  }

  async revoke(householdId: string, actorId: string, requestId: string) {
    await this.admin.getOverview(householdId, actorId);
    const receipt = `${householdId}:${requestId}`;
    if (this.revocations.has(receipt)) return { revoked: true as const };
    const row = this.active(householdId);
    const revoked =
      row === undefined
        ? undefined
        : { ...row, connection: { ...row.connection, revokedAt: this.now().toISOString() } };
    const cancelled = [...this.commands.values()]
      .filter(
        (command) =>
          command.connectionId === row?.connection.id && command.command.status === 'pending',
      )
      .map((command) => ({
        ...command,
        command: { ...command.command, status: 'cancelled' as const },
      }));
    this.atomic(() => {
      if (revoked !== undefined) {
        this.saveConnection(revoked);
        this.audit(
          householdId,
          actorId,
          'member',
          'home-assistant.bridge.revoke',
          revoked.connection.id,
          requestId,
        );
        for (const command of cancelled) this.saveCommand(command);
      }
      this.options.database
        ?.prepare(
          'INSERT INTO home_assistant_bridge_revocations (household_id,request_id) VALUES (?,?)',
        )
        .run(householdId, requestId);
    });
    if (revoked !== undefined) this.connections.set(revoked.connection.id, revoked);
    for (const command of cancelled) this.commands.set(command.command.id, command);
    this.revocations.add(receipt);
    return { revoked: true as const };
  }

  authenticate(secret: string): ConnectionRow {
    if (!AutomationSecretSchema.safeParse(secret).success)
      throw new RepositoryError(
        'UNAUTHENTICATED',
        'Connect Home Assistant again from an adult phone.',
      );
    const hashed = digest(secret);
    const row = [...this.connections.values()].find(
      (candidate) => candidate.secretHash === hashed && candidate.connection.revokedAt === null,
    );
    if (row === undefined)
      throw new RepositoryError(
        'UNAUTHENTICATED',
        'Connect Home Assistant again from an adult phone.',
      );
    return row;
  }

  async state(secret: string) {
    const row = this.authenticate(secret);
    const household = await this.admin.getHousehold(row.householdId);
    const date = localDateInTimezone(this.now().toISOString(), household.timezone);
    const [devices, chores, calendar] = await Promise.all([
      this.devices(row.householdId),
      row.connection.shareChores
        ? this.repository.getChores(row.householdId, date).catch(() => null)
        : null,
      row.connection.shareCalendar
        ? this.calendarRange(row, date, addLocalDays(date, 7)).catch(() => null)
        : null,
    ]);
    // Recheck after awaited reads so revocation cannot leak an in-flight snapshot.
    this.authenticate(secret);
    const occurrences = chores?.groups.flatMap((group) => group.occurrences) ?? [];
    return BridgeStateSchema.parse({
      version: 1,
      generatedAt: this.now().toISOString(),
      household: { id: household.id, name: household.name, timezone: household.timezone },
      permissions: {
        shareChores: row.connection.shareChores,
        shareCalendar: row.connection.shareCalendar,
        controlChores: row.connection.controlChores,
      },
      screens: devices
        .filter(
          (device) => row.connection.screenIds.includes(device.id) && device.revokedAt === null,
        )
        .map((device) => {
          const presentation = this.presentations.get(device.id);
          const online = this.isOnline(presentation);
          return {
            id: device.id,
            name: device.name,
            online,
            currentTab: online ? (presentation?.tab ?? null) : null,
            lastSeenAt: presentation?.receivedAt ?? null,
            command: this.latestCommand(row.connection.id, device.id)?.command ?? null,
          };
        }),
      chores:
        chores === null
          ? null
          : {
              localDate: date,
              open: occurrences.filter((chore) => chore.state === 'pending').length,
              completed: occurrences.filter((chore) => chore.state === 'completed').length,
              truncated: occurrences.length > 250,
              items: occurrences.slice(0, 250).map((chore) => ({
                id: chore.id,
                title: chore.title,
                assignee: chore.assignee.displayName,
                state: chore.state,
                completionId: row.connection.controlChores ? chore.completionId : null,
                locked: chore.locked,
              })),
            },
      calendar,
    });
  }

  async setChoreCompletion(
    secret: string,
    occurrenceId: string,
    input: BridgeChoreCompletionRequest,
  ) {
    const row = this.authenticate(secret);
    if (!row.connection.shareChores || !row.connection.controlChores)
      throw new RepositoryError(
        'FORBIDDEN',
        'Allow chore completion changes from an adult phone first.',
      );
    const key = `${row.connection.id}:${input.requestId}`;
    const inputHash = digest(JSON.stringify({ occurrenceId, ...input }));
    const domainRequestId = `ha_chore_${digest(key)}`;
    const replay = (): BridgeChoreCompletionResult | null => {
      const receipt = this.choreReceipts.get(key);
      if (receipt === undefined) return null;
      if (receipt.inputHash !== inputHash) this.conflict();
      if (receipt.result !== null) return { ...receipt.result, replayed: true };
      // A crash may occur after the atomic domain write but before copying its safe receipt.
      const recovered = this.options.database
        ?.prepare(
          'SELECT response_json FROM command_receipts WHERE household_id = ? AND request_id = ? AND command_type = ?',
        )
        .get(row.householdId, domainRequestId, input.isCompleted ? 'complete' : 'undo') as
        { response_json: string } | undefined;
      if (recovered === undefined) return null;
      const domain = ChoreCommandResultSchema.parse(JSON.parse(recovered.response_json));
      if (domain.occurrence.id !== occurrenceId || domain.occurrence.localDate !== input.localDate)
        this.conflict();
      const result = BridgeChoreCompletionResultSchema.parse({
        id: occurrenceId,
        localDate: input.localDate,
        state: domain.occurrence.state,
        completionId: domain.occurrence.completionId,
        replayed: true,
      });
      this.saveChoreReceipt({ ...receipt, result });
      return result;
    };
    const previous = replay();
    if (previous !== null) return previous;
    const household = await this.admin.getHousehold(row.householdId);
    const date = localDateInTimezone(this.now().toISOString(), household.timezone);
    if (input.localDate !== date)
      throw new RepositoryError('CONFLICT', 'Refresh today’s chores before changing them.');
    const chores = await this.repository.getChores(row.householdId, date);
    this.authenticate(secret);
    const concurrent = replay();
    if (concurrent !== null) return concurrent;
    // Date may have rolled over while a read was in flight.
    if (date !== localDateInTimezone(this.now().toISOString(), household.timezone))
      throw new RepositoryError('CONFLICT', 'Refresh today’s chores before changing them.');
    const target = chores.groups
      .flatMap((group) => group.occurrences)
      .find((chore) => chore.id === occurrenceId);
    if (target === undefined || target.localDate !== date)
      throw new RepositoryError(
        'NOT_FOUND',
        'That chore is not available in today’s household chores.',
      );
    let receipt = this.choreReceipts.get(key);
    if (receipt === undefined) {
      const recent = [...this.choreReceipts.values()].filter(
        (entry) =>
          entry.connectionId === row.connection.id &&
          Date.parse(entry.createdAt) > this.now().getTime() - 60_000,
      );
      if (recent.length >= 30)
        throw new RepositoryError(
          'CONFLICT',
          'Too many chore changes. Wait a minute and try again.',
        );
      receipt = {
        connectionId: row.connection.id,
        requestId: input.requestId,
        inputHash,
        createdAt: this.now().toISOString(),
        result: null,
      };
      this.saveChoreReceipt(receipt);
    }
    const actor = {
      id: 'service_home_assistant',
      type: 'service' as const,
      source: 'automation' as const,
    };
    const domain = input.isCompleted
      ? await this.repository.complete(row.householdId, occurrenceId, domainRequestId, actor)
      : await this.repository.undo(
          row.householdId,
          occurrenceId,
          domainRequestId,
          input.completionId!,
          actor,
        );
    const result = BridgeChoreCompletionResultSchema.parse({
      id: occurrenceId,
      localDate: date,
      state: domain.occurrence.state,
      completionId: domain.occurrence.completionId,
      replayed: domain.replayed,
    });
    this.saveChoreReceipt({ ...receipt, result });
    return result;
  }

  private saveChoreReceipt(receipt: ChoreReceipt) {
    this.options.database
      ?.prepare(
        'INSERT INTO home_assistant_bridge_chore_receipts (connection_id,request_id,record_json) VALUES (?,?,?) ON CONFLICT(connection_id,request_id) DO UPDATE SET record_json=excluded.record_json',
      )
      .run(receipt.connectionId, receipt.requestId, JSON.stringify(receipt));
    this.choreReceipts.set(`${receipt.connectionId}:${receipt.requestId}`, receipt);
  }

  async navigate(secret: string, deviceId: string, requestId: string, tab: ScreenTab) {
    const row = this.authenticate(secret);
    this.clean();
    const inputHash = digest(JSON.stringify({ deviceId, tab }));
    const replay = [...this.commands.values()].find(
      (candidate) =>
        candidate.connectionId === row.connection.id && candidate.requestId === requestId,
    );
    if (replay !== undefined) {
      if (replay.inputHash !== inputHash) this.conflict();
      this.expire(replay);
      return { command: structuredClone(replay.command), replayed: true };
    }
    const devices = await this.devices(row.householdId);
    this.authenticate(secret);
    // Device enumeration yields. A simultaneous exact retry may have committed meanwhile.
    const concurrent = [...this.commands.values()].find(
      (candidate) =>
        candidate.connectionId === row.connection.id && candidate.requestId === requestId,
    );
    if (concurrent !== undefined) {
      if (concurrent.inputHash !== inputHash) this.conflict();
      this.expire(concurrent);
      return { command: structuredClone(concurrent.command), replayed: true };
    }
    if (
      !row.connection.screenIds.includes(deviceId) ||
      !devices.some((device) => device.id === deviceId && device.revokedAt === null)
    )
      throw new RepositoryError('FORBIDDEN', 'Home Assistant cannot control that screen.');
    const presentation = this.presentations.get(deviceId);
    if (presentation === undefined || !this.isOnline(presentation) || presentation.tab === null)
      throw new RepositoryError('CONFLICT', 'Open Hearth on this screen before changing its tab.');
    const recent = [...this.commands.values()].filter(
      (candidate) =>
        candidate.connectionId === row.connection.id &&
        Date.parse(candidate.command.createdAt) > this.now().getTime() - 60_000,
    );
    if (recent.length >= 30)
      throw new RepositoryError(
        'CONFLICT',
        'Too many screen changes. Wait a minute before trying again.',
      );
    const command: CommandRow = {
      connectionId: row.connection.id,
      deviceId,
      requestId,
      instanceId: presentation.instanceId,
      inputHash,
      command: {
        id: newId('screen_command'),
        tab,
        status: 'pending',
        createdAt: this.now().toISOString(),
        expiresAt: new Date(this.now().getTime() + COMMAND_MS).toISOString(),
      },
    };
    const superseded = [...this.commands.values()]
      .filter((previous) => previous.deviceId === deviceId && previous.command.status === 'pending')
      .map((previous) => ({
        ...previous,
        command: { ...previous.command, status: 'superseded' as const },
      }));
    this.atomic(() => {
      for (const previous of superseded) this.saveCommand(previous);
      this.saveCommand(command);
      this.audit(
        row.householdId,
        row.connection.id,
        'service',
        'screen.navigate',
        deviceId,
        requestId,
      );
    });
    for (const previous of superseded) this.commands.set(previous.command.id, previous);
    this.commands.set(command.command.id, command);
    return { command: structuredClone(command.command), replayed: false };
  }

  presentation(session: TvDeviceSession, input: ScreenPresentationRequest) {
    const result = (command: ScreenCommand | null) => ({
      serverTime: this.now().toISOString(),
      command,
    });
    const previous = this.presentations.get(session.deviceId);
    if (
      previous !== undefined &&
      previous.instanceId !== input.instanceId &&
      this.isOnline(previous)
    )
      throw new RepositoryError('CONFLICT', 'Another open Hearth window is reporting this screen.');
    this.presentations.set(session.deviceId, { ...input, receivedAt: this.now().toISOString() });
    const connection = this.active(session.householdId);
    if (connection === undefined || !connection.connection.screenIds.includes(session.deviceId))
      return result(null);
    const row = this.latestCommand(connection.connection.id, session.deviceId);
    if (row === undefined || row.command.status !== 'pending') return result(null);
    if (row.instanceId !== input.instanceId || !this.isOnline(previous) || input.tab === null) {
      this.setStatus(row, 'cancelled');
      return result(null);
    }
    if (input.acknowledgedCommandId === row.command.id && input.tab === row.command.tab) {
      this.setStatus(row, 'applied');
      return result(null);
    }
    return result(structuredClone(row.command));
  }

  async calendar(secret: string, start: string, end: string) {
    const row = this.authenticate(secret);
    if (!row.connection.shareCalendar)
      throw new RepositoryError('FORBIDDEN', 'Calendar sharing is not enabled for Home Assistant.');
    const home = await this.admin.getHousehold(row.householdId);
    const startDate = localDateInTimezone(start, home.timezone);
    const endDate = localDateInTimezone(end, home.timezone);
    const endClock = new Intl.DateTimeFormat('en-GB', {
      timeZone: home.timezone,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(end));
    const exclusiveEndDate =
      endClock === '00:00:00' && new Date(end).getUTCMilliseconds() === 0
        ? endDate
        : addLocalDays(endDate, 1);
    const result = await this.calendarRange(row, startDate, exclusiveEndDate, (event) =>
      event.allDay
        ? event.startLocalDate < exclusiveEndDate && event.endLocalDate >= startDate
        : Date.parse(event.start) < Date.parse(end) && Date.parse(event.end) > Date.parse(start),
    );
    this.authenticate(secret);
    return result;
  }

  private async calendarRange(
    row: ConnectionRow,
    start: string,
    end: string,
    include: (event: CalendarEvent) => boolean = () => true,
  ) {
    const events = new Map<string, CalendarEvent>();
    let freshness: 'current' | 'stale' | 'offline' = 'current';
    for (let date = start; date < end; date = addLocalDays(date, 7)) {
      const week = await this.repository.getWeek(row.householdId, date);
      if (week.freshness === 'offline' || (week.freshness === 'stale' && freshness === 'current'))
        freshness = week.freshness;
      for (const event of week.events)
        if (event.startLocalDate < end && event.endLocalDate >= start && include(event))
          events.set(event.id, event);
      if (events.size > 2000)
        throw new RepositoryError(
          'INTEGRATION_UNAVAILABLE',
          'Too many calendar events for this Home Assistant range. Choose a shorter range.',
        );
    }
    return BridgeCalendarSchema.parse({
      freshness,
      events: [...events.values()]
        .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
        .map(({ id, title, start, end, startLocalDate, endLocalDate, allDay }) => ({
          id,
          title,
          start,
          end,
          startLocalDate,
          endLocalDate: allDay ? addLocalDays(endLocalDate, 1) : endLocalDate,
          allDay,
        })),
    });
  }

  private async devices(householdId: string) {
    // getOverview requires an adult. Device enumeration is scoped internally to this grant's home.
    const household = await this.admin.getHousehold(householdId);
    const admin = household.members.find((member) =>
      member.capabilities.includes('household.admin'),
    );
    if (admin === undefined)
      throw new RepositoryError('FORBIDDEN', 'This home needs an adult administrator.');
    return (await this.admin.getOverview(householdId, admin.id)).pairedDevices;
  }
  private active(householdId: string) {
    return [...this.connections.values()].find(
      (row) => row.householdId === householdId && row.connection.revokedAt === null,
    );
  }
  private latestCommand(connectionId: string, deviceId: string) {
    const row = [...this.commands.values()].findLast(
      (candidate) => candidate.connectionId === connectionId && candidate.deviceId === deviceId,
    );
    if (row !== undefined) this.expire(row);
    return row;
  }
  private isOnline(presentation: Presentation | undefined) {
    return (
      presentation !== undefined &&
      presentation.tab !== null &&
      this.now().getTime() - Date.parse(presentation.receivedAt) < ONLINE_MS
    );
  }
  private expire(row: CommandRow) {
    if (
      row.command.status === 'pending' &&
      Date.parse(row.command.expiresAt) <= this.now().getTime()
    )
      this.setStatus(row, 'expired');
  }
  private setStatus(row: CommandRow, status: ScreenCommand['status']) {
    const command = { ...row.command, status };
    this.saveCommand({ ...row, command });
    row.command = command;
  }
  private now() {
    return this.options.now?.() ?? new Date();
  }
  private conflict(): never {
    throw new RepositoryError(
      'CONFLICT',
      'That request identifier was already used with different content.',
    );
  }
  private atomic(operation: () => void) {
    if (this.options.database === undefined) operation();
    else this.options.database.transaction(operation)();
  }
  private clean() {
    const cutoff = new Date(this.now().getTime() - RECEIPT_MS).toISOString();
    for (const [id, row] of this.commands)
      if (row.command.createdAt < cutoff) this.commands.delete(id);
    this.options.database
      ?.prepare('DELETE FROM home_assistant_bridge_commands WHERE created_at < ?')
      .run(cutoff);
  }
  private saveConnection(row: ConnectionRow) {
    this.options.database
      ?.prepare(
        `INSERT INTO home_assistant_bridge_connections (id,household_id,request_id,secret_hash,input_hash,record_json,revoked_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json,revoked_at=excluded.revoked_at`,
      )
      .run(
        row.connection.id,
        row.householdId,
        row.requestId,
        row.secretHash,
        row.inputHash,
        JSON.stringify(row.connection),
        row.connection.revokedAt,
      );
  }
  private saveCommand(row: CommandRow) {
    this.options.database
      ?.prepare(
        `INSERT INTO home_assistant_bridge_commands (id,connection_id,device_id,request_id,created_at,record_json) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json`,
      )
      .run(
        row.command.id,
        row.connectionId,
        row.deviceId,
        row.requestId,
        row.command.createdAt,
        JSON.stringify(row),
      );
  }
  private audit(
    householdId: string,
    actorId: string,
    actorType: 'member' | 'service',
    action: 'home-assistant.bridge.grant' | 'home-assistant.bridge.revoke' | 'screen.navigate',
    targetId: string,
    requestId: string,
  ) {
    this.admin.recordActivity(
      householdId,
      {
        id: newId('audit_bridge'),
        occurredAt: this.now().toISOString(),
        actorId,
        actorType,
        source: actorType === 'service' ? 'automation' : 'companion',
        action,
        targetId,
        result: 'succeeded',
      },
      requestId,
    );
  }
}
