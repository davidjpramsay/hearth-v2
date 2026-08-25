import { createHash, randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import {
  REMINDER_CONTRACT_VERSION,
  ReminderOverviewSchema,
  ReminderSnapshotReceiptSchema,
  ReminderSourceCommandResultSchema,
  ReminderSourceDeviceSessionSchema,
  ReminderSourcePairingRequestSchema,
  ReminderSourceSettingsSchema,
  ReplaceReminderSnapshotRequestSchema,
  type ApproveReminderSourcePairingRequest,
  type CreateReminderSourcePairingRequest,
  type HearthReminder,
  type HearthReminderList,
  type ReminderOverview,
  type ReminderSnapshotReceipt,
  type ReminderSourceCommandResult,
  type ReminderSourceDeviceSession,
  type ReminderSourcePairingRequest,
  type ReminderSourceSettings,
  type ReminderSourceSummary,
  type ReplaceReminderSnapshotRequest,
} from '@hearth/shared';

import { type AdminRepository } from './admin-repository.js';
import { RepositoryError } from './repository.js';
import { SystemClock, type HearthClock } from './runtime-context.js';

const PAIRING_LIFETIME_MS = 10 * 60_000;
const CURRENT_SNAPSHOT_MAX_AGE_MS = 15 * 60_000;
const MAX_GENERATED_AT_FUTURE_SKEW_MS = 5 * 60_000;
const SOURCE_SCOPE = 'reminders.snapshot.write' as const;

interface MemoryPairing {
  id: string;
  requestId: string;
  code: string;
  deviceName: string;
  applicationVersion: string;
  credentialHash: string;
  status: 'pending' | 'approved' | 'exchanged' | 'expired' | 'cancelled';
  expiresAt: string;
  approvedHouseholdId: string | null;
  approvedByMemberId: string | null;
  approvalRequestId: string | null;
  approvedDeviceId: string | null;
  approvedSourceId: string | null;
  createdAt: string;
  updatedAt: string;
  exchangedAt: string | null;
}

interface MemorySource {
  id: string;
  householdId: string;
  displayName: string;
  createdAt: string;
  revokedAt: string | null;
  revokedRequestId: string | null;
  lastSnapshotSequence: number;
  lastSnapshotId: string | null;
  lastSnapshotGeneratedAt: string | null;
  lastSnapshotReceivedAt: string | null;
}

interface MemoryDevice {
  id: string;
  sourceId: string;
  householdId: string;
  name: string;
  applicationVersion: string;
  credentialHash: string;
  approvedByMemberId: string;
  pairedAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

interface MemoryList {
  id: string;
  externalIdHash: string;
  title: string;
  removedAt: string | null;
}

interface MemoryReminder {
  id: string;
  listId: string;
  externalIdHash: string;
  title: string;
  dueLocalDate: string | null;
  dueAt: string | null;
  hasDueTime: boolean;
  isCompleted: boolean;
  completedAt: string | null;
  sourceUpdatedAt: string | null;
  removedAt: string | null;
}

interface MemoryReceipt {
  sourceId: string;
  snapshotId: string;
  requestId: string;
  sequence: number;
  payloadHash: string;
  response: ReminderSnapshotReceipt;
}

interface PairingRow {
  id: string;
  request_id: string;
  code: string;
  device_name: string;
  application_version: string;
  credential_hash: string;
  status: MemoryPairing['status'];
  expires_at: string;
  approved_household_id: string | null;
  approved_by_member_id: string | null;
  approval_request_id: string | null;
  approved_device_id: string | null;
  approved_source_id: string | null;
  created_at: string;
  updated_at: string;
  exchanged_at: string | null;
}

interface SourceRow {
  id: string;
  household_id: string;
  display_name: string;
  created_at: string;
  revoked_at: string | null;
  revoked_request_id: string | null;
  last_snapshot_sequence: number;
  last_snapshot_id: string | null;
  last_snapshot_generated_at: string | null;
  last_snapshot_received_at: string | null;
}

interface DeviceRow {
  id: string;
  source_id: string;
  household_id: string;
  name: string;
  application_version: string;
  credential_hash: string;
  approved_by_member_id: string;
  paired_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

interface ReceiptRow {
  source_id: string;
  snapshot_id: string;
  request_id: string;
  sequence: number;
  payload_hash: string;
  response_json: string;
}

export interface ReminderSourceRepository {
  createPairing(input: CreateReminderSourcePairingRequest): Promise<ReminderSourcePairingRequest>;
  getPairing(pairingId: string): Promise<ReminderSourcePairingRequest>;
  approvePairing(
    householdId: string,
    actorId: string,
    input: ApproveReminderSourcePairingRequest,
  ): Promise<ReminderSourcePairingRequest>;
  exchangePairing(
    pairingId: string,
    pairingSecret: string,
    requestId: string,
  ): Promise<ReminderSourceDeviceSession>;
  getDeviceSession(pairingSecret: string): ReminderSourceDeviceSession;
  getSettings(householdId: string, actorId: string): Promise<ReminderSourceSettings>;
  revokeDevice(
    householdId: string,
    deviceId: string,
    actorId: string,
    requestId: string,
  ): Promise<ReminderSourceCommandResult>;
  replaceSnapshot(
    sourceId: string,
    pairingSecret: string,
    input: ReplaceReminderSnapshotRequest,
  ): Promise<ReminderSnapshotReceipt>;
  getOverview(householdId: string, includeCompleted: boolean): Promise<ReminderOverview>;
  reset(): void;
  close(): void;
}

export class ReminderSourceService implements ReminderSourceRepository {
  private readonly clock: HearthClock;
  private readonly pairings = new Map<string, MemoryPairing>();
  private readonly sources = new Map<string, MemorySource>();
  private readonly devices = new Map<string, MemoryDevice>();
  private readonly lists = new Map<string, Map<string, MemoryList>>();
  private readonly reminders = new Map<string, Map<string, MemoryReminder>>();
  private readonly receipts = new Map<string, MemoryReceipt>();

  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly database?: InstanceType<typeof Database>,
    options: { clock?: HearthClock } = {},
  ) {
    this.clock = options.clock ?? new SystemClock();
  }

  async createPairing(
    input: CreateReminderSourcePairingRequest,
  ): Promise<ReminderSourcePairingRequest> {
    const parsed = input;
    const digest = hashSecret(parsed.pairingSecret);
    const existing = this.findPairingByRequestId(parsed.requestId);
    if (existing !== null) {
      if (
        existing.deviceName !== parsed.deviceName ||
        existing.applicationVersion !== parsed.applicationVersion ||
        existing.credentialHash !== digest
      ) {
        throw new RepositoryError(
          'CONFLICT',
          'That pairing request identifier was already used for different details.',
        );
      }
      return this.publicPairing(this.expireIfNeeded(existing));
    }

    const now = this.clock.now();
    const pairing: MemoryPairing = {
      id: opaqueId('reminder_pairing'),
      requestId: parsed.requestId,
      code: this.nextPairingCode(),
      deviceName: parsed.deviceName,
      applicationVersion: parsed.applicationVersion,
      credentialHash: digest,
      status: 'pending',
      expiresAt: new Date(now.getTime() + PAIRING_LIFETIME_MS).toISOString(),
      approvedHouseholdId: null,
      approvedByMemberId: null,
      approvalRequestId: null,
      approvedDeviceId: null,
      approvedSourceId: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      exchangedAt: null,
    };
    this.insertPairing(pairing);
    return this.publicPairing(pairing);
  }

  async getPairing(pairingId: string): Promise<ReminderSourcePairingRequest> {
    const pairing = this.findPairingById(pairingId);
    if (pairing === null)
      throw new RepositoryError('NOT_FOUND', 'That pairing request was not found.');
    return this.publicPairing(this.expireIfNeeded(pairing));
  }

  async approvePairing(
    householdId: string,
    actorId: string,
    input: ApproveReminderSourcePairingRequest,
  ): Promise<ReminderSourcePairingRequest> {
    await this.adminRepository.getOverview(householdId, actorId);
    const pairing = this.findPairingByCode(input.code);
    if (pairing === null)
      throw new RepositoryError('NOT_FOUND', 'That pairing code was not found.');
    const current = this.expireIfNeeded(pairing);
    if (current.status === 'expired') {
      throw new RepositoryError('CONFLICT', 'That pairing code has expired. Start pairing again.');
    }
    if (current.status === 'cancelled') {
      throw new RepositoryError('CONFLICT', 'That pairing request is no longer available.');
    }
    if (current.status === 'approved' || current.status === 'exchanged') {
      if (current.approvedHouseholdId !== householdId) {
        throw new RepositoryError('CONFLICT', 'That pairing code belongs to another Hearth home.');
      }
      return this.publicPairing(current);
    }
    if (this.findActiveSourceForHousehold(householdId) !== null) {
      throw new RepositoryError(
        'CONFLICT',
        'This Hearth already has an active Apple Reminders source. Revoke it before pairing another.',
      );
    }
    const updated: MemoryPairing = {
      ...current,
      status: 'approved',
      approvedHouseholdId: householdId,
      approvedByMemberId: actorId,
      approvalRequestId: input.requestId,
      updatedAt: this.clock.now().toISOString(),
    };
    this.updatePairing(updated);
    return this.publicPairing(updated);
  }

  async exchangePairing(
    pairingId: string,
    pairingSecret: string,
    requestId: string,
  ): Promise<ReminderSourceDeviceSession> {
    const found = this.findPairingById(pairingId);
    if (found === null)
      throw new RepositoryError('NOT_FOUND', 'That pairing request was not found.');
    const pairing = this.expireIfNeeded(found);
    if (pairing.credentialHash !== hashSecret(pairingSecret)) {
      throw new RepositoryError('UNAUTHENTICATED', 'That pairing secret is not valid.');
    }
    if (pairing.status === 'expired') {
      throw new RepositoryError(
        'CONFLICT',
        'That pairing request has expired. Start pairing again.',
      );
    }
    if (pairing.status === 'exchanged') {
      if (pairing.approvedDeviceId === null || pairing.approvedSourceId === null) {
        throw new RepositoryError('COMMAND_FAILED', 'The paired Reminders source is incomplete.');
      }
      return this.sessionForIds(pairing.approvedDeviceId, pairing.approvedSourceId);
    }
    if (
      pairing.status !== 'approved' ||
      pairing.approvedHouseholdId === null ||
      pairing.approvedByMemberId === null
    ) {
      throw new RepositoryError('CONFLICT', 'Approve this pairing code in Hearth first.');
    }
    if (this.findActiveSourceForHousehold(pairing.approvedHouseholdId) !== null) {
      throw new RepositoryError(
        'CONFLICT',
        'This Hearth already has an active Apple Reminders source.',
      );
    }

    const now = this.clock.now().toISOString();
    const source: MemorySource = {
      id: opaqueId('reminder_source'),
      householdId: pairing.approvedHouseholdId,
      displayName: 'Apple Reminders',
      createdAt: now,
      revokedAt: null,
      revokedRequestId: null,
      lastSnapshotSequence: 0,
      lastSnapshotId: null,
      lastSnapshotGeneratedAt: null,
      lastSnapshotReceivedAt: null,
    };
    const device: MemoryDevice = {
      id: opaqueId('reminder_device'),
      sourceId: source.id,
      householdId: source.householdId,
      name: pairing.deviceName,
      applicationVersion: pairing.applicationVersion,
      credentialHash: pairing.credentialHash,
      approvedByMemberId: pairing.approvedByMemberId,
      pairedAt: now,
      lastSeenAt: now,
      revokedAt: null,
    };
    const exchanged: MemoryPairing = {
      ...pairing,
      status: 'exchanged',
      approvedDeviceId: device.id,
      approvedSourceId: source.id,
      updatedAt: now,
      exchangedAt: now,
    };

    const write = () => {
      this.insertSource(source);
      this.insertDevice(device);
      this.updatePairing(exchanged);
      this.adminRepository.recordActivity(
        source.householdId,
        {
          id: opaqueId('audit_reminder_pair'),
          actorType: 'member',
          actorId: device.approvedByMemberId,
          source: 'companion',
          action: 'reminder-source.pair',
          targetId: source.id,
          occurredAt: now,
          result: 'succeeded',
        },
        requestId,
      );
    };
    this.inTransaction(write);
    return this.session(device, source);
  }

  getDeviceSession(pairingSecret: string): ReminderSourceDeviceSession {
    const digest = hashSecret(pairingSecret);
    const device = this.findDeviceByCredentialHash(digest);
    if (device === null || device.revokedAt !== null) {
      throw new RepositoryError(
        'UNAUTHENTICATED',
        'This Reminders source is not paired with Hearth.',
      );
    }
    const source = this.findSourceById(device.sourceId);
    if (source === null || source.revokedAt !== null) {
      throw new RepositoryError('UNAUTHENTICATED', 'This Reminders source has been revoked.');
    }
    const seen = { ...device, lastSeenAt: this.clock.now().toISOString() };
    this.updateDevice(seen);
    return this.session(seen, source);
  }

  async getSettings(householdId: string, actorId: string): Promise<ReminderSourceSettings> {
    await this.adminRepository.getOverview(householdId, actorId);
    return ReminderSourceSettingsSchema.parse({
      householdId,
      sources: this.findSourcesForHousehold(householdId)
        .slice(0, 10)
        .map((source) => this.sourceSummary(source)),
    });
  }

  async revokeDevice(
    householdId: string,
    deviceId: string,
    actorId: string,
    requestId: string,
  ): Promise<ReminderSourceCommandResult> {
    await this.adminRepository.getOverview(householdId, actorId);
    const device = this.findDeviceById(deviceId);
    if (device === null || device.householdId !== householdId) {
      throw new RepositoryError('NOT_FOUND', 'That Reminders device was not found.');
    }
    const source = this.findSourceById(device.sourceId);
    if (source === null)
      throw new RepositoryError('NOT_FOUND', 'That Reminders source was not found.');
    if (source.revokedAt !== null) {
      if (source.revokedRequestId !== requestId) {
        throw new RepositoryError('CONFLICT', 'That Reminders source is already revoked.');
      }
      return ReminderSourceCommandResultSchema.parse({
        source: this.sourceSummary(source),
        replayed: true,
      });
    }

    const now = this.clock.now().toISOString();
    const revokedSource = { ...source, revokedAt: now, revokedRequestId: requestId };
    const revokedDevice = { ...device, revokedAt: now };
    const write = () => {
      this.updateSource(revokedSource);
      this.updateDevice(revokedDevice);
      this.adminRepository.recordActivity(
        householdId,
        {
          id: opaqueId('audit_reminder_revoke'),
          actorType: 'member',
          actorId,
          source: 'companion',
          action: 'reminder-source.revoke',
          targetId: source.id,
          occurredAt: now,
          result: 'reversed',
        },
        requestId,
      );
    };
    this.inTransaction(write);
    return ReminderSourceCommandResultSchema.parse({
      source: this.sourceSummary(revokedSource),
      replayed: false,
    });
  }

  async replaceSnapshot(
    sourceId: string,
    pairingSecret: string,
    input: ReplaceReminderSnapshotRequest,
  ): Promise<ReminderSnapshotReceipt> {
    const snapshot = ReplaceReminderSnapshotRequestSchema.parse(input);
    const device = this.findDeviceByCredentialHash(hashSecret(pairingSecret));
    if (device === null || device.revokedAt !== null) {
      throw new RepositoryError(
        'UNAUTHENTICATED',
        'This Reminders source is not paired with Hearth.',
      );
    }
    if (device.sourceId !== sourceId) {
      throw new RepositoryError('FORBIDDEN', 'This device cannot update that Reminders source.');
    }
    const source = this.findSourceById(sourceId);
    if (source === null || source.revokedAt !== null) {
      throw new RepositoryError('UNAUTHENTICATED', 'This Reminders source has been revoked.');
    }
    const generatedAt = new Date(snapshot.generatedAt);
    if (generatedAt.getTime() > this.clock.now().getTime() + MAX_GENERATED_AT_FUTURE_SKEW_MS) {
      throw new RepositoryError(
        'VALIDATION_ERROR',
        'The snapshot timestamp is too far in the future.',
      );
    }

    const payloadHash = canonicalSnapshotHash(snapshot);
    const collision = this.findReceiptCollision(sourceId, snapshot);
    if (collision !== null) {
      if (
        collision.snapshotId !== snapshot.snapshotId ||
        collision.requestId !== snapshot.requestId ||
        collision.sequence !== snapshot.sequence ||
        collision.payloadHash !== payloadHash
      ) {
        throw new RepositoryError(
          'CONFLICT',
          'A snapshot, request or sequence identifier was reused for different content.',
        );
      }
      return ReminderSnapshotReceiptSchema.parse({ ...collision.response, replayed: true });
    }
    if (snapshot.sequence <= source.lastSnapshotSequence) {
      throw new RepositoryError(
        'STALE_SNAPSHOT',
        `Snapshot sequence ${snapshot.sequence} is stale. Continue from ${source.lastSnapshotSequence + 1}.`,
      );
    }

    const acceptedAt = this.clock.now().toISOString();
    const receipt = ReminderSnapshotReceiptSchema.parse({
      contractVersion: REMINDER_CONTRACT_VERSION,
      sourceId,
      snapshotId: snapshot.snapshotId,
      sequence: snapshot.sequence,
      generatedAt: snapshot.generatedAt,
      acceptedAt,
      listCount: snapshot.lists.length,
      reminderCount: snapshot.reminders.length,
      incompleteCount: snapshot.reminders.filter((reminder) => !reminder.isCompleted).length,
      nextSnapshotSequence: snapshot.sequence + 1,
      replayed: false,
    });
    const updatedSource: MemorySource = {
      ...source,
      lastSnapshotSequence: snapshot.sequence,
      lastSnapshotId: snapshot.snapshotId,
      lastSnapshotGeneratedAt: snapshot.generatedAt,
      lastSnapshotReceivedAt: acceptedAt,
    };
    const seenDevice = { ...device, lastSeenAt: acceptedAt };
    const write = () => {
      this.replaceProjection(sourceId, snapshot, acceptedAt);
      this.updateSource(updatedSource);
      this.updateDevice(seenDevice);
      this.insertReceipt({
        sourceId,
        snapshotId: snapshot.snapshotId,
        requestId: snapshot.requestId,
        sequence: snapshot.sequence,
        payloadHash,
        response: receipt,
      });
      this.adminRepository.recordActivity(
        source.householdId,
        {
          id: opaqueId('audit_reminder_snapshot'),
          actorType: 'device',
          actorId: device.id,
          source: 'sync',
          action: 'reminders.snapshot.replace',
          targetId: source.id,
          occurredAt: acceptedAt,
          result: 'succeeded',
        },
        snapshot.requestId,
      );
    };
    this.inTransaction(write);
    return receipt;
  }

  async getOverview(householdId: string, includeCompleted: boolean): Promise<ReminderOverview> {
    await this.adminRepository.getHousehold(householdId);
    const source = this.findActiveSourceForHousehold(householdId);
    if (source === null) {
      return ReminderOverviewSchema.parse({
        householdId,
        generatedAt: this.clock.now().toISOString(),
        source: null,
        lists: [],
        reminders: [],
      });
    }
    const lists = this.readActiveLists(source.id);
    const reminders = this.readActiveReminders(source.id).filter(
      (reminder) => includeCompleted || !reminder.isCompleted,
    );
    const allReminders = this.readActiveReminders(source.id);
    const publicLists: HearthReminderList[] = lists.map((list) => {
      const members = allReminders.filter((reminder) => reminder.listId === list.id);
      return {
        id: list.id,
        title: list.title,
        reminderCount: members.length,
        incompleteCount: members.filter((reminder) => !reminder.isCompleted).length,
      };
    });
    const publicReminders: HearthReminder[] = reminders.map((reminder) => ({
      id: reminder.id,
      listId: reminder.listId,
      title: reminder.title,
      dueLocalDate: reminder.dueLocalDate,
      dueAt: reminder.dueAt,
      hasDueTime: reminder.hasDueTime,
      isCompleted: reminder.isCompleted,
      completedAt: reminder.completedAt,
      sourceUpdatedAt: reminder.sourceUpdatedAt,
    }));
    publicReminders.sort(compareReminders);
    return ReminderOverviewSchema.parse({
      householdId,
      generatedAt: this.clock.now().toISOString(),
      source: this.sourceSummary(source),
      lists: publicLists.sort((left, right) => left.title.localeCompare(right.title)),
      reminders: publicReminders,
    });
  }

  reset(): void {
    if (this.database !== undefined) {
      this.database.transaction(() => {
        this.database!.exec(`
          DELETE FROM reminder_source_pairing_requests;
          DELETE FROM reminder_snapshot_receipts;
          DELETE FROM reminder_items;
          DELETE FROM reminder_lists;
          DELETE FROM reminder_source_devices;
          DELETE FROM reminder_sources;
        `);
      })();
      return;
    }
    this.pairings.clear();
    this.sources.clear();
    this.devices.clear();
    this.lists.clear();
    this.reminders.clear();
    this.receipts.clear();
  }

  close(): void {}

  private sourceSummary(source: MemorySource): ReminderSourceSummary {
    const device = this.findDeviceForSource(source.id);
    if (device === null)
      throw new RepositoryError('COMMAND_FAILED', 'The Reminders device is missing.');
    const reminders = this.readActiveReminders(source.id);
    return {
      id: source.id,
      displayName: source.displayName,
      kind: 'eventkit',
      readOnly: true,
      status: this.sourceStatus(source),
      device: {
        id: device.id,
        name: device.name,
        platform: 'ios',
        applicationVersion: device.applicationVersion,
        pairedAt: device.pairedAt,
        lastSeenAt: device.lastSeenAt,
        revokedAt: device.revokedAt,
      },
      listCount: this.readActiveLists(source.id).length,
      reminderCount: reminders.length,
      incompleteCount: reminders.filter((reminder) => !reminder.isCompleted).length,
      lastSnapshotGeneratedAt: source.lastSnapshotGeneratedAt,
      lastSnapshotReceivedAt: source.lastSnapshotReceivedAt,
      nextSnapshotSequence: source.lastSnapshotSequence + 1,
    };
  }

  private sourceStatus(source: MemorySource): ReminderSourceSummary['status'] {
    if (source.revokedAt !== null) return 'revoked';
    if (source.lastSnapshotGeneratedAt === null) return 'awaiting-first-snapshot';
    return this.clock.now().getTime() - new Date(source.lastSnapshotGeneratedAt).getTime() <=
      CURRENT_SNAPSHOT_MAX_AGE_MS
      ? 'current'
      : 'stale';
  }

  private session(device: MemoryDevice, source: MemorySource): ReminderSourceDeviceSession {
    return ReminderSourceDeviceSessionSchema.parse({
      contractVersion: REMINDER_CONTRACT_VERSION,
      householdId: source.householdId,
      deviceId: device.id,
      sourceId: source.id,
      scopes: [SOURCE_SCOPE],
      pairedAt: device.pairedAt,
      nextSnapshotSequence: source.lastSnapshotSequence + 1,
    });
  }

  private sessionForIds(deviceId: string, sourceId: string): ReminderSourceDeviceSession {
    const device = this.findDeviceById(deviceId);
    const source = this.findSourceById(sourceId);
    if (
      device === null ||
      source === null ||
      device.revokedAt !== null ||
      source.revokedAt !== null
    ) {
      throw new RepositoryError('UNAUTHENTICATED', 'This Reminders source must be paired again.');
    }
    return this.session(device, source);
  }

  private publicPairing(pairing: MemoryPairing): ReminderSourcePairingRequest {
    return ReminderSourcePairingRequestSchema.parse({
      id: pairing.id,
      requestId: pairing.requestId,
      code: pairing.code,
      deviceName: pairing.deviceName,
      platform: 'ios',
      applicationVersion: pairing.applicationVersion,
      status: pairing.status,
      expiresAt: pairing.expiresAt,
    });
  }

  private expireIfNeeded(pairing: MemoryPairing): MemoryPairing {
    if (
      (pairing.status === 'pending' || pairing.status === 'approved') &&
      new Date(pairing.expiresAt).getTime() <= this.clock.now().getTime()
    ) {
      const expired = {
        ...pairing,
        status: 'expired' as const,
        updatedAt: this.clock.now().toISOString(),
      };
      this.updatePairing(expired);
      return expired;
    }
    return pairing;
  }

  private nextPairingCode(): string {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase();
      if (this.findPairingByCode(code) === null) return code;
    }
    throw new RepositoryError('COMMAND_FAILED', 'Hearth could not create a pairing code.', true);
  }

  private inTransaction(write: () => void): void {
    if (this.database === undefined) write();
    else this.database.transaction(write)();
  }

  private replaceProjection(
    sourceId: string,
    snapshot: ReplaceReminderSnapshotRequest,
    now: string,
  ): void {
    if (this.database === undefined) {
      const sourceLists = this.lists.get(sourceId) ?? new Map<string, MemoryList>();
      const sourceReminders = this.reminders.get(sourceId) ?? new Map<string, MemoryReminder>();
      for (const list of sourceLists.values()) list.removedAt = now;
      for (const reminder of sourceReminders.values()) reminder.removedAt = now;
      const listIds = new Map<string, string>();
      for (const list of snapshot.lists) {
        const externalIdHash = hashExternalId(sourceId, list.sourceListId);
        const existing = sourceLists.get(externalIdHash);
        const projected: MemoryList = {
          id: existing?.id ?? projectedId('reminder_list', externalIdHash),
          externalIdHash,
          title: list.title,
          removedAt: null,
        };
        sourceLists.set(externalIdHash, projected);
        listIds.set(list.sourceListId, projected.id);
      }
      for (const reminder of snapshot.reminders) {
        const externalIdHash = hashExternalId(sourceId, reminder.sourceReminderId);
        const existing = sourceReminders.get(externalIdHash);
        sourceReminders.set(externalIdHash, {
          id: existing?.id ?? projectedId('reminder', externalIdHash),
          listId: listIds.get(reminder.sourceListId)!,
          externalIdHash,
          title: reminder.title,
          dueLocalDate: reminder.dueLocalDate,
          dueAt: reminder.dueAt,
          hasDueTime: reminder.hasDueTime,
          isCompleted: reminder.isCompleted,
          completedAt: reminder.completedAt,
          sourceUpdatedAt: reminder.sourceUpdatedAt,
          removedAt: null,
        });
      }
      this.lists.set(sourceId, sourceLists);
      this.reminders.set(sourceId, sourceReminders);
      return;
    }

    this.database
      .prepare('UPDATE reminder_items SET removed_at = ? WHERE source_id = ?')
      .run(now, sourceId);
    this.database
      .prepare('UPDATE reminder_lists SET removed_at = ? WHERE source_id = ?')
      .run(now, sourceId);
    const upsertList = this.database.prepare(
      `INSERT INTO reminder_lists
        (id, source_id, external_id_hash, title, created_at, updated_at, removed_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(source_id, external_id_hash) DO UPDATE SET
         title = excluded.title, updated_at = excluded.updated_at, removed_at = NULL`,
    );
    const listIds = new Map<string, string>();
    for (const list of snapshot.lists) {
      const externalIdHash = hashExternalId(sourceId, list.sourceListId);
      const id = projectedId('reminder_list', externalIdHash);
      upsertList.run(id, sourceId, externalIdHash, list.title, now, now);
      const row = this.database
        .prepare('SELECT id FROM reminder_lists WHERE source_id = ? AND external_id_hash = ?')
        .get(sourceId, externalIdHash) as { id: string };
      listIds.set(list.sourceListId, row.id);
    }
    const upsertReminder = this.database.prepare(
      `INSERT INTO reminder_items
        (id, source_id, list_id, external_id_hash, title, due_local_date, due_at, has_due_time,
         is_completed, completed_at, source_updated_at, created_at, updated_at, removed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(source_id, external_id_hash) DO UPDATE SET
         list_id = excluded.list_id, title = excluded.title,
         due_local_date = excluded.due_local_date, due_at = excluded.due_at,
         has_due_time = excluded.has_due_time, is_completed = excluded.is_completed,
         completed_at = excluded.completed_at, source_updated_at = excluded.source_updated_at,
         updated_at = excluded.updated_at, removed_at = NULL`,
    );
    for (const reminder of snapshot.reminders) {
      const externalIdHash = hashExternalId(sourceId, reminder.sourceReminderId);
      upsertReminder.run(
        projectedId('reminder', externalIdHash),
        sourceId,
        listIds.get(reminder.sourceListId)!,
        externalIdHash,
        reminder.title,
        reminder.dueLocalDate,
        reminder.dueAt,
        reminder.hasDueTime ? 1 : 0,
        reminder.isCompleted ? 1 : 0,
        reminder.completedAt,
        reminder.sourceUpdatedAt,
        now,
        now,
      );
    }
  }

  private readActiveLists(sourceId: string): MemoryList[] {
    if (this.database === undefined) {
      return [...(this.lists.get(sourceId)?.values() ?? [])].filter(
        (list) => list.removedAt === null,
      );
    }
    return (
      this.database
        .prepare(
          `SELECT id, external_id_hash, title, removed_at
             FROM reminder_lists WHERE source_id = ? AND removed_at IS NULL`,
        )
        .all(sourceId) as Array<{
        id: string;
        external_id_hash: string;
        title: string;
        removed_at: string | null;
      }>
    ).map((row) => ({
      id: row.id,
      externalIdHash: row.external_id_hash,
      title: row.title,
      removedAt: row.removed_at,
    }));
  }

  private readActiveReminders(sourceId: string): MemoryReminder[] {
    if (this.database === undefined) {
      return [...(this.reminders.get(sourceId)?.values() ?? [])].filter(
        (reminder) => reminder.removedAt === null,
      );
    }
    return (
      this.database
        .prepare(
          `SELECT id, list_id, external_id_hash, title, due_local_date, due_at, has_due_time,
                  is_completed, completed_at, source_updated_at, removed_at
             FROM reminder_items WHERE source_id = ? AND removed_at IS NULL`,
        )
        .all(sourceId) as Array<{
        id: string;
        list_id: string;
        external_id_hash: string;
        title: string;
        due_local_date: string | null;
        due_at: string | null;
        has_due_time: number;
        is_completed: number;
        completed_at: string | null;
        source_updated_at: string | null;
        removed_at: string | null;
      }>
    ).map((row) => ({
      id: row.id,
      listId: row.list_id,
      externalIdHash: row.external_id_hash,
      title: row.title,
      dueLocalDate: row.due_local_date,
      dueAt: row.due_at,
      hasDueTime: row.has_due_time === 1,
      isCompleted: row.is_completed === 1,
      completedAt: row.completed_at,
      sourceUpdatedAt: row.source_updated_at,
      removedAt: row.removed_at,
    }));
  }

  private insertPairing(pairing: MemoryPairing): void {
    if (this.database === undefined) {
      this.pairings.set(pairing.id, pairing);
      return;
    }
    this.database
      .prepare(
        `INSERT INTO reminder_source_pairing_requests
          (id, request_id, code, device_name, platform, application_version, credential_hash,
           status, expires_at, approved_household_id, approved_by_member_id, approval_request_id,
           approved_device_id, approved_source_id, created_at, updated_at, exchanged_at)
         VALUES (?, ?, ?, ?, 'ios', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        pairing.id,
        pairing.requestId,
        pairing.code,
        pairing.deviceName,
        pairing.applicationVersion,
        pairing.credentialHash,
        pairing.status,
        pairing.expiresAt,
        pairing.approvedHouseholdId,
        pairing.approvedByMemberId,
        pairing.approvalRequestId,
        pairing.approvedDeviceId,
        pairing.approvedSourceId,
        pairing.createdAt,
        pairing.updatedAt,
        pairing.exchangedAt,
      );
  }

  private updatePairing(pairing: MemoryPairing): void {
    if (this.database === undefined) {
      this.pairings.set(pairing.id, pairing);
      return;
    }
    this.database
      .prepare(
        `UPDATE reminder_source_pairing_requests SET
           status = ?, approved_household_id = ?, approved_by_member_id = ?,
           approval_request_id = ?, approved_device_id = ?, approved_source_id = ?,
           updated_at = ?, exchanged_at = ? WHERE id = ?`,
      )
      .run(
        pairing.status,
        pairing.approvedHouseholdId,
        pairing.approvedByMemberId,
        pairing.approvalRequestId,
        pairing.approvedDeviceId,
        pairing.approvedSourceId,
        pairing.updatedAt,
        pairing.exchangedAt,
        pairing.id,
      );
  }

  private findPairingById(id: string): MemoryPairing | null {
    if (this.database === undefined) return this.pairings.get(id) ?? null;
    const row = this.database
      .prepare('SELECT * FROM reminder_source_pairing_requests WHERE id = ?')
      .get(id) as PairingRow | undefined;
    return row === undefined ? null : memoryPairing(row);
  }

  private findPairingByCode(code: string): MemoryPairing | null {
    if (this.database === undefined) {
      return [...this.pairings.values()].find((pairing) => pairing.code === code) ?? null;
    }
    const row = this.database
      .prepare('SELECT * FROM reminder_source_pairing_requests WHERE code = ?')
      .get(code) as PairingRow | undefined;
    return row === undefined ? null : memoryPairing(row);
  }

  private findPairingByRequestId(requestId: string): MemoryPairing | null {
    if (this.database === undefined) {
      return [...this.pairings.values()].find((pairing) => pairing.requestId === requestId) ?? null;
    }
    const row = this.database
      .prepare('SELECT * FROM reminder_source_pairing_requests WHERE request_id = ?')
      .get(requestId) as PairingRow | undefined;
    return row === undefined ? null : memoryPairing(row);
  }

  private insertSource(source: MemorySource): void {
    if (this.database === undefined) {
      this.sources.set(source.id, source);
      return;
    }
    this.database
      .prepare(
        `INSERT INTO reminder_sources
          (id, household_id, display_name, source_kind, created_at, revoked_at, revoked_request_id,
           last_snapshot_sequence, last_snapshot_id, last_snapshot_generated_at, last_snapshot_received_at)
         VALUES (?, ?, ?, 'eventkit', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        source.id,
        source.householdId,
        source.displayName,
        source.createdAt,
        source.revokedAt,
        source.revokedRequestId,
        source.lastSnapshotSequence,
        source.lastSnapshotId,
        source.lastSnapshotGeneratedAt,
        source.lastSnapshotReceivedAt,
      );
  }

  private updateSource(source: MemorySource): void {
    if (this.database === undefined) {
      this.sources.set(source.id, source);
      return;
    }
    this.database
      .prepare(
        `UPDATE reminder_sources SET revoked_at = ?, revoked_request_id = ?,
           last_snapshot_sequence = ?, last_snapshot_id = ?, last_snapshot_generated_at = ?,
           last_snapshot_received_at = ? WHERE id = ?`,
      )
      .run(
        source.revokedAt,
        source.revokedRequestId,
        source.lastSnapshotSequence,
        source.lastSnapshotId,
        source.lastSnapshotGeneratedAt,
        source.lastSnapshotReceivedAt,
        source.id,
      );
  }

  private findSourceById(id: string): MemorySource | null {
    if (this.database === undefined) return this.sources.get(id) ?? null;
    const row = this.database.prepare('SELECT * FROM reminder_sources WHERE id = ?').get(id) as
      SourceRow | undefined;
    return row === undefined ? null : memorySource(row);
  }

  private findSourcesForHousehold(householdId: string): MemorySource[] {
    if (this.database === undefined) {
      return [...this.sources.values()]
        .filter((source) => source.householdId === householdId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }
    return (
      this.database
        .prepare('SELECT * FROM reminder_sources WHERE household_id = ? ORDER BY created_at DESC')
        .all(householdId) as SourceRow[]
    ).map(memorySource);
  }

  private findActiveSourceForHousehold(householdId: string): MemorySource | null {
    return (
      this.findSourcesForHousehold(householdId).find((source) => source.revokedAt === null) ?? null
    );
  }

  private insertDevice(device: MemoryDevice): void {
    if (this.database === undefined) {
      this.devices.set(device.id, device);
      return;
    }
    this.database
      .prepare(
        `INSERT INTO reminder_source_devices
          (id, source_id, household_id, name, platform, application_version, credential_hash,
           scopes_json, approved_by_member_id, paired_at, last_seen_at, revoked_at)
         VALUES (?, ?, ?, ?, 'ios', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        device.id,
        device.sourceId,
        device.householdId,
        device.name,
        device.applicationVersion,
        device.credentialHash,
        JSON.stringify([SOURCE_SCOPE]),
        device.approvedByMemberId,
        device.pairedAt,
        device.lastSeenAt,
        device.revokedAt,
      );
  }

  private updateDevice(device: MemoryDevice): void {
    if (this.database === undefined) {
      this.devices.set(device.id, device);
      return;
    }
    this.database
      .prepare('UPDATE reminder_source_devices SET last_seen_at = ?, revoked_at = ? WHERE id = ?')
      .run(device.lastSeenAt, device.revokedAt, device.id);
  }

  private findDeviceById(id: string): MemoryDevice | null {
    if (this.database === undefined) return this.devices.get(id) ?? null;
    const row = this.database
      .prepare('SELECT * FROM reminder_source_devices WHERE id = ?')
      .get(id) as DeviceRow | undefined;
    return row === undefined ? null : memoryDevice(row);
  }

  private findDeviceForSource(sourceId: string): MemoryDevice | null {
    if (this.database === undefined) {
      return [...this.devices.values()].find((device) => device.sourceId === sourceId) ?? null;
    }
    const row = this.database
      .prepare(
        `SELECT * FROM reminder_source_devices WHERE source_id = ?
         ORDER BY CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END, paired_at DESC LIMIT 1`,
      )
      .get(sourceId) as DeviceRow | undefined;
    return row === undefined ? null : memoryDevice(row);
  }

  private findDeviceByCredentialHash(digest: string): MemoryDevice | null {
    if (this.database === undefined) {
      return [...this.devices.values()].find((device) => device.credentialHash === digest) ?? null;
    }
    const row = this.database
      .prepare('SELECT * FROM reminder_source_devices WHERE credential_hash = ?')
      .get(digest) as DeviceRow | undefined;
    return row === undefined ? null : memoryDevice(row);
  }

  private findReceiptCollision(
    sourceId: string,
    snapshot: ReplaceReminderSnapshotRequest,
  ): MemoryReceipt | null {
    if (this.database === undefined) {
      return (
        [...this.receipts.values()].find(
          (receipt) =>
            receipt.sourceId === sourceId &&
            (receipt.snapshotId === snapshot.snapshotId ||
              receipt.requestId === snapshot.requestId ||
              receipt.sequence === snapshot.sequence),
        ) ?? null
      );
    }
    const row = this.database
      .prepare(
        `SELECT * FROM reminder_snapshot_receipts
         WHERE source_id = ? AND (snapshot_id = ? OR request_id = ? OR sequence = ?) LIMIT 1`,
      )
      .get(sourceId, snapshot.snapshotId, snapshot.requestId, snapshot.sequence) as
      ReceiptRow | undefined;
    return row === undefined
      ? null
      : {
          sourceId: row.source_id,
          snapshotId: row.snapshot_id,
          requestId: row.request_id,
          sequence: row.sequence,
          payloadHash: row.payload_hash,
          response: ReminderSnapshotReceiptSchema.parse(JSON.parse(row.response_json)),
        };
  }

  private insertReceipt(receipt: MemoryReceipt): void {
    if (this.database === undefined) {
      this.receipts.set(`${receipt.sourceId}:${receipt.snapshotId}`, receipt);
      return;
    }
    this.database
      .prepare(
        `INSERT INTO reminder_snapshot_receipts
          (source_id, snapshot_id, request_id, sequence, payload_hash, response_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        receipt.sourceId,
        receipt.snapshotId,
        receipt.requestId,
        receipt.sequence,
        receipt.payloadHash,
        JSON.stringify(receipt.response),
        receipt.response.acceptedAt,
      );
  }
}

function memoryPairing(row: PairingRow): MemoryPairing {
  return {
    id: row.id,
    requestId: row.request_id,
    code: row.code,
    deviceName: row.device_name,
    applicationVersion: row.application_version,
    credentialHash: row.credential_hash,
    status: row.status,
    expiresAt: row.expires_at,
    approvedHouseholdId: row.approved_household_id,
    approvedByMemberId: row.approved_by_member_id,
    approvalRequestId: row.approval_request_id,
    approvedDeviceId: row.approved_device_id,
    approvedSourceId: row.approved_source_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    exchangedAt: row.exchanged_at,
  };
}

function memorySource(row: SourceRow): MemorySource {
  return {
    id: row.id,
    householdId: row.household_id,
    displayName: row.display_name,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    revokedRequestId: row.revoked_request_id,
    lastSnapshotSequence: row.last_snapshot_sequence,
    lastSnapshotId: row.last_snapshot_id,
    lastSnapshotGeneratedAt: row.last_snapshot_generated_at,
    lastSnapshotReceivedAt: row.last_snapshot_received_at,
  };
}

function memoryDevice(row: DeviceRow): MemoryDevice {
  return {
    id: row.id,
    sourceId: row.source_id,
    householdId: row.household_id,
    name: row.name,
    applicationVersion: row.application_version,
    credentialHash: row.credential_hash,
    approvedByMemberId: row.approved_by_member_id,
    pairedAt: row.paired_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
  };
}

function canonicalSnapshotHash(snapshot: ReplaceReminderSnapshotRequest): string {
  const canonical = {
    contractVersion: snapshot.contractVersion,
    snapshotId: snapshot.snapshotId,
    sequence: snapshot.sequence,
    generatedAt: snapshot.generatedAt,
    lists: snapshot.lists.toSorted((left, right) =>
      left.sourceListId.localeCompare(right.sourceListId),
    ),
    reminders: snapshot.reminders.toSorted((left, right) =>
      left.sourceReminderId.localeCompare(right.sourceReminderId),
    ),
  };
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function hashExternalId(sourceId: string, externalId: string): string {
  return createHash('sha256').update(`${sourceId}\u0000${externalId}`, 'utf8').digest('hex');
}

function projectedId(prefix: string, digest: string): string {
  return `${prefix}_${digest.slice(0, 32)}`;
}

function opaqueId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}

function compareReminders(left: HearthReminder, right: HearthReminder): number {
  if (left.isCompleted !== right.isCompleted) return left.isCompleted ? 1 : -1;
  const leftDue = left.dueAt ?? left.dueLocalDate ?? '9999-12-31';
  const rightDue = right.dueAt ?? right.dueLocalDate ?? '9999-12-31';
  const due = leftDue.localeCompare(rightDue);
  return due === 0 ? left.title.localeCompare(right.title) : due;
}
