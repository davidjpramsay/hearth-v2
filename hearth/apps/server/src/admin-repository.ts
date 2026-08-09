import { createHash, timingSafeEqual } from 'node:crypto';

import type Database from 'better-sqlite3';

import {
  AdminOverviewSchema,
  MemberAvatarCommandResultSchema,
  MemberSchema,
  PairedDeviceSchema,
  PairingRequestSchema,
  TvDeviceSessionSchema,
  type AdminOverview,
  type AuditSummary,
  type CreateMemberRequest,
  type HouseholdSummary,
  type Member,
  type MemberAvatarCommandResult,
  type PairedDevice,
  type PairingRequest,
  type TvDeviceSession,
  type UpdateHouseholdRequest,
  type UpdateMemberAvatarRequest,
  type UpdateMemberRequest,
} from '@hearth/shared';

import { createDemoSeed, DEMO_HOUSEHOLD_ID, DEMO_NOW } from './demo/seed.js';
import { RepositoryError, type CommandActor } from './repository.js';

export const DEMO_ADMIN_ACTOR_ID = 'member_maya';
export const DEMO_CHILD_ACTOR_ID = 'member_ezra';

export const MEMBER_AVATAR_MAX_BYTES = 1_000_000;

export interface MemberAvatarAsset {
  bytes: Uint8Array;
  mimeType: 'image/jpeg';
  versionKey: string;
}

const DEFAULT_DEVICE: PairedDevice = {
  id: 'device_living_room_tv',
  name: 'Living room TV',
  type: 'television',
  status: 'connected',
  scopes: ['household.read', 'chores.complete', 'lists.change', 'home.control'],
  pairedAt: DEMO_NOW,
  lastSeenAt: DEMO_NOW,
  revokedAt: null,
};

export interface AdminRepository {
  getHousehold(householdId: string): Promise<HouseholdSummary>;
  getOverview(householdId: string, actorId: string): Promise<AdminOverview>;
  updateHousehold(
    householdId: string,
    actorId: string,
    input: UpdateHouseholdRequest,
  ): Promise<AdminOverview>;
  createMember(householdId: string, actorId: string, input: CreateMemberRequest): Promise<Member>;
  updateMember(
    householdId: string,
    memberId: string,
    actorId: string,
    input: UpdateMemberRequest,
  ): Promise<Member>;
  archiveMember(
    householdId: string,
    memberId: string,
    actorId: string,
    requestId: string,
  ): Promise<Member>;
  getMemberAvatar(householdId: string, memberId: string): Promise<MemberAvatarAsset>;
  updateMemberAvatar(
    householdId: string,
    memberId: string,
    actorId: string,
    input: UpdateMemberAvatarRequest,
  ): Promise<MemberAvatarCommandResult>;
  resetMemberAvatar(
    householdId: string,
    memberId: string,
    actorId: string,
    requestId: string,
  ): Promise<MemberAvatarCommandResult>;
  createPairing(
    deviceName: string,
    requestId: string,
    credentialHash?: string,
    applicationVersion?: string,
  ): Promise<PairingRequest>;
  getPairing(pairingId: string): Promise<PairingRequest>;
  exchangeTvPairing(
    pairingId: string,
    pairingSecret: string,
    requestId: string,
  ): Promise<TvDeviceSession>;
  getTvDeviceSession(credential: string): TvDeviceSession;
  authenticateDeviceCredential(credential: string): CommandActor;
  approvePairing(
    householdId: string,
    actorId: string,
    code: string,
    requestId: string,
  ): Promise<PairedDevice>;
  revokeDevice(
    householdId: string,
    deviceId: string,
    actorId: string,
    requestId: string,
  ): Promise<PairedDevice>;
  reset(): void;
  close(): void;
}

export class InMemoryAdminRepository implements AdminRepository {
  private household = structuredClone(createDemoSeed().household);
  private devices = [structuredClone(DEFAULT_DEVICE)];
  private pairings: PairingRequest[] = [];
  private pairingCredentialHashes = new Map<string, string>();
  private deviceCredentialHashes = new Map<string, string>();
  private exchangedPairings = new Set<string>();
  private audits: AuditSummary[] = [];
  private memberAvatars = new Map<string, MemberAvatarAsset & { originalAvatarUrl: string }>();
  private avatarReceipts = new Map<string, MemberAvatarCommandResult>();
  private sequence = 1;

  async getHousehold(householdId: string): Promise<HouseholdSummary> {
    if (householdId !== this.household.id) {
      throw new RepositoryError('NOT_FOUND', 'That household could not be found.');
    }
    return structuredClone(this.household);
  }

  async getOverview(householdId: string, actorId: string): Promise<AdminOverview> {
    const actor = this.assertAdmin(householdId, actorId);
    return AdminOverviewSchema.parse({
      household: this.household,
      actor,
      pairedDevices: this.devices,
      pendingPairings: this.pairings.filter((pairing) => pairing.status === 'pending'),
      integrations: createDemoSeed().integrations,
      recentAudit: this.audits.slice(-10).toReversed(),
      localOnly: true,
    });
  }

  async updateHousehold(
    householdId: string,
    actorId: string,
    input: UpdateHouseholdRequest,
  ): Promise<AdminOverview> {
    this.assertAdmin(householdId, actorId);
    this.household = { ...this.household, name: input.name, timezone: input.timezone };
    this.writeAudit('household.update', householdId, actorId);
    return this.getOverview(householdId, actorId);
  }

  async createMember(
    householdId: string,
    actorId: string,
    input: CreateMemberRequest,
  ): Promise<Member> {
    this.assertAdmin(householdId, actorId);
    const member = memberFromInput(`member_demo_${this.sequence++}`, input);
    this.household.members.push(member);
    this.writeAudit('member.create', member.id, actorId);
    return member;
  }

