import { createHash, randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import {
  HomeAssistantConnectionCommandResultSchema,
  HomeAssistantConnectionSettingsSchema,
  HomeAssistantConnectionTestResultSchema,
  type AuditSummary,
  type HomeAssistantConnectionCommandResult,
  type HomeAssistantConnectionSettings,
  type HomeAssistantConnectionTestRequest,
  type HomeAssistantConnectionTestResult,
  type SaveHomeAssistantConnectionRequest,
} from '@hearth/shared';

import type { AdminRepository } from './admin-repository.js';
import { HomeAssistantUnavailableError } from './integrations/home-assistant-provider.js';
import {
  discoverHomeAssistant,
  type HomeAssistantDiscovery,
  type HomeAssistantDiscoveryCandidate,
  type HomeAssistantRuntimeConfig,
} from './integrations/home-assistant-runtime.js';
import { RepositoryError } from './repository.js';

type HomeAssistantOptionGroup = keyof HomeAssistantDiscovery['options'];

interface PendingHomeAssistantOption extends HomeAssistantDiscoveryCandidate {
  id: string;
}

interface PendingHomeAssistantTest {
  householdId: string;
  testId: string;
  serverUrl: string;
  accessToken: string;
  serverHost: string;
  instanceName: string;
  version: string;
  options: Record<HomeAssistantOptionGroup, PendingHomeAssistantOption[]>;
  expiresAt: string;
}

interface StoredHomeAssistantMappings {
  occupancy: string;
  televisionPower: string;
  hearthForeground: string;
  protectedMedia: string;
}

interface StoredHomeAssistantActions {
  evening: string;
  goodnight: string;
  screenOff: string;
}

interface HomeAssistantConnectionRow {
  id: string;
  label: string;
  server_host: string;
  instance_name: string;
  version: string;
  status: 'ready' | 'needs-attention';
  state_mappings_json: string;
  action_mappings_json: string;
  last_checked_at: string;
  last_success_at: string | null;
}

export interface HomeAssistantConnectionVerifier {
  verify(input: HomeAssistantConnectionTestRequest): Promise<HomeAssistantDiscovery>;
}

export interface HomeAssistantCredentialStore {
  save(config: HomeAssistantRuntimeConfig): Promise<void>;
  remove(): Promise<void>;
}

export interface HomeAssistantConnectionRepository {
  get(householdId: string, actorId: string): Promise<HomeAssistantConnectionSettings | null>;
  test(
    householdId: string,
    actorId: string,
    input: HomeAssistantConnectionTestRequest,
  ): Promise<HomeAssistantConnectionTestResult>;
  save(
    householdId: string,
    actorId: string,
    input: SaveHomeAssistantConnectionRequest,
  ): Promise<HomeAssistantConnectionCommandResult>;
  remove(
    householdId: string,
    actorId: string,
    requestId: string,
  ): Promise<HomeAssistantConnectionCommandResult>;
  reset(): void;
  close(): void;
}

export class FakeHomeAssistantConnectionVerifier implements HomeAssistantConnectionVerifier {
  async verify(input: HomeAssistantConnectionTestRequest): Promise<HomeAssistantDiscovery> {
    if (input.accessToken === 'wrong-home-assistant-token') {
      throw new HomeAssistantUnavailableError('Home Assistant did not accept that access token.');
    }
    return {
      instanceName: 'Hearth Demo Home',
      version: '2026.8.0',
      options: {
        occupancy: [candidate('binary_sensor.family_home', 'Family home', 'Binary sensor')],
        televisionPower: [
          candidate('media_player.living_room_tv', 'Living room television', 'Media player'),
        ],
        hearthForeground: [
          candidate('input_boolean.hearth_foreground', 'Hearth app active', 'Helper toggle'),
        ],
        protectedMedia: [
          candidate(
            'binary_sensor.protected_media_active',
            'Protected playback active',
            'Binary sensor',
          ),
        ],
        scripts: [
          candidate('script.hearth_evening', 'Evening', 'Script'),
          candidate('script.hearth_goodnight', 'Goodnight', 'Script'),
          candidate('script.hearth_screen_off', 'Screen off', 'Script'),
        ],
      },
    };
  }
}

export class RestHomeAssistantConnectionVerifier implements HomeAssistantConnectionVerifier {
  verify(input: HomeAssistantConnectionTestRequest): Promise<HomeAssistantDiscovery> {
    return discoverHomeAssistant(input);
  }
}

export class HomeAssistantConnectionService implements HomeAssistantConnectionRepository {
  private readonly pending = new Map<string, PendingHomeAssistantTest>();
  private readonly receipts = new Map<string, HomeAssistantConnectionCommandResult>();
  private memoryRow: HomeAssistantConnectionRow | null = null;
  private sequence = 1;

  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly verifier: HomeAssistantConnectionVerifier,
    private readonly options: {
      database?: InstanceType<typeof Database>;
      credentialStore?: HomeAssistantCredentialStore;
      now?: () => Date;
    } = {},
  ) {}

  async get(householdId: string, actorId: string): Promise<HomeAssistantConnectionSettings | null> {
    await this.adminRepository.getOverview(householdId, actorId);
    const row = this.readRow(householdId);
    return row === null ? null : settingsFromRow(row);
  }

  async test(
    householdId: string,
    actorId: string,
    input: HomeAssistantConnectionTestRequest,
  ): Promise<HomeAssistantConnectionTestResult> {
    await this.adminRepository.getOverview(householdId, actorId);
    let discovery: HomeAssistantDiscovery;
    try {
      discovery = await this.verifier.verify(input);
    } catch (error) {
      if (error instanceof HomeAssistantUnavailableError) {
        throw new RepositoryError(
          'INTEGRATION_UNAVAILABLE',
          error.message,
          error.message.includes('could not be reached'),
        );
      }
      throw error;
    }
    assertRequiredOptions(discovery);
    const now = this.now();
    const testId = `home_assistant_test_${randomUUID().replaceAll('-', '_')}`;
    const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
    const options = mapOptionsToOpaqueIds(discovery.options);
    const pending: PendingHomeAssistantTest = {
      householdId,
      testId,
      serverUrl: input.serverUrl,
      accessToken: input.accessToken,
      serverHost: new URL(input.serverUrl).hostname,
      instanceName: discovery.instanceName,
      version: discovery.version,
      options,
      expiresAt,
    };
    this.pending.set(testId, pending);
    return publicTestResult(pending);
  }

  async save(
    householdId: string,
    actorId: string,
    input: SaveHomeAssistantConnectionRequest,
  ): Promise<HomeAssistantConnectionCommandResult> {
    await this.adminRepository.getOverview(householdId, actorId);
    const replay = this.readReceipt(householdId, input.requestId, 'home-assistant.connection.save');
    if (replay !== null) return { ...replay, replayed: true };
    const tested = this.pending.get(input.testId);
    if (
      tested === undefined ||
      tested.householdId !== householdId ||
      Date.parse(tested.expiresAt) <= this.now().getTime()
    ) {
      throw new RepositoryError(
        'CONFLICT',
        'Test the Home Assistant connection again before saving.',
      );
    }

    const occupancy = selectedOption(tested, 'occupancy', input.mappings.occupancyId);
    const televisionPower = selectedOption(
      tested,
      'televisionPower',
      input.mappings.televisionPowerId,
    );
    const hearthForeground = selectedOption(
      tested,
      'hearthForeground',
      input.mappings.hearthForegroundId,
    );
    const protectedMedia = selectedOption(
      tested,
      'protectedMedia',
      input.mappings.protectedMediaId,
    );
    const evening = selectedOption(tested, 'scripts', input.mappings.eveningScriptId);
    const goodnight = selectedOption(tested, 'scripts', input.mappings.goodnightScriptId);
    const screenOff = selectedOption(tested, 'scripts', input.mappings.screenOffScriptId);

    const config: HomeAssistantRuntimeConfig = {
      version: 1,
      provider: 'home-assistant',
      serverUrl: tested.serverUrl,
      accessToken: tested.accessToken,
      stateMappings: {
        occupancy: occupancy.externalId,
        televisionPower: televisionPower.externalId,
        hearthForeground: hearthForeground.externalId,
        protectedMedia: protectedMedia.externalId,
      },
      actionMappings: {
        evening: evening.externalId,
        goodnight: goodnight.externalId,
        screenOff: screenOff.externalId,
      },
    };
    if (this.options.credentialStore !== undefined) {
      try {
        await this.options.credentialStore.save(config);
      } catch {
        throw new RepositoryError(
          'COMMAND_FAILED',
          'Hearth could not store the Home Assistant connection securely.',
          true,
        );
      }
    }

    const occurredAt = this.now().toISOString();
    const stateMappings: StoredHomeAssistantMappings = {
      occupancy: occupancy.displayName,
      televisionPower: televisionPower.displayName,
      hearthForeground: hearthForeground.displayName,
      protectedMedia: protectedMedia.displayName,
    };
    const actionMappings: StoredHomeAssistantActions = {
      evening: evening.displayName,
      goodnight: goodnight.displayName,
      screenOff: screenOff.displayName,
    };
    const row: HomeAssistantConnectionRow = {
      id: opaqueId('home_assistant_setup', householdId),
      label: input.label,
      server_host: tested.serverHost,
      instance_name: tested.instanceName,
      version: tested.version,
      status: 'ready',
      state_mappings_json: JSON.stringify(stateMappings),
      action_mappings_json: JSON.stringify(actionMappings),
      last_checked_at: occurredAt,
      last_success_at: occurredAt,
    };
    const audit = this.audit(
      actorId,
      'home-assistant.connection.save',
      row.id,
      'succeeded',
      occurredAt,
    );
    const result = HomeAssistantConnectionCommandResultSchema.parse({
      connection: settingsFromRow(row),
      audit,
      replayed: false,
    });
    this.commit(() => {
      this.writeAudit(householdId, audit, input.requestId);
      this.persistRow(householdId, row, occurredAt);
      this.writeReceipt(
        householdId,
        input.requestId,
        'home-assistant.connection.save',
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
  ): Promise<HomeAssistantConnectionCommandResult> {
    await this.adminRepository.getOverview(householdId, actorId);
    const replay = this.readReceipt(householdId, requestId, 'home-assistant.connection.remove');
    if (replay !== null) return { ...replay, replayed: true };
    const row = this.readRow(householdId);
    if (row === null) {
      throw new RepositoryError('NOT_FOUND', 'No Home Assistant connection is saved.');
    }
    if (this.options.credentialStore !== undefined) {
      try {
        await this.options.credentialStore.remove();
      } catch {
        throw new RepositoryError(
          'COMMAND_FAILED',
          'Hearth could not remove the stored Home Assistant connection.',
          true,
        );
      }
    }
    const occurredAt = this.now().toISOString();
    const audit = this.audit(
      actorId,
      'home-assistant.connection.remove',
      row.id,
      'reversed',
      occurredAt,
    );
    const result = HomeAssistantConnectionCommandResultSchema.parse({
      connection: null,
      audit,
      replayed: false,
    });
    this.commit(() => {
      this.writeAudit(householdId, audit, requestId);
      if (this.options.database === undefined) this.memoryRow = null;
      else
        this.options.database
          .prepare('DELETE FROM home_assistant_connection_settings WHERE household_id = ?')
          .run(householdId);
      this.writeReceipt(
        householdId,
        requestId,
        'home-assistant.connection.remove',
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
    this.options.database?.prepare('DELETE FROM home_assistant_connection_settings').run();
  }

  close(): void {}

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private commit(operation: () => void): void {
    if (this.options.database === undefined) operation();
    else this.options.database.transaction(operation)();
  }

  private readRow(householdId: string): HomeAssistantConnectionRow | null {
    if (this.options.database === undefined) {
      return this.memoryRow === null ? null : { ...this.memoryRow };
    }
    return (
      (this.options.database
        .prepare(
          `SELECT id, label, server_host, instance_name, version, status, state_mappings_json,
                  action_mappings_json, last_checked_at, last_success_at
           FROM home_assistant_connection_settings WHERE household_id = ?`,
        )
        .get(householdId) as HomeAssistantConnectionRow | undefined) ?? null
    );
  }

  private persistRow(
    householdId: string,
    row: HomeAssistantConnectionRow,
    occurredAt: string,
  ): void {
    if (this.options.database === undefined) {
      this.memoryRow = { ...row };
      return;
    }
    this.options.database
      .prepare(
        `INSERT INTO home_assistant_connection_settings
          (household_id, id, provider_type, label, server_host, instance_name, version, status,
           state_mappings_json, action_mappings_json, last_checked_at, last_success_at,
           last_error_code, created_at, updated_at)
         VALUES (?, ?, 'home-assistant', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
         ON CONFLICT(household_id) DO UPDATE SET
           label = excluded.label, server_host = excluded.server_host,
           instance_name = excluded.instance_name, version = excluded.version,
           status = excluded.status, state_mappings_json = excluded.state_mappings_json,
           action_mappings_json = excluded.action_mappings_json,
           last_checked_at = excluded.last_checked_at,
           last_success_at = excluded.last_success_at, last_error_code = NULL,
           updated_at = excluded.updated_at`,
      )
      .run(
        householdId,
        row.id,
        row.label,
        row.server_host,
        row.instance_name,
        row.version,
        row.status,
        row.state_mappings_json,
        row.action_mappings_json,
        row.last_checked_at,
        row.last_success_at,
        occurredAt,
        occurredAt,
      );
  }

  private readReceipt(
    householdId: string,
    requestId: string,
    commandType: string,
  ): HomeAssistantConnectionCommandResult | null {
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
      : HomeAssistantConnectionCommandResultSchema.parse(JSON.parse(row.response_json) as unknown);
  }

  private writeReceipt(
    householdId: string,
    requestId: string,
    commandType: string,
    result: HomeAssistantConnectionCommandResult,
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
    return {
      id: `audit_home_assistant_${this.sequence++}_${randomUUID().slice(0, 8)}`,
      actorType: 'member',
      actorId,
      source: 'companion',
      action,
      targetId,
      occurredAt,
      result,
    };
  }

  private writeAudit(householdId: string, audit: AuditSummary, requestId: string): void {
    this.options.database
      ?.prepare(
        `INSERT INTO audit_events
          (id, occurred_at, household_id, actor_type, actor_id, source_channel, action_type,
           target_type, target_id, request_id, result, safe_summary_json)
         VALUES (?, ?, ?, 'member', ?, 'companion', ?, 'home_assistant_connection', ?, ?, ?, ?)`,
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

function publicTestResult(pending: PendingHomeAssistantTest): HomeAssistantConnectionTestResult {
  return HomeAssistantConnectionTestResultSchema.parse({
    testId: pending.testId,
    provider: 'home-assistant',
    serverHost: pending.serverHost,
    instanceName: pending.instanceName,
    version: pending.version,
    options: Object.fromEntries(
      Object.entries(pending.options).map(([key, options]) => [
        key,
        options.map(({ id, displayName, kindLabel }) => ({ id, displayName, kindLabel })),
      ]),
    ),
    expiresAt: pending.expiresAt,
  });
}

function settingsFromRow(row: HomeAssistantConnectionRow): HomeAssistantConnectionSettings {
  const stateMappings = JSON.parse(row.state_mappings_json) as StoredHomeAssistantMappings;
  const actionMappings = JSON.parse(row.action_mappings_json) as StoredHomeAssistantActions;
  return HomeAssistantConnectionSettingsSchema.parse({
    id: row.id,
    provider: 'home-assistant',
    label: row.label,
    serverHost: row.server_host,
    instanceName: row.instance_name,
    version: row.version,
    status: row.status,
    stateMappings,
    actionMappings,
    lastCheckedAt: row.last_checked_at,
    lastSuccessfulAt: row.last_success_at,
    message: '4 safety states · 3 approved actions',
  });
}

function mapOptionsToOpaqueIds(
  options: HomeAssistantDiscovery['options'],
): PendingHomeAssistantTest['options'] {
  return {
    occupancy: opaqueOptions('occupancy', options.occupancy),
    televisionPower: opaqueOptions('television_power', options.televisionPower),
    hearthForeground: opaqueOptions('hearth_foreground', options.hearthForeground),
    protectedMedia: opaqueOptions('protected_media', options.protectedMedia),
    scripts: opaqueOptions('script', options.scripts),
  };
}

function opaqueOptions(
  group: string,
  options: HomeAssistantDiscoveryCandidate[],
): PendingHomeAssistantOption[] {
  return options.map((option) => ({
    ...option,
    id: opaqueId(`home_assistant_${group}`, option.externalId),
  }));
}

function selectedOption(
  tested: PendingHomeAssistantTest,
  group: HomeAssistantOptionGroup,
  optionId: string,
): PendingHomeAssistantOption {
  const option = tested.options[group].find((candidate) => candidate.id === optionId);
  if (option === undefined) {
    throw new RepositoryError(
      'VALIDATION_ERROR',
      'Choose a Home Assistant item from the tested connection.',
    );
  }
  return option;
}

function assertRequiredOptions(discovery: HomeAssistantDiscovery): void {
  const missing = Object.entries(discovery.options)
    .filter(([, options]) => options.length === 0)
    .map(([group]) => group);
  if (missing.length > 0) {
    throw new RepositoryError(
      'INTEGRATION_UNAVAILABLE',
      'Home Assistant connected, but Hearth could not find every required state and script.',
    );
  }
}

function candidate(
  externalId: string,
  displayName: string,
  kindLabel: string,
): HomeAssistantDiscoveryCandidate {
  return { externalId, displayName, kindLabel };
}

function opaqueId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 20)}`;
}
