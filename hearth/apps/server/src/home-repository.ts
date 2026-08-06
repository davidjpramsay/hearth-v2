import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import { evaluateAutomaticScreenOff } from '@hearth/core';
import {
  HomeActionResultSchema,
  HomeStatusSchema,
  type AuditSummary,
  type DemoScenario,
  type ExecuteHomeActionRequest,
  type HomeAction,
  type HomeActionId,
  type HomeActionResult,
  type HomeStatus,
} from '@hearth/shared';

import { DEMO_HOUSEHOLD_ID, DEMO_NOW } from './demo/seed.js';
import {
  FakeHomeAssistantProvider,
  HomeAssistantUnavailableError,
  type AllowedHomeAssistantScript,
  type HomeAssistantProvider,
  type HomeAssistantSnapshot,
} from './integrations/home-assistant-provider.js';
import { RepositoryError, type CommandActor } from './repository.js';

interface HomeActionDefinition {
  id: HomeActionId;
  label: string;
  description: string;
  icon: HomeAction['icon'];
  confirmation: HomeAction['confirmation'];
  script: AllowedHomeAssistantScript;
  successMessage: string;
}

const ACTIONS: readonly HomeActionDefinition[] = [
  {
    id: 'evening-mode',
    label: 'Evening',
    description: 'Warm lights for the evening',
    icon: 'sun',
    confirmation: 'none',
    script: 'script.hearth_evening',
    successMessage: 'Evening is ready.',
  },
  {
    id: 'goodnight',
    label: 'Goodnight',
    description: 'Settle the house for bedtime',
    icon: 'moon',
    confirmation: 'explicit',
    script: 'script.hearth_goodnight',
    successMessage: 'Goodnight is ready.',
  },
  {
    id: 'screen-off',
    label: 'Screen off',
    description: 'Turn off the television',
    icon: 'power',
    confirmation: 'none',
    script: 'script.hearth_screen_off',
    successMessage: 'The television is turning off.',
  },
] as const;

const INITIAL_SNAPSHOT: HomeAssistantSnapshot = {
  occupied: true,
  televisionPower: 'on',
  hearthForeground: true,
  protectedMediaActive: false,
  observedAt: DEMO_NOW,
};

export interface HomeRepository {
  getStatus(householdId: string): Promise<HomeStatus>;
  executeAction(
    householdId: string,
    actionId: HomeActionId,
    input: ExecuteHomeActionRequest,
    actor: CommandActor,
  ): Promise<HomeActionResult>;
  reset(): void;
  setScenario(scenario: DemoScenario): void;
}

export class HomeService implements HomeRepository {
  private scenario: DemoScenario = 'healthy';
  private lastGoodSnapshot = structuredClone(INITIAL_SNAPSHOT);
  private readonly memoryReceipts = new Map<string, HomeActionResult>();

  constructor(
    private readonly provider: HomeAssistantProvider = new FakeHomeAssistantProvider(),
    private readonly database?: InstanceType<typeof Database>,
  ) {
    const cached = this.readCachedSnapshot();
    if (cached !== null) this.lastGoodSnapshot = cached;
    else this.writeCachedSnapshot(this.lastGoodSnapshot);
  }

  async getStatus(householdId: string): Promise<HomeStatus> {
    this.assertHousehold(householdId);
    await this.applyLatency();
    if (!this.provider.configured) {
      return this.statusFromSnapshot(this.lastGoodSnapshot, 'not-configured');
    }
    if (this.scenario === 'unavailable') {
      return this.statusFromSnapshot(this.lastGoodSnapshot, 'unavailable');
    }
    try {
      const providerSnapshot = await this.provider.readHouseholdState();
      const snapshot =
        this.scenario === 'protected-media'
          ? { ...providerSnapshot, protectedMediaActive: true }
          : providerSnapshot;
      this.lastGoodSnapshot = structuredClone(snapshot);
      this.writeCachedSnapshot(snapshot);
      return this.statusFromSnapshot(snapshot, 'healthy');
    } catch (error) {
      if (error instanceof HomeAssistantUnavailableError) {
        return this.statusFromSnapshot(this.lastGoodSnapshot, 'unavailable');
      }
      throw error;
    }
  }