  async updateMember(
    householdId: string,
    memberId: string,
    actorId: string,
    input: UpdateMemberRequest,
  ): Promise<Member> {
    this.assertAdmin(householdId, actorId);
    const index = this.household.members.findIndex((member) => member.id === memberId);
    const current = this.household.members[index];
    if (current === undefined) throw new RepositoryError('NOT_FOUND', 'That person was not found.');
    this.assertAdminRemains(memberId, input.administrator);
    const member = memberFromInput(memberId, input, current.avatarUrl);
    this.household.members[index] = member;
    this.writeAudit('member.update', member.id, actorId);
    return member;
  }

  async archiveMember(
    householdId: string,
    memberId: string,
    actorId: string,
    _requestId: string,
  ): Promise<Member> {
    this.assertAdmin(householdId, actorId);
    if (memberId === actorId) {
      throw new RepositoryError('CONFLICT', 'You cannot remove the administrator you are using.');
    }
    const index = this.household.members.findIndex((member) => member.id === memberId);
    const member = this.household.members[index];
    if (member === undefined) throw new RepositoryError('NOT_FOUND', 'That person was not found.');
    this.household.members.splice(index, 1);
    this.writeAudit('member.archive', member.id, actorId);
    return member;
  }

  async getMemberAvatar(householdId: string, memberId: string): Promise<MemberAvatarAsset> {
    this.assertHouseholdMember(householdId, memberId);
    const asset = this.memberAvatars.get(memberId);
    if (asset === undefined) {
      throw new RepositoryError('NOT_FOUND', 'That profile photo could not be found.');
    }
    return { bytes: asset.bytes.slice(), mimeType: asset.mimeType, versionKey: asset.versionKey };
  }

  async updateMemberAvatar(
    householdId: string,
    memberId: string,
    actorId: string,
    input: UpdateMemberAvatarRequest,
  ): Promise<MemberAvatarCommandResult> {
    this.assertAdmin(householdId, actorId);
    const receiptKey = `member-avatar-update:${input.requestId}`;
    const receipt = this.avatarReceipts.get(receiptKey);
    if (receipt !== undefined) return { ...structuredClone(receipt), replayed: true };
    const { member, index } = this.assertHouseholdMember(householdId, memberId);
    const bytes = decodeMemberAvatar(input.dataBase64);
    const versionKey = avatarVersion(bytes);
    const currentAsset = this.memberAvatars.get(memberId);
    const originalAvatarUrl = currentAsset?.originalAvatarUrl ?? member.avatarUrl;
    this.memberAvatars.set(memberId, {
      bytes,
      mimeType: input.mimeType,
      versionKey,
      originalAvatarUrl,
    });
    const updated = { ...member, avatarUrl: memberAvatarUrl(householdId, memberId, versionKey) };
    this.household.members[index] = updated;
    const result = MemberAvatarCommandResultSchema.parse({
      member: updated,
      audit: this.writeAudit('member.avatar.update', memberId, actorId),
      replayed: false,
    });
    this.avatarReceipts.set(receiptKey, result);
    return structuredClone(result);
  }

  async resetMemberAvatar(
    householdId: string,
    memberId: string,
    actorId: string,
    requestId: string,
  ): Promise<MemberAvatarCommandResult> {
    this.assertAdmin(householdId, actorId);
    const receiptKey = `member-avatar-reset:${requestId}`;
    const receipt = this.avatarReceipts.get(receiptKey);
    if (receipt !== undefined) return { ...structuredClone(receipt), replayed: true };
    const { member, index } = this.assertHouseholdMember(householdId, memberId);
    const asset = this.memberAvatars.get(memberId);
    const updated = { ...member, avatarUrl: asset?.originalAvatarUrl ?? member.avatarUrl };
    this.household.members[index] = updated;
    this.memberAvatars.delete(memberId);
    const result = MemberAvatarCommandResultSchema.parse({
      member: updated,
      audit: this.writeAudit('member.avatar.reset', memberId, actorId, 'reversed'),
      replayed: false,
    });
    this.avatarReceipts.set(receiptKey, result);
    return structuredClone(result);
  }

  async createPairing(
    deviceName: string,
    requestId: string,
    credentialHash?: string,
    _applicationVersion?: string,
  ): Promise<PairingRequest> {
    const existing = this.pairings.find((pairing) => pairing.requestId === requestId);
    if (existing !== undefined) return existing;
    const pairing = PairingRequestSchema.parse({
      id: `pairing_demo_${this.sequence++}`,
      requestId,
      code: this.pairings.length === 0 ? 'HEARTH' : `HEAR${String(this.sequence).padStart(2, '0')}`,
      deviceName,
      status: 'pending',
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      approvedDeviceId: null,
    });
    this.pairings.push(pairing);
    if (credentialHash !== undefined) this.pairingCredentialHashes.set(pairing.id, credentialHash);
    return pairing;
  }

  async getPairing(pairingId: string): Promise<PairingRequest> {
    const pairing = this.pairings.find((candidate) => candidate.id === pairingId);
    if (pairing === undefined)
      throw new RepositoryError('NOT_FOUND', 'That pairing code was not found.');
    return pairing;
  }