  async executeAction(
    householdId: string,
    actionId: HomeActionId,
    input: ExecuteHomeActionRequest,
    actor: CommandActor,
  ): Promise<HomeActionResult> {
    this.assertHousehold(householdId);
    const definition = ACTIONS.find((candidate) => candidate.id === actionId);
    if (definition === undefined) {
      throw new RepositoryError('NOT_FOUND', 'That home action is not available.');
    }
    const commandType = `home-action:${actionId}`;
    const receipt = this.readReceipt(householdId, input.requestId, commandType);
    if (receipt !== null) return { ...receipt, replayed: true };
    this.authorize(householdId, actor);
    if (definition.confirmation === 'explicit' && !input.confirmed) {
      this.writeRejectedAudit(
        householdId,
        definition.id,
        input.requestId,
        actor,
        'CONFIRMATION_REQUIRED',
      );
      throw new RepositoryError(
        'CONFIRMATION_REQUIRED',
        `${definition.label} needs a clear confirmation.`,
      );
    }
    if (this.scenario === 'fail-next') {
      this.scenario = 'healthy';
      this.writeFailedAudit(householdId, definition.id, input.requestId, actor, 'COMMAND_FAILED');
      throw new RepositoryError('COMMAND_FAILED', 'That home action didn’t run. Try again.', true);
    }
    if (!this.provider.configured || this.scenario === 'unavailable') {
      this.writeFailedAudit(
        householdId,
        definition.id,
        input.requestId,
        actor,
        'INTEGRATION_UNAVAILABLE',
      );
      throw new RepositoryError(
        'INTEGRATION_UNAVAILABLE',
        'Home Assistant is unavailable. Your other Hearth plans still work.',
        true,
      );
    }
    const status = await this.getStatus(householdId);
    if (definition.id === 'screen-off' && status.protectedMediaActive) {
      this.writeRejectedAudit(
        householdId,
        definition.id,
        input.requestId,
        actor,
        'PROTECTED_MEDIA',
      );
      throw new RepositoryError(
        'CONFLICT',
        'The television is staying on while protected playback is active.',
      );
    }
    try {
      await this.provider.runScript(definition.script);
    } catch (error) {
      if (error instanceof HomeAssistantUnavailableError) {
        this.writeFailedAudit(
          householdId,
          definition.id,
          input.requestId,
          actor,
          'INTEGRATION_UNAVAILABLE',
        );
        throw new RepositoryError(
          'INTEGRATION_UNAVAILABLE',
          'Home Assistant is unavailable. Your other Hearth plans still work.',
          true,
        );
      }
      throw error;
    }

    const executedAt = new Date().toISOString();
    const audit: AuditSummary = {
      id: id('audit_home'),
      actorType: actor.type,
      actorId: actor.id,
      source: actor.source,
      action: 'home.action.execute',
      targetId: definition.id,
      occurredAt: executedAt,
      result: 'succeeded',
    };
    const response = HomeActionResultSchema.parse({
      actionId: definition.id,
      label: definition.label,
      message: definition.successMessage,
      executedAt,
      audit,
      replayed: false,
    });
    this.writeAudit(householdId, audit, input.requestId, '{}');
    this.writeReceipt(householdId, input.requestId, commandType, response, executedAt);
    return response;
  }

  reset(): void {
    this.scenario = 'healthy';
    this.lastGoodSnapshot = structuredClone(INITIAL_SNAPSHOT);
    this.memoryReceipts.clear();
    this.provider.reset?.();
    if (this.database !== undefined && this.database.open) {
      this.database
        .prepare("DELETE FROM command_receipts WHERE command_type LIKE 'home-action:%'")
        .run();
      this.database.prepare('DELETE FROM home_state_cache').run();
      this.writeCachedSnapshot(this.lastGoodSnapshot);
    }
  }

  setScenario(scenario: DemoScenario): void {
    this.scenario = scenario;
  }