  async approvePairing(
    householdId: string,
    actorId: string,
    code: string,
    _requestId: string,
  ): Promise<PairedDevice> {
    this.assertAdmin(householdId, actorId);
    const pairing = this.pairings.find((candidate) => candidate.code === code);
    if (pairing === undefined)
      throw new RepositoryError('NOT_FOUND', 'That pairing code was not found.');
    if (pairing.status === 'approved' && pairing.approvedDeviceId !== null) {
      const existing = this.devices.find((device) => device.id === pairing.approvedDeviceId);
      if (existing !== undefined) return existing;
    }
    if (pairing.status !== 'pending' || new Date(pairing.expiresAt).getTime() <= Date.now()) {
      pairing.status = 'expired';
      throw new RepositoryError(
        'CONFLICT',
        'That pairing code has expired. Ask the TV for a new one.',
      );
    }
    const device = PairedDeviceSchema.parse({
      ...DEFAULT_DEVICE,
      id: `device_demo_${this.sequence++}`,
      name: pairing.deviceName,
      pairedAt: new Date().toISOString(),
      lastSeenAt: null,
    });
    this.devices.push(device);
    const credentialHash = this.pairingCredentialHashes.get(pairing.id);
    if (credentialHash !== undefined) this.deviceCredentialHashes.set(device.id, credentialHash);
    pairing.status = 'approved';
    pairing.approvedDeviceId = device.id;
    this.writeAudit('device.pair', device.id, actorId);
    return device;
  }

  async exchangeTvPairing(
    pairingId: string,
    pairingSecret: string,
    _requestId: string,
  ): Promise<TvDeviceSession> {
    const pairing = this.pairings.find((candidate) => candidate.id === pairingId);
    if (pairing === undefined)
      throw new RepositoryError('NOT_FOUND', 'That pairing was not found.');
    const storedHash = this.pairingCredentialHashes.get(pairing.id);
    if (storedHash === undefined || !hashesMatch(storedHash, credentialHash(pairingSecret))) {
      throw new RepositoryError('UNAUTHENTICATED', 'That pairing secret is not valid.');
    }
    if (pairing.status !== 'approved' || pairing.approvedDeviceId === null) {
      throw new RepositoryError('CONFLICT', 'Ask an adult to approve this television first.');
    }
    const device = this.devices.find((candidate) => candidate.id === pairing.approvedDeviceId);
    if (device === undefined || device.revokedAt !== null) {
      throw new RepositoryError('UNAUTHENTICATED', 'This television is no longer paired.');
    }
    this.exchangedPairings.add(pairing.id);
    return TvDeviceSessionSchema.parse({
      deviceId: device.id,
      householdId: this.household.id,
      deviceName: device.name,
      scopes: device.scopes,
      pairedAt: device.pairedAt,
    });
  }

  authenticateDeviceCredential(credential: string): CommandActor {
    const session = this.getTvDeviceSession(credential);
    return { id: session.deviceId, type: 'device', source: 'tv' };
  }

  getTvDeviceSession(credential: string): TvDeviceSession {
    const candidateHash = credentialHash(credential);
    const device = this.devices.find((item) => {
      const storedHash = this.deviceCredentialHashes.get(item.id);
      return (
        storedHash !== undefined &&
        hashesMatch(storedHash, candidateHash) &&
        item.revokedAt === null
      );
    });
    if (device === undefined) {
      throw new RepositoryError('UNAUTHENTICATED', 'This television is not paired with Hearth.');
    }
    return TvDeviceSessionSchema.parse({
      deviceId: device.id,
      householdId: this.household.id,
      deviceName: device.name,
      scopes: device.scopes,
      pairedAt: device.pairedAt,
    });
  }

  async revokeDevice(
    householdId: string,
    deviceId: string,
    actorId: string,
    _requestId: string,
  ): Promise<PairedDevice> {
    this.assertAdmin(householdId, actorId);
    const index = this.devices.findIndex((device) => device.id === deviceId);
    const device = this.devices[index];
    if (device === undefined)
      throw new RepositoryError('NOT_FOUND', 'That television was not found.');
    const revoked = { ...device, status: 'revoked' as const, revokedAt: new Date().toISOString() };
    this.devices[index] = revoked;
    this.writeAudit('device.revoke', device.id, actorId);
    return revoked;
  }

  reset(): void {
    this.household = structuredClone(createDemoSeed().household);
    this.devices = [structuredClone(DEFAULT_DEVICE)];
    this.pairings = [];
    this.pairingCredentialHashes.clear();
    this.deviceCredentialHashes.clear();
    this.exchangedPairings.clear();
    this.audits = [];
    this.memberAvatars.clear();
    this.avatarReceipts.clear();
    this.sequence = 1;
  }

  close(): void {}

  private assertAdmin(householdId: string, actorId: string): Member {
    if (householdId !== this.household.id) {
      throw new RepositoryError('NOT_FOUND', 'That household could not be found.');
    }
    const actor = this.household.members.find((member) => member.id === actorId);
    if (actor === undefined)
      throw new RepositoryError('UNAUTHENTICATED', 'Sign in as an adult to continue.');
    if (!actor.capabilities.includes('household.admin')) {
      throw new RepositoryError('FORBIDDEN', 'Only a household administrator can change setup.');
    }
    return actor;
  }

  private assertAdminRemains(memberId: string, administrator: boolean): void {
    if (memberId === DEMO_ADMIN_ACTOR_ID && !administrator) {
      throw new RepositoryError('CONFLICT', 'Hearth needs at least one household administrator.');
    }
  }

  private assertHouseholdMember(
    householdId: string,
    memberId: string,
  ): { member: Member; index: number } {
    if (householdId !== this.household.id) {
      throw new RepositoryError('NOT_FOUND', 'That household could not be found.');
    }
    const index = this.household.members.findIndex((member) => member.id === memberId);
    const member = this.household.members[index];
    if (member === undefined) throw new RepositoryError('NOT_FOUND', 'That person was not found.');
    return { member, index };
  }