  private statusFromSnapshot(
    snapshot: HomeAssistantSnapshot,
    state: 'healthy' | 'unavailable' | 'not-configured',
  ): HomeStatus {
    const available = state === 'healthy';
    const protectedMediaActive = snapshot.protectedMediaActive;
    const automaticScreenOff = evaluateAutomaticScreenOff({
      hearthForeground: snapshot.hearthForeground,
      occupied: snapshot.occupied,
      protectedMediaActive,
    });
    const unavailableMessage =
      state === 'not-configured'
        ? 'Home controls are not connected yet.'
        : 'Home Assistant is unavailable · Showing the last known room state.';
    return HomeStatusSchema.parse({
      householdId: DEMO_HOUSEHOLD_ID,
      roomLabel: 'Living room',
      generatedAt: snapshot.observedAt,
      freshness: available ? 'current' : 'stale',
      statusMessage: available ? null : unavailableMessage,
      integration: {
        kind: 'home-assistant',
        status: state,
        lastSuccessfulAt:
          state === 'not-configured'
            ? null
            : available
              ? snapshot.observedAt
              : this.lastGoodSnapshot.observedAt,
        message:
          state === 'healthy'
            ? 'Connected locally through the demo Home Assistant adapter.'
            : unavailableMessage,
      },
      occupancy: state === 'not-configured' ? 'unknown' : snapshot.occupied ? 'occupied' : 'clear',
      televisionPower: state === 'not-configured' ? 'unknown' : snapshot.televisionPower,
      protectedMediaActive: state === 'not-configured' ? false : protectedMediaActive,
      powerProtectionLabel:
        state === 'not-configured'
          ? 'Power state unavailable'
          : protectedMediaActive
            ? 'Playback is protected'
            : 'Power protection clear',
      automaticScreenOff:
        state === 'not-configured'
          ? { automaticScreenOffAllowed: false, reason: 'state-unavailable' }
          : automaticScreenOff,
      actions: ACTIONS.map((action) => {
        const blockedByPlayback = action.id === 'screen-off' && protectedMediaActive;
        return {
          id: action.id,
          label: action.label,
          description: action.description,
          icon: action.icon,
          confirmation: action.confirmation,
          enabled: available && !blockedByPlayback,
          unavailableReason: !available
            ? unavailableMessage
            : blockedByPlayback
              ? 'Protected native playback is active.'
              : null,
        };
      }),
    });
  }

  private authorize(householdId: string, actor: CommandActor): void {
    if (actor.type === 'service') {
      if (actor.id === 'service_home_assistant' && ['automation', 'voice'].includes(actor.source)) {
        return;
      }
      throw new RepositoryError('FORBIDDEN', 'That automation cannot control this home action.');
    }
    if (this.database === undefined) {
      if (
        actor.type === 'device' &&
        actor.id === 'device_living_room_tv' &&
        actor.source === 'tv'
      ) {
        return;
      }
      if (actor.type === 'member' && actor.id === 'member_maya' && actor.source === 'companion') {
        return;
      }
      if (actor.type === 'member')
        throw new RepositoryError('FORBIDDEN', 'Ask an adult to do that.');
      throw new RepositoryError('UNAUTHENTICATED', 'This device is not paired with Hearth.');
    }
    if (actor.type === 'device') {
      if (actor.source !== 'tv') {
        throw new RepositoryError('UNAUTHENTICATED', 'This device is not paired for home control.');
      }
      const row = this.database
        .prepare(
          `SELECT scopes_json FROM paired_devices
           WHERE id = ? AND household_id = ? AND revoked_at IS NULL`,
        )
        .get(actor.id, householdId) as { scopes_json: string } | undefined;
      if (row !== undefined && (JSON.parse(row.scopes_json) as string[]).includes('home.control')) {
        return;
      }
      throw new RepositoryError('UNAUTHENTICATED', 'This device is not paired for home control.');
    }
    const row = this.database
      .prepare(
        `SELECT role, capabilities_json FROM members
         WHERE id = ? AND household_id = ? AND archived_at IS NULL`,
      )
      .get(actor.id, householdId) as
      { role: 'adult' | 'child'; capabilities_json: string } | undefined;
    if (row === undefined) throw new RepositoryError('UNAUTHENTICATED', 'Sign in to continue.');
    const capabilities = JSON.parse(row.capabilities_json) as string[];
    if (
      actor.source !== 'companion' ||
      row.role !== 'adult' ||
      !capabilities.includes('home.control')
    ) {
      throw new RepositoryError('FORBIDDEN', 'Ask an adult to do that.');
    }
  }

  private assertHousehold(householdId: string): void {
    if (householdId !== DEMO_HOUSEHOLD_ID) {
      throw new RepositoryError('NOT_FOUND', 'That household could not be found.');
    }
  }

  private async applyLatency(): Promise<void> {
    if (this.scenario === 'loading') {
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
  }

  private readCachedSnapshot(): HomeAssistantSnapshot | null {
    if (this.database === undefined || !this.database.open) return null;
    const row = this.database
      .prepare('SELECT * FROM home_state_cache WHERE household_id = ?')
      .get(DEMO_HOUSEHOLD_ID) as HomeStateCacheRow | undefined;
    if (row === undefined) return null;
    return {
      occupied: row.occupied === 1,
      televisionPower: row.television_power,
      hearthForeground: row.hearth_foreground === 1,
      protectedMediaActive: row.protected_media_active === 1,
      observedAt: row.observed_at,
    };
  }

  private writeCachedSnapshot(snapshot: HomeAssistantSnapshot): void {
    if (this.database === undefined || !this.database.open) return;
    this.database
      .prepare(
        `INSERT INTO home_state_cache
          (household_id, occupied, television_power, hearth_foreground,
           protected_media_active, observed_at, cached_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(household_id) DO UPDATE SET
           occupied = excluded.occupied,
           television_power = excluded.television_power,
           hearth_foreground = excluded.hearth_foreground,
           protected_media_active = excluded.protected_media_active,
           observed_at = excluded.observed_at,
           cached_at = excluded.cached_at`,
      )
      .run(
        DEMO_HOUSEHOLD_ID,
        snapshot.occupied ? 1 : 0,
        snapshot.televisionPower,
        snapshot.hearthForeground ? 1 : 0,
        snapshot.protectedMediaActive ? 1 : 0,
        snapshot.observedAt,
        new Date().toISOString(),
      );
  }

  private readReceipt(
    householdId: string,
    requestId: string,
    commandType: string,
  ): HomeActionResult | null {
    if (this.database === undefined) {
      return this.memoryReceipts.get(`${householdId}:${requestId}:${commandType}`) ?? null;
    }
    const row = this.database
      .prepare(
        `SELECT response_json FROM command_receipts
         WHERE household_id = ? AND request_id = ? AND command_type = ?`,
      )
      .get(householdId, requestId, commandType) as { response_json: string } | undefined;
    return row === undefined
      ? null
      : HomeActionResultSchema.parse(JSON.parse(row.response_json) as unknown);
  }

  private writeReceipt(
    householdId: string,
    requestId: string,
    commandType: string,
    response: HomeActionResult,
    createdAt: string,
  ): void {
    if (this.database === undefined) {
      this.memoryReceipts.set(`${householdId}:${requestId}:${commandType}`, response);
      return;
    }
    this.database
      .prepare(
        `INSERT INTO command_receipts
          (household_id, request_id, command_type, response_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(householdId, requestId, commandType, JSON.stringify(response), createdAt);
  }

  private writeAudit(
    householdId: string,
    audit: AuditSummary,
    requestId: string,
    safeSummaryJson: string,
  ): void {
    if (this.database === undefined) return;
    this.database
      .prepare(
        `INSERT INTO audit_events
          (id, occurred_at, household_id, actor_type, actor_id, source_channel, action_type,
           target_type, target_id, request_id, result, safe_summary_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'home_action', ?, ?, ?, ?)`,
      )
      .run(
        audit.id,
        audit.occurredAt,
        householdId,
        audit.actorType,
        audit.actorId,
        audit.source,
        audit.action,
        audit.targetId,
        requestId,
        audit.result,
        safeSummaryJson,
      );
  }

  private writeRejectedAudit(
    householdId: string,
    actionId: HomeActionId,
    requestId: string,
    actor: CommandActor,
    code: string,
  ): void {
    this.writeAudit(
      householdId,
      {
        id: id('audit_home_rejected'),
        actorType: actor.type,
        actorId: actor.id,
        source: actor.source,
        action: 'home.action.execute',
        targetId: actionId,
        occurredAt: new Date().toISOString(),
        result: 'rejected',
      },
      requestId,
      JSON.stringify({ code }),
    );
  }

  private writeFailedAudit(
    householdId: string,
    actionId: HomeActionId,
    requestId: string,
    actor: CommandActor,
    code: string,
  ): void {
    this.writeAudit(
      householdId,
      {
        id: id('audit_home_failed'),
        actorType: actor.type,
        actorId: actor.id,
        source: actor.source,
        action: 'home.action.execute',
        targetId: actionId,
        occurredAt: new Date().toISOString(),
        result: 'failed',
      },
      requestId,
      JSON.stringify({ code }),
    );
  }
}

interface HomeStateCacheRow {
  occupied: 0 | 1;
  television_power: 'on' | 'standby';
  hearth_foreground: 0 | 1;
  protected_media_active: 0 | 1;
  observed_at: string;
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '_')}`;
}