  private writeAudit(
    action: AuditSummary['action'],
    targetId: string,
    actorId: string,
    result: AuditSummary['result'] = action === 'device.revoke' ? 'reversed' : 'succeeded',
  ): AuditSummary {
    const audit: AuditSummary = {
      id: `audit_admin_${this.sequence++}`,
      actorType: 'member',
      actorId,
      source: 'companion',
      action,
      targetId,
      occurredAt: new Date().toISOString(),
      result,
    };
    this.audits.push(audit);
    return audit;
  }
}

export class SqliteAdminRepository implements AdminRepository {
  constructor(
    private readonly database: InstanceType<typeof Database>,
    options: { seedDemo?: boolean } = {},
  ) {
    if (options.seedDemo ?? true) this.seedDemo();
  }

  async getHousehold(householdId: string): Promise<HouseholdSummary> {
    return this.readHousehold(householdId);
  }

  async getOverview(householdId: string, actorId: string): Promise<AdminOverview> {
    const actor = this.assertAdmin(householdId, actorId);
    return AdminOverviewSchema.parse({
      household: this.readHousehold(householdId),
      actor,
      pairedDevices: this.readDevices(householdId),
      pendingPairings: this.readPendingPairings(),
      integrations: createDemoSeed().integrations,
      recentAudit: this.readAudit(householdId),
      localOnly: true,
    });
  }

  async updateHousehold(
    householdId: string,
    actorId: string,
    input: UpdateHouseholdRequest,
  ): Promise<AdminOverview> {
    this.assertAdmin(householdId, actorId);
    this.database
      .prepare('UPDATE households SET name = ?, timezone = ?, updated_at = ? WHERE id = ?')
      .run(input.name, input.timezone, new Date().toISOString(), householdId);
    this.writeAudit(householdId, actorId, 'household.update', householdId, input.requestId);
    return this.getOverview(householdId, actorId);
  }

  async createMember(
    householdId: string,
    actorId: string,
    input: CreateMemberRequest,
  ): Promise<Member> {
    this.assertAdmin(householdId, actorId);
    const id = `member_setup_${this.nextSequence('members')}`;
    const member = memberFromInput(id, input);
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO members
          (id, household_id, display_name, colour, avatar_key, role, archived_at, created_at, updated_at, capabilities_json)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      )
      .run(
        member.id,
        householdId,
        member.displayName,
        member.color,
        member.avatarUrl,
        member.role,
        now,
        now,
        JSON.stringify(member.capabilities),
      );
    this.writeAudit(householdId, actorId, 'member.create', member.id, input.requestId);
    return member;
  }

  async updateMember(
    householdId: string,
    memberId: string,
    actorId: string,
    input: UpdateMemberRequest,
  ): Promise<Member> {
    this.assertAdmin(householdId, actorId);
    const current = this.readMember(householdId, memberId);
    if (memberId === actorId && !input.administrator) {
      throw new RepositoryError('CONFLICT', 'Hearth needs at least one household administrator.');
    }
    const member = memberFromInput(memberId, input, current.avatarUrl);
    this.database
      .prepare(
        `UPDATE members
         SET display_name = ?, colour = ?, role = ?, capabilities_json = ?, updated_at = ?
         WHERE id = ? AND household_id = ? AND archived_at IS NULL`,
      )
      .run(
        member.displayName,
        member.color,
        member.role,
        JSON.stringify(member.capabilities),
        new Date().toISOString(),
        memberId,
        householdId,
      );
    this.writeAudit(householdId, actorId, 'member.update', member.id, input.requestId);
    return member;
  }

  async archiveMember(
    householdId: string,
    memberId: string,
    actorId: string,
    _requestId: string,
  ): Promise<Member> {
    this.assertAdmin(householdId, actorId);
    if (memberId === actorId) {
      throw new RepositoryError('CONFLICT', 'You cannot remove the administrator you are using.');
    }
    const member = this.readMember(householdId, memberId);
    this.database
      .prepare('UPDATE members SET archived_at = ?, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), new Date().toISOString(), memberId);
    this.writeAudit(householdId, actorId, 'member.archive', member.id, _requestId);
    return member;
  }

  async getMemberAvatar(householdId: string, memberId: string): Promise<MemberAvatarAsset> {
    this.readMember(householdId, memberId);
    const row = this.database
      .prepare(
        `SELECT mime_type, image_bytes, version_key
         FROM member_avatars WHERE household_id = ? AND member_id = ?`,
      )
      .get(householdId, memberId) as MemberAvatarRow | undefined;
    if (row === undefined) {
      throw new RepositoryError('NOT_FOUND', 'That profile photo could not be found.');
    }
    return {
      bytes: new Uint8Array(row.image_bytes),
      mimeType: row.mime_type,
      versionKey: row.version_key,
    };
  }

  async updateMemberAvatar(
    householdId: string,
    memberId: string,
    actorId: string,
    input: UpdateMemberAvatarRequest,
  ): Promise<MemberAvatarCommandResult> {
    this.assertAdmin(householdId, actorId);
    const replay = this.readAvatarReceipt(householdId, input.requestId, 'member.avatar.update');
    if (replay !== null) return { ...replay, replayed: true };
    const member = this.readMember(householdId, memberId);
    const bytes = decodeMemberAvatar(input.dataBase64);
    const versionKey = avatarVersion(bytes);
    const now = new Date().toISOString();

    return this.database.transaction(() => {
      const existing = this.database
        .prepare(
          'SELECT original_avatar_key FROM member_avatars WHERE household_id = ? AND member_id = ?',
        )
        .get(householdId, memberId) as Pick<MemberAvatarRow, 'original_avatar_key'> | undefined;
      this.database
        .prepare(
          `INSERT INTO member_avatars
            (household_id, member_id, mime_type, image_bytes, version_key, original_avatar_key,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(household_id, member_id) DO UPDATE SET
             mime_type = excluded.mime_type,
             image_bytes = excluded.image_bytes,
             version_key = excluded.version_key,
             updated_at = excluded.updated_at`,
        )
        .run(
          householdId,
          memberId,
          input.mimeType,
          Buffer.from(bytes),
          versionKey,
          existing?.original_avatar_key ?? member.avatarUrl,
          now,
          now,
        );
      const avatarUrl = memberAvatarUrl(householdId, memberId, versionKey);
      this.database
        .prepare(
          'UPDATE members SET avatar_key = ?, updated_at = ? WHERE household_id = ? AND id = ?',
        )
        .run(avatarUrl, now, householdId, memberId);
      const updated = this.readMember(householdId, memberId);
      const result = MemberAvatarCommandResultSchema.parse({
        member: updated,
        audit: this.writeAudit(
          householdId,
          actorId,
          'member.avatar.update',
          memberId,
          input.requestId,
        ),
        replayed: false,
      });
      this.writeAvatarReceipt(householdId, input.requestId, 'member.avatar.update', result);
      return result;
    })();
  }

  async resetMemberAvatar(
    householdId: string,
    memberId: string,
    actorId: string,
    requestId: string,
  ): Promise<MemberAvatarCommandResult> {
    this.assertAdmin(householdId, actorId);
    const replay = this.readAvatarReceipt(householdId, requestId, 'member.avatar.reset');
    if (replay !== null) return { ...replay, replayed: true };
    const member = this.readMember(householdId, memberId);

    return this.database.transaction(() => {
      const asset = this.database
        .prepare(
          'SELECT original_avatar_key FROM member_avatars WHERE household_id = ? AND member_id = ?',
        )
        .get(householdId, memberId) as Pick<MemberAvatarRow, 'original_avatar_key'> | undefined;
      const now = new Date().toISOString();
      if (asset !== undefined) {
        this.database
          .prepare(
            'UPDATE members SET avatar_key = ?, updated_at = ? WHERE household_id = ? AND id = ?',
          )
          .run(asset.original_avatar_key, now, householdId, memberId);
        this.database
          .prepare('DELETE FROM member_avatars WHERE household_id = ? AND member_id = ?')
          .run(householdId, memberId);
      }
      const updated = asset === undefined ? member : this.readMember(householdId, memberId);
      const result = MemberAvatarCommandResultSchema.parse({
        member: updated,
        audit: this.writeAudit(
          householdId,
          actorId,
          'member.avatar.reset',
          memberId,
          requestId,
          'reversed',
        ),
        replayed: false,
      });
      this.writeAvatarReceipt(householdId, requestId, 'member.avatar.reset', result);
      return result;
    })();
  }

  async createPairing(
    deviceName: string,
    requestId: string,
    credentialHashValue?: string,
    applicationVersion?: string,
  ): Promise<PairingRequest> {
    const existing = this.database
      .prepare('SELECT * FROM pairing_requests WHERE request_id = ?')
      .get(requestId) as PairingRow | undefined;
    if (existing !== undefined) return pairingFromRow(existing);
    const sequence = this.nextSequence('pairing_requests');
    const now = new Date();
    const pairing = PairingRequestSchema.parse({
      id: `pairing_setup_${sequence}`,
      requestId,
      code: sequence === 1 ? 'HEARTH' : `HEAR${String(sequence).padStart(2, '0')}`,
      deviceName,
      status: 'pending',
      expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
      approvedDeviceId: null,
    });
    this.database
      .prepare(
        `INSERT INTO pairing_requests
          (id, request_id, code, device_name, status, expires_at, approved_device_id, created_at,
           updated_at, credential_hash, application_version, credential_exchanged_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL)`,
      )
      .run(
        pairing.id,
        pairing.requestId,
        pairing.code,
        pairing.deviceName,
        pairing.status,
        pairing.expiresAt,
        now.toISOString(),
        now.toISOString(),
        credentialHashValue ?? null,
        applicationVersion ?? null,
      );
    return pairing;
  }

  async getPairing(pairingId: string): Promise<PairingRequest> {
    const row = this.database
      .prepare('SELECT * FROM pairing_requests WHERE id = ?')
      .get(pairingId) as PairingRow | undefined;
    if (row === undefined)
      throw new RepositoryError('NOT_FOUND', 'That pairing code was not found.');
    if (row.status === 'pending' && new Date(row.expires_at).getTime() <= Date.now()) {
      this.database
        .prepare("UPDATE pairing_requests SET status = 'expired', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), pairingId);
      row.status = 'expired';
    }
    return pairingFromRow(row);
  }

  async approvePairing(
    householdId: string,
    actorId: string,
    code: string,
    _requestId: string,
  ): Promise<PairedDevice> {
    this.assertAdmin(householdId, actorId);
    const row = this.database.prepare('SELECT * FROM pairing_requests WHERE code = ?').get(code) as
      PairingRow | undefined;
    if (row === undefined)
      throw new RepositoryError('NOT_FOUND', 'That pairing code was not found.');
    if (row.status === 'approved' && row.approved_device_id !== null) {
      return this.readDevice(householdId, row.approved_device_id);
    }
    if (row.status !== 'pending' || new Date(row.expires_at).getTime() <= Date.now()) {
      throw new RepositoryError(
        'CONFLICT',
        'That pairing code has expired. Ask the TV for a new one.',
      );
    }
    const now = new Date().toISOString();
    const deviceId = `device_setup_${this.nextSequence('paired_devices')}`;
    const credentialReference =
      row.credential_hash === null ? `unavailable:${deviceId}` : `sha256:${row.credential_hash}`;
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO paired_devices
            (id, household_id, name, device_type, credential_reference, scopes_json, paired_at,
             last_seen_at, revoked_at, application_version, capabilities_json)
           VALUES (?, ?, ?, 'television', ?, ?, ?, NULL, NULL, ?, ?)`,
        )
        .run(
          deviceId,
          householdId,
          row.device_name,
          credentialReference,
          JSON.stringify(['household.read', 'chores.complete', 'lists.change', 'home.control']),
          now,
          row.application_version ?? 'web-demo',
          JSON.stringify(['dpad', 'back']),
        );
      this.database
        .prepare(
          "UPDATE pairing_requests SET status = 'approved', approved_device_id = ?, updated_at = ? WHERE id = ?",
        )
        .run(deviceId, now, row.id);
    });
    transaction();
    this.writeAudit(householdId, actorId, 'device.pair', deviceId, _requestId);
    return this.readDevice(householdId, deviceId);
  }

  async exchangeTvPairing(
    pairingId: string,
    pairingSecret: string,
    _requestId: string,
  ): Promise<TvDeviceSession> {
    const row = this.database
      .prepare('SELECT * FROM pairing_requests WHERE id = ?')
      .get(pairingId) as PairingRow | undefined;
    if (row === undefined) throw new RepositoryError('NOT_FOUND', 'That pairing was not found.');
    if (
      row.credential_hash === null ||
      !hashesMatch(row.credential_hash, credentialHash(pairingSecret))
    ) {
      throw new RepositoryError('UNAUTHENTICATED', 'That pairing secret is not valid.');
    }
    if (row.status !== 'approved' || row.approved_device_id === null) {
      throw new RepositoryError('CONFLICT', 'Ask an adult to approve this television first.');
    }
    const deviceRow = this.database
      .prepare('SELECT * FROM paired_devices WHERE id = ?')
      .get(row.approved_device_id) as DeviceRow | undefined;
    if (deviceRow === undefined || deviceRow.revoked_at !== null) {
      throw new RepositoryError('UNAUTHENTICATED', 'This television is no longer paired.');
    }
    const now = new Date().toISOString();
    this.database
      .prepare(
        `UPDATE pairing_requests
         SET credential_exchanged_at = COALESCE(credential_exchanged_at, ?), updated_at = ?
         WHERE id = ?`,
      )
      .run(now, now, pairingId);
    this.database
      .prepare('UPDATE paired_devices SET last_seen_at = ? WHERE id = ?')
      .run(now, deviceRow.id);
    return TvDeviceSessionSchema.parse({
      deviceId: deviceRow.id,
      householdId: deviceRow.household_id,
      deviceName: deviceRow.name,
      scopes: JSON.parse(deviceRow.scopes_json) as unknown,
      pairedAt: deviceRow.paired_at,
    });
  }

  authenticateDeviceCredential(credential: string): CommandActor {
    const session = this.getTvDeviceSession(credential);
    return { id: session.deviceId, type: 'device', source: 'tv' };
  }

  getTvDeviceSession(credential: string): TvDeviceSession {
    const reference = `sha256:${credentialHash(credential)}`;
    const row = this.database
      .prepare(
        `SELECT * FROM paired_devices
         WHERE credential_reference = ? AND revoked_at IS NULL`,
      )
      .get(reference) as DeviceRow | undefined;
    if (row === undefined) {
      throw new RepositoryError('UNAUTHENTICATED', 'This television is not paired with Hearth.');
    }
    this.database
      .prepare('UPDATE paired_devices SET last_seen_at = ? WHERE id = ?')
      .run(new Date().toISOString(), row.id);
    return TvDeviceSessionSchema.parse({
      deviceId: row.id,
      householdId: row.household_id,
      deviceName: row.name,
      scopes: JSON.parse(row.scopes_json) as unknown,
      pairedAt: row.paired_at,
    });
  }

  async revokeDevice(
    householdId: string,
    deviceId: string,
    actorId: string,
    _requestId: string,
  ): Promise<PairedDevice> {
    this.assertAdmin(householdId, actorId);
    this.readDevice(householdId, deviceId);
    this.database
      .prepare('UPDATE paired_devices SET revoked_at = ? WHERE id = ? AND household_id = ?')
      .run(new Date().toISOString(), deviceId, householdId);
    this.writeAudit(householdId, actorId, 'device.revoke', deviceId, _requestId, 'reversed');
    return this.readDevice(householdId, deviceId);
  }

  reset(): void {
    this.database.exec(
      `DELETE FROM member_avatars;
       DELETE FROM command_receipts;
       DELETE FROM audit_events;
       DELETE FROM pairing_requests;
       DELETE FROM paired_devices;`,
    );
    this.database
      .prepare('UPDATE households SET name = ?, timezone = ?, updated_at = ? WHERE id = ?')
      .run('Hearth Demo Home', 'Australia/Perth', DEMO_NOW, DEMO_HOUSEHOLD_ID);
    this.database
      .prepare(
        "DELETE FROM members WHERE household_id = ? AND id NOT IN ('member_ezra', 'member_maya')",
      )
      .run(DEMO_HOUSEHOLD_ID);
    const restoreMember = this.database.prepare(
      `UPDATE members
       SET display_name = ?, colour = ?, avatar_key = ?, role = ?, archived_at = NULL,
           updated_at = ?, capabilities_json = ?
       WHERE household_id = ? AND id = ?`,
    );
    for (const member of createDemoSeed().household.members) {
      restoreMember.run(
        member.displayName,
        member.color,
        member.avatarUrl,
        member.role,
        DEMO_NOW,
        JSON.stringify(member.capabilities),
        DEMO_HOUSEHOLD_ID,
        member.id,
      );
    }
    this.seedDefaultDevice();
  }

  close(): void {
    this.database.close();
  }

  private seedDemo(): void {
    const seed = createDemoSeed();
    this.database
      .prepare(
        `INSERT OR IGNORE INTO households
          (id, name, timezone, locale, week_starts_on, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        seed.household.id,
        seed.household.name,
        seed.household.timezone,
        seed.household.locale,
        DEMO_NOW,
        DEMO_NOW,
      );
    const insertMember = this.database.prepare(
      `INSERT OR IGNORE INTO members
        (id, household_id, display_name, colour, avatar_key, role, archived_at, created_at, updated_at, capabilities_json)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    );
    for (const member of seed.household.members) {
      insertMember.run(
        member.id,
        seed.household.id,
        member.displayName,
        member.color,
        member.avatarUrl,
        member.role,
        DEMO_NOW,
        DEMO_NOW,
        JSON.stringify(member.capabilities),
      );
    }
    this.seedDefaultDevice();
  }

  private seedDefaultDevice(): void {
    this.database
      .prepare(
        `INSERT OR IGNORE INTO paired_devices
          (id, household_id, name, device_type, credential_reference, scopes_json, paired_at,
           last_seen_at, revoked_at, application_version, capabilities_json)
         VALUES (?, ?, ?, 'television', ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        DEFAULT_DEVICE.id,
        DEMO_HOUSEHOLD_ID,
        DEFAULT_DEVICE.name,
        'secure-store-reference:demo',
        JSON.stringify(DEFAULT_DEVICE.scopes),
        DEFAULT_DEVICE.pairedAt,
        DEFAULT_DEVICE.lastSeenAt,
        'web-demo',
        JSON.stringify(['dpad', 'back']),
      );
  }

  private assertAdmin(householdId: string, actorId: string): Member {
    const actor = this.readMember(householdId, actorId);
    if (!actor.capabilities.includes('household.admin')) {
      throw new RepositoryError('FORBIDDEN', 'Only a household administrator can change setup.');
    }
    return actor;
  }

  private readHousehold(householdId: string) {
    const row = this.database.prepare('SELECT * FROM households WHERE id = ?').get(householdId) as
      HouseholdRow | undefined;
    if (row === undefined)
      throw new RepositoryError('NOT_FOUND', 'That household could not be found.');
    return {
      id: row.id,
      name: row.name,
      timezone: row.timezone,
      locale: row.locale,
      mode: 'Morning',
      members: this.readMembers(householdId),
    };
  }

  private readMembers(householdId: string): Member[] {
    const rows = this.database
      .prepare(
        'SELECT * FROM members WHERE household_id = ? AND archived_at IS NULL ORDER BY created_at, id',
      )
      .all(householdId) as MemberRow[];
    return rows.map(memberFromRow);
  }

  private readMember(householdId: string, memberId: string): Member {
    const row = this.database
      .prepare('SELECT * FROM members WHERE id = ? AND household_id = ? AND archived_at IS NULL')
      .get(memberId, householdId) as MemberRow | undefined;
    if (row === undefined)
      throw new RepositoryError('UNAUTHENTICATED', 'Sign in as an adult to continue.');
    return memberFromRow(row);
  }

  private readDevices(householdId: string): PairedDevice[] {
    const rows = this.database
      .prepare('SELECT * FROM paired_devices WHERE household_id = ? ORDER BY paired_at DESC')
      .all(householdId) as DeviceRow[];
    return rows.map(deviceFromRow);
  }

  private readDevice(householdId: string, deviceId: string): PairedDevice {
    const row = this.database
      .prepare('SELECT * FROM paired_devices WHERE id = ? AND household_id = ?')
      .get(deviceId, householdId) as DeviceRow | undefined;
    if (row === undefined) throw new RepositoryError('NOT_FOUND', 'That television was not found.');
    return deviceFromRow(row);
  }

  private readPendingPairings(): PairingRequest[] {
    const rows = this.database
      .prepare("SELECT * FROM pairing_requests WHERE status = 'pending' ORDER BY created_at DESC")
      .all() as PairingRow[];
    return rows.map(pairingFromRow);
  }

  private readAudit(householdId: string): AuditSummary[] {
    const rows = this.database
      .prepare(
        `SELECT id, actor_type, actor_id, source_channel, action_type, target_id, occurred_at, result
         FROM audit_events WHERE household_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 10`,
      )
      .all(householdId) as AuditRow[];
    return rows.map((row) => ({
      id: row.id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      source: row.source_channel,
      action: row.action_type,
      targetId: row.target_id,
      occurredAt: row.occurred_at,
      result: row.result,
    }));
  }

  private writeAudit(
    householdId: string,
    actorId: string,
    action: AuditSummary['action'],
    targetId: string,
    requestId: string,
    result: AuditSummary['result'] = 'succeeded',
  ): AuditSummary {
    const occurredAt = new Date().toISOString();
    const audit = {
      id: `audit_setup_${this.nextSequence('audit_events')}`,
      actorType: 'member' as const,
      actorId,
      source: 'companion' as const,
      action,
      targetId,
      occurredAt,
      result,
    } satisfies AuditSummary;
    this.database
      .prepare(
        `INSERT INTO audit_events
          (id, occurred_at, household_id, actor_type, actor_id, source_channel, action_type,
           target_type, target_id, request_id, result, safe_summary_json)
         VALUES (?, ?, ?, 'member', ?, 'companion', ?, ?, ?, ?, ?, '{}')`,
      )
      .run(
        audit.id,
        occurredAt,
        householdId,
        actorId,
        action,
        action.startsWith('device.')
          ? 'paired_device'
          : action.startsWith('member.')
            ? 'member'
            : 'household',
        targetId,
        requestId,
        result,
      );
    return audit;
  }

  private readAvatarReceipt(
    householdId: string,
    requestId: string,
    commandType: 'member.avatar.update' | 'member.avatar.reset',
  ): MemberAvatarCommandResult | null {
    const row = this.database
      .prepare(
        `SELECT response_json FROM command_receipts
         WHERE household_id = ? AND request_id = ? AND command_type = ?`,
      )
      .get(householdId, requestId, commandType) as { response_json: string } | undefined;
    return row === undefined
      ? null
      : MemberAvatarCommandResultSchema.parse(JSON.parse(row.response_json) as unknown);
  }

  private writeAvatarReceipt(
    householdId: string,
    requestId: string,
    commandType: 'member.avatar.update' | 'member.avatar.reset',
    result: MemberAvatarCommandResult,
  ): void {
    this.database
      .prepare(
        `INSERT INTO command_receipts
          (household_id, request_id, command_type, response_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(householdId, requestId, commandType, JSON.stringify(result), new Date().toISOString());
  }

  private nextSequence(
    table: 'members' | 'pairing_requests' | 'paired_devices' | 'audit_events',
  ): number {
    const row = this.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
      count: number;
    };
    return row.count + 1;
  }
}

function memberFromInput(
  id: string,
  input: CreateMemberRequest | UpdateMemberRequest,
  avatarUrl = '/brand/hearth-mark.png',
): Member {
  return MemberSchema.parse({
    id,
    displayName: input.displayName,
    color: input.color,
    avatarUrl,
    role: input.role,
    capabilities: input.administrator
      ? [
          'household.admin',
          'household.view',
          'chores.complete',
          'lists.change',
          'meals.change',
          'pocket-money.view',
          'home.control',
        ]
      : input.role === 'adult'
        ? [
            'household.view',
            'chores.complete',
            'lists.change',
            'meals.change',
            'pocket-money.view',
            'home.control',
          ]
        : ['household.view', 'chores.complete', 'lists.change', 'pocket-money.view'],
  });
}

interface HouseholdRow {
  id: string;
  name: string;
  timezone: string;
  locale: string;
}

interface MemberRow {
  id: string;
  display_name: string;
  colour: string;
  avatar_key: string | null;
  role: 'adult' | 'child';
  capabilities_json: string;
}

interface MemberAvatarRow {
  mime_type: 'image/jpeg';
  image_bytes: Buffer;
  version_key: string;
  original_avatar_key: string;
}

interface DeviceRow {
  id: string;
  household_id: string;
  name: string;
  device_type: 'television';
  credential_reference: string;
  scopes_json: string;
  paired_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

interface PairingRow {
  id: string;
  request_id: string;
  code: string;
  device_name: string;
  status: 'pending' | 'approved' | 'expired' | 'cancelled';
  expires_at: string;
  approved_device_id: string | null;
  credential_hash: string | null;
  application_version: string | null;
  credential_exchanged_at: string | null;
}

interface AuditRow {
  id: string;
  actor_type: AuditSummary['actorType'];
  actor_id: string;
  source_channel: AuditSummary['source'];
  action_type: AuditSummary['action'];
  target_id: string;
  occurred_at: string;
  result: AuditSummary['result'];
}

function memberFromRow(row: MemberRow): Member {
  return MemberSchema.parse({
    id: row.id,
    displayName: row.display_name,
    color: row.colour,
    avatarUrl: row.avatar_key ?? '/brand/hearth-mark.png',
    role: row.role,
    capabilities: JSON.parse(row.capabilities_json) as unknown,
  });
}

function deviceFromRow(row: DeviceRow): PairedDevice {
  return PairedDeviceSchema.parse({
    id: row.id,
    name: row.name,
    type: row.device_type,
    status: row.revoked_at === null ? 'connected' : 'revoked',
    scopes: JSON.parse(row.scopes_json) as unknown,
    pairedAt: row.paired_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
  });
}

function pairingFromRow(row: PairingRow): PairingRequest {
  return PairingRequestSchema.parse({
    id: row.id,
    requestId: row.request_id,
    code: row.code,
    deviceName: row.device_name,
    status: row.status,
    expiresAt: row.expires_at,
    approvedDeviceId: row.approved_device_id,
  });
}

export function credentialHash(credential: string): string {
  return createHash('sha256').update(credential, 'utf8').digest('hex');
}

function hashesMatch(storedHash: string, candidateHash: string): boolean {
  if (storedHash.length !== candidateHash.length) return false;
  return timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(candidateHash, 'hex'));
}

function decodeMemberAvatar(dataBase64: string): Uint8Array {
  const bytes = Buffer.from(dataBase64, 'base64');
  const isJpeg =
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes.at(-2) === 0xff &&
    bytes.at(-1) === 0xd9;
  if (!isJpeg) {
    throw new RepositoryError('VALIDATION_ERROR', 'Choose a valid JPEG profile photo.');
  }
  if (bytes.length > MEMBER_AVATAR_MAX_BYTES) {
    throw new RepositoryError(
      'VALIDATION_ERROR',
      'That profile photo is too large. Choose a photo under 1 MB.',
    );
  }
  return new Uint8Array(bytes);
}

function avatarVersion(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

function memberAvatarUrl(householdId: string, memberId: string, versionKey: string): string {
  return `/api/v1/households/${householdId}/members/${memberId}/avatar?v=${versionKey}`;
}
