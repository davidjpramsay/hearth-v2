import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  PhoneConnectionsSchema,
  PhoneInvitationStateSchema,
  PasskeySessionSchema,
  type OwnerPhoneClaim,
  type PhoneInvitationState,
  type PhoneInvitationReveal,
  type PhoneConnections,
  type PasskeySession,
  PhoneRecoverySummarySchema,
  type PhoneRecoverySummary,
  type PhoneRecoveryCardReveal,
  type PhoneRecoveryClaim,
  type AuditSummary,
} from '@hearth/shared';
import type { CompanionAuthConfiguration, CompanionAuthRepository } from './companion-auth.js';
import { RepositoryError } from './repository.js';
import { OWNER_PHONE_PROTECTED } from './owner-phone.js';
import { createConnectionCode } from './connection-codes.js';

export interface PhoneApprovalReference {
  householdId: string;
  memberId: string;
  connectionId: string;
  sessionHash: string;
}

const INVITATION_MS = 5 * 60_000;
const SESSION_MS = 180 * 24 * 60 * 60_000;
export const PHONE_IDLE_MS = 90 * 24 * 60 * 60_000;
export const PHONE_PENDING_COOKIE = 'hearth_phone_pending';
type SessionResult = { token: string; session: PasskeySession };
interface ConnectionActor {
  id: string;
  household_id: string;
  member_id: string;
  label: string;
  display_name: string;
  expires_at: string;
  source: 'owner' | 'qr' | 'legacy';
}
interface Invitation {
  id: string;
  household_id: string;
  member_id: string;
  creator_connection_id: string;
  creator_session_hash: string;
  claim_hash: string | null;
  phone_label: string | null;
  expires_at: string;
  approved_at: string | null;
  consumed_at: string | null;
  cancelled_at: string | null;
  issued_session_hash: string | null;
  display_name: string;
  purpose: 'connect' | 'recover-owner';
  replaces_connection_id: string | null;
}

interface RecoveryCard {
  id: string;
  household_id: string;
  member_id: string;
  owner_connection_id: string;
  creator_connection_id: string;
  generation: number;
  pending_expires_at: string;
  activated_at: string | null;
  consumed_at: string | null;
  revoked_at: string | null;
  claim_context_hash: string | null;
  claim_request_id: string | null;
  claim_phone_name: string | null;
}

export class PhoneConnectionService {
  private readonly now: () => Date;
  private readonly attempts = new Map<string, { count: number; until: number }>();
  private codeAttempts = { count: 0, until: 0 };
  // Only a short process-local retry receipt holds a raw cookie, never SQLite or logs.
  private readonly exchanges = new Map<string, SessionResult & { until: number }>();
  private readonly cardReveals = new Map<string, PhoneRecoveryCardReveal & { until: number }>();
  constructor(
    private readonly db: InstanceType<typeof Database>,
    private readonly auth: CompanionAuthRepository,
    private readonly configuration: CompanionAuthConfiguration,
  ) {
    this.now = configuration.now ?? (() => new Date());
  }

  async ownerClaim(
    input: OwnerPhoneClaim,
    address: string,
    assertBrowser: () => void,
  ): Promise<SessionResult> {
    this.limit(address);
    const household = this.db.prepare('SELECT id FROM households LIMIT 1').get() as
      { id: string } | undefined;
    if (household === undefined) {
      let expected: string;
      try {
        expected = (await this.configuration.readFirstUseCode()).trim();
      } catch {
        throw new RepositoryError('INTEGRATION_UNAVAILABLE', 'The owner setup key is not ready.');
      }
      if (
        expected.length < 32 ||
        !timingSafeEqual(
          Buffer.from(hash(expected), 'hex'),
          Buffer.from(hash(input.ownerKey), 'hex'),
        )
      ) {
        throw new RepositoryError('FORBIDDEN', 'That owner key was not accepted.');
      }
      if (!input.householdName || !input.adultName || !input.timezone) {
        throw new RepositoryError(
          'VALIDATION_ERROR',
          'Enter the household, adult name and timezone.',
        );
      }
      const result = this.db.transaction(() => {
        assertBrowser();
        if (this.db.prepare('SELECT 1 FROM households LIMIT 1').get())
          throw new RepositoryError('CONFLICT', 'This household is already set up.');
        const home = id('household');
        const member = id('member');
        const now = this.now().toISOString();
        this.db
          .prepare(
            "INSERT INTO households (id,name,timezone,locale,week_starts_on,created_at,updated_at) VALUES (?,?,?,'en-AU',1,?,?)",
          )
          .run(home, input.householdName, input.timezone, now, now);
        this.db
          .prepare(
            "INSERT INTO members (id,household_id,display_name,colour,avatar_key,role,created_at,updated_at,capabilities_json) VALUES (?,?,?,'#2f766d','/brand/hearth-mark.png','adult',?,?,?)",
          )
          .run(
            member,
            home,
            input.adultName,
            now,
            now,
            JSON.stringify([
              'household.admin',
              'household.view',
              'chores.complete',
              'lists.change',
              'meals.change',
              'pocket-money.view',
              'home.control',
            ]),
          );
        const list = this.db.prepare(
          'INSERT INTO household_lists (id,household_id,name,list_type,colour,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
        );
        list.run(id('list'), home, 'Groceries', 'grocery', '#d77747', 0, now, now);
        list.run(id('list'), home, 'To-do', 'custom', '#2f766d', 1, now, now);
        return this.issue(home, member, input.phoneName, 'owner');
      })();
      await this.configuration.consumeFirstUseCode().catch(() => undefined);
      return result;
    }
    return this.db.transaction(() => {
      assertBrowser();
      const grant = this.db
        .prepare(
          'SELECT id,household_id,member_id FROM controller_phone_owner_grants WHERE key_hash=? AND household_id=? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>?',
        )
        .get(hash(input.ownerKey), household.id, this.now().toISOString()) as
        { id: string; household_id: string; member_id: string } | undefined;
      if (!grant) throw new RepositoryError('FORBIDDEN', 'That owner key was not accepted.');
      this.adult(grant.household_id, grant.member_id);
      // The private owner key replaces the main connection, not any QR-connected parent or TV.
      // Even an expired owner stays protected until this authorized transaction replaces it.
      const result = this.replaceOwner(
        grant.household_id,
        grant.member_id,
        input.phoneName,
        grant.member_id,
        null,
      );
      this.db
        .prepare('UPDATE controller_phone_owner_grants SET consumed_at=? WHERE id=?')
        .run(this.now().toISOString(), grant.id);
      return result;
    })();
  }

  list(home: string, token: string): PhoneConnections {
    const actor = this.controller(home, token);
    const now = this.now().toISOString();
    const connections = this.db
      .prepare(
        `SELECT c.*,m.display_name FROM controller_phone_connections c JOIN members m ON m.id=c.member_id AND m.household_id=c.household_id WHERE c.household_id=? AND c.revoked_at IS NULL AND (c.expires_at>? OR c.source='owner') AND m.archived_at IS NULL ORDER BY c.created_at DESC LIMIT 100`,
      )
      .all(home, now) as Array<{
      id: string;
      member_id: string;
      label: string;
      source: string;
      created_at: string;
      last_seen_at: string;
      expires_at: string;
      display_name: string;
    }>;
    const adults = this.db
      .prepare(
        "SELECT id,display_name FROM members WHERE household_id=? AND role='adult' AND archived_at IS NULL AND EXISTS (SELECT 1 FROM json_each(capabilities_json) WHERE value='household.admin') ORDER BY display_name",
      )
      .all(home) as Array<{ id: string; display_name: string }>;
    return PhoneConnectionsSchema.parse({
      connections: connections.map((c) => ({
        id: c.id,
        memberId: c.member_id,
        adultName: c.display_name,
        phoneName: c.label,
        source: c.source,
        createdAt: c.created_at,
        lastSeenAt: c.last_seen_at,
        expiresAt: c.expires_at,
        current: c.id === actor.id,
      })),
      adults: adults.map((m) => ({ id: m.id, displayName: m.display_name })),
    });
  }

  createInvitation(
    home: string,
    token: string,
    member: string,
    requestId: string,
    purpose: 'connect' | 'recover-owner' = 'connect',
  ): PhoneInvitationReveal {
    return this.db.transaction(() => {
      const actor = this.controller(home, token);
      this.adult(home, member);
      const replacing = purpose === 'recover-owner' ? this.recoveryInviter(home, actor) : null;
      if (replacing) this.requireRecentConfirmation(token);
      if (replacing && replacing.member_id !== member)
        throw new RepositoryError(
          'FORBIDDEN',
          'Recovery can replace only the existing owner phone.',
        );
      this.prune();
      if (
        this.db
          .prepare(
            'SELECT 1 FROM controller_phone_invitations WHERE household_id=? AND creator_connection_id=? AND request_id=?',
          )
          .get(home, actor.id, requestId)
      ) {
        throw new RepositoryError(
          'CONFLICT',
          'This QR was already created. Cancel it and create a new QR.',
        );
      }
      const count = this.db
        .prepare(
          'SELECT count(*) AS total, sum(creator_connection_id=? AND expires_at>? AND cancelled_at IS NULL AND consumed_at IS NULL) AS own FROM controller_phone_invitations WHERE household_id=?',
        )
        .get(actor.id, this.now().toISOString(), home) as { total: number; own: number | null };
      if (count.total >= 50 || (count.own ?? 0) >= 5)
        throw new RepositoryError('FORBIDDEN', 'Cancel an earlier QR before creating another.');
      const secret = randomBytes(32).toString('base64url');
      let code = createConnectionCode();
      let collisions = 0;
      while (
        this.db
          .prepare('SELECT 1 FROM controller_phone_invitation_codes WHERE code_hash=?')
          .get(hash(code))
      ) {
        if (++collisions >= 10)
          throw new RepositoryError(
            'INTEGRATION_UNAVAILABLE',
            'Try creating a new connection code.',
          );
        code = createConnectionCode();
      }
      const invite = id('phone_invitation');
      const expiry = new Date(this.now().getTime() + INVITATION_MS).toISOString();
      this.db
        .prepare(
          'INSERT INTO controller_phone_invitations (id,household_id,member_id,creator_connection_id,creator_session_hash,request_id,secret_hash,created_at,expires_at,purpose,replaces_connection_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          invite,
          home,
          member,
          actor.id,
          hash(token),
          requestId,
          hash(secret),
          this.now().toISOString(),
          expiry,
          purpose,
          replacing?.id ?? null,
        );
      this.db
        .prepare(
          'INSERT INTO controller_phone_invitation_codes (invitation_id,code_hash) VALUES (?,?)',
        )
        .run(invite, hash(code));
      this.audit(
        home,
        actor.member_id,
        purpose === 'connect' ? 'auth.phone.invite' : 'auth.phone.owner.recovery.invite',
        invite,
        requestId,
      );
      return {
        ...this.invitationState(this.invitation(invite)),
        qrUrl: `${this.configuration.origin}/#connect-phone=${secret}`,
        code,
      };
    })();
  }

  claimInvitation(
    secret: string,
    phoneName: string,
    address: string,
    pending: string | null,
    byCode = false,
  ): { state: PhoneInvitationState; pendingToken: string } {
    this.limit(address);
    if (byCode) {
      const now = this.now().getTime();
      if (this.codeAttempts.until <= now)
        this.codeAttempts = { count: 0, until: now + INVITATION_MS };
      if (++this.codeAttempts.count > 200)
        throw new RepositoryError(
          'FORBIDDEN',
          'Too many connection attempts. Try again in five minutes.',
        );
    }
    return this.db.transaction(() => {
      const row = this.db
        .prepare(
          byCode
            ? 'SELECT invitation_id AS id FROM controller_phone_invitation_codes WHERE code_hash=?'
            : 'SELECT id FROM controller_phone_invitations WHERE secret_hash=?',
        )
        .get(hash(secret)) as { id: string } | undefined;
      if (!row)
        throw new RepositoryError(
          'FORBIDDEN',
          'This connection code or QR is unavailable. Ask for a new one.',
        );
      const invite = this.invitation(row.id);
      this.liveInvitation(invite);
      if (invite.claim_hash !== null) {
        if (pending === null || hash(pending) !== invite.claim_hash)
          throw new RepositoryError(
            'CONFLICT',
            'This QR has already been scanned. Ask for a new QR.',
          );
        return { state: this.invitationState(invite), pendingToken: pending };
      }
      const pendingToken = randomBytes(32).toString('base64url');
      this.db
        .prepare('UPDATE controller_phone_invitations SET claim_hash=?,phone_label=? WHERE id=?')
        .run(hash(pendingToken), phoneName, invite.id);
      return { state: this.invitationState(this.invitation(invite.id)), pendingToken };
    })();
  }

  pending(token: string | null): PhoneInvitationState | null {
    if (token === null) return null;
    const row = this.db
      .prepare('SELECT id FROM controller_phone_invitations WHERE claim_hash=?')
      .get(hash(token)) as { id: string } | undefined;
    return row ? this.invitationState(this.invitation(row.id)) : null;
  }

  readInvitation(home: string, token: string, inviteId: string): PhoneInvitationState {
    const invite = this.invitation(inviteId);
    this.assertInviter(home, token, invite);
    return this.invitationState(invite);
  }

  approve(
    home: string,
    token: string,
    inviteId: string,
    requestId: string,
    cancel = false,
  ): PhoneInvitationState {
    return this.db.transaction(() => {
      const invite = this.invitation(inviteId);
      const actor = this.assertInviter(home, token, invite);
      if (!cancel && invite.purpose === 'recover-owner') {
        const owner = this.recoveryInviter(home, actor);
        if (owner.id !== invite.replaces_connection_id)
          throw new RepositoryError(
            'CONFLICT',
            'The owner phone changed. Create a new recovery QR.',
          );
      }
      if (cancel) {
        if (invite.cancelled_at === null) {
          this.db
            .prepare('UPDATE controller_phone_invitations SET cancelled_at=? WHERE id=?')
            .run(this.now().toISOString(), inviteId);
          this.audit(home, actor.member_id, 'auth.phone.invitation.cancel', inviteId, requestId);
        }
      } else {
        this.liveInvitation(invite);
        if (invite.claim_hash === null)
          throw new RepositoryError('CONFLICT', 'Wait for the other phone to scan this QR.');
        if (invite.approved_at === null) {
          this.db
            .prepare('UPDATE controller_phone_invitations SET approved_at=? WHERE id=?')
            .run(this.now().toISOString(), inviteId);
          this.audit(home, actor.member_id, 'auth.phone.approve', inviteId, requestId);
        }
      }
      return this.invitationState(this.invitation(inviteId));
    })();
  }

  exchange(pendingToken: string | null, assertBrowser: () => void): SessionResult {
    if (pendingToken === null)
      throw new RepositoryError('UNAUTHENTICATED', 'Scan a QR on this phone first.');
    return this.db.transaction(() => {
      assertBrowser();
      this.prune();
      const row = this.db
        .prepare('SELECT id FROM controller_phone_invitations WHERE claim_hash=?')
        .get(hash(pendingToken)) as { id: string } | undefined;
      if (!row) throw new RepositoryError('UNAUTHENTICATED', 'Ask for a new QR.');
      const invite = this.invitation(row.id);
      this.liveInvitation(invite, true);
      return this.finishExchange(invite, pendingToken);
    })();
  }

  private finishExchange(invite: Invitation, pendingToken: string): SessionResult {
    // Verify the original inviter by its stored hash without reconstructing a raw credential.
    const live = this.db
      .prepare(
        `SELECT 1 FROM companion_sessions s JOIN controller_phone_connections c ON c.id=s.phone_connection_id AND c.member_id=s.member_id AND c.household_id=s.household_id JOIN members m ON m.id=s.member_id AND m.household_id=s.household_id LEFT JOIN passkey_credentials p ON p.credential_id=s.credential_id AND p.household_id=s.household_id AND p.member_id=s.member_id WHERE s.token_hash=? AND c.id=? AND s.household_id=? AND s.revoked_at IS NULL AND c.revoked_at IS NULL AND s.expires_at>? AND c.expires_at>? AND s.last_seen_at>? AND (s.credential_id IS NULL OR (p.credential_id IS NOT NULL AND p.revoked_at IS NULL)) AND m.archived_at IS NULL AND m.role='adult' AND EXISTS(SELECT 1 FROM json_each(m.capabilities_json) WHERE value='household.admin')`,
      )
      .get(
        invite.creator_session_hash,
        invite.creator_connection_id,
        invite.household_id,
        this.now().toISOString(),
        this.now().toISOString(),
        new Date(this.now().getTime() - PHONE_IDLE_MS).toISOString(),
      );
    if (!live)
      throw new RepositoryError(
        'FORBIDDEN',
        'The inviting phone is no longer connected. Ask another adult for a new QR.',
      );
    this.adult(invite.household_id, invite.member_id);
    if (invite.approved_at === null)
      throw new RepositoryError('CONFLICT', 'Waiting for approval on the inviting phone.');
    const proofHash = hash(pendingToken);
    if (invite.consumed_at !== null) {
      const receipt = this.exchanges.get(proofHash);
      if (!receipt)
        throw new RepositoryError('CONFLICT', 'The connection reply was lost. Ask for a new QR.');
      this.auth.session(receipt.token);
      return receipt;
    }
    let result: SessionResult;
    if (invite.purpose === 'recover-owner') {
      const creator = this.db
        .prepare(
          'SELECT c.id,c.household_id,c.member_id,c.label,c.source,c.expires_at,m.display_name FROM controller_phone_connections c JOIN members m ON m.id=c.member_id WHERE c.id=?',
        )
        .get(invite.creator_connection_id) as ConnectionActor;
      const owner = this.recoveryInviter(invite.household_id, creator);
      if (owner.id !== invite.replaces_connection_id || owner.member_id !== invite.member_id)
        throw new RepositoryError(
          'CONFLICT',
          'The owner phone changed. Ask for a new recovery QR.',
        );
      result = this.replaceOwner(
        invite.household_id,
        invite.member_id,
        invite.phone_label!,
        creator.member_id,
        invite.id,
      );
    } else result = this.issue(invite.household_id, invite.member_id, invite.phone_label!, 'qr');
    this.db
      .prepare(
        'UPDATE controller_phone_invitations SET consumed_at=?,issued_session_hash=? WHERE id=?',
      )
      .run(this.now().toISOString(), hash(result.token), invite.id);
    this.exchanges.set(proofHash, { ...result, until: Date.parse(invite.expires_at) });
    setTimeout(
      () => this.exchanges.delete(proofHash),
      Math.max(0, Date.parse(invite.expires_at) - this.now().getTime()),
    ).unref();
    return result;
  }

  remove(
    home: string,
    token: string,
    target: string,
    requestId: string,
  ): { removed: true; current: boolean } {
    return this.db.transaction(() => {
      const actor = this.controller(home, token);
      const row = this.db
        .prepare(
          'SELECT revoked_at,source FROM controller_phone_connections WHERE id=? AND household_id=?',
        )
        .get(target, home) as { revoked_at: string | null; source: string } | undefined;
      if (!row)
        throw new RepositoryError('NOT_FOUND', 'That phone connection is not in this household.');
      if (row.source === 'owner') throw new RepositoryError('FORBIDDEN', OWNER_PHONE_PROTECTED);
      if (row.revoked_at === null) {
        const now = this.now().toISOString();
        this.db
          .prepare('UPDATE controller_phone_connections SET revoked_at=? WHERE id=?')
          .run(now, target);
        this.db
          .prepare(
            'UPDATE companion_sessions SET revoked_at=? WHERE phone_connection_id=? AND revoked_at IS NULL',
          )
          .run(now, target);
        this.db
          .prepare(
            'UPDATE controller_phone_invitations SET cancelled_at=? WHERE creator_connection_id=? AND cancelled_at IS NULL',
          )
          .run(now, target);
        this.audit(home, actor.member_id, 'auth.phone.remove', target, requestId);
      }
      return { removed: true as const, current: actor.id === target };
    })();
  }

  confirm(token: string): { confirmed: true; expiresAt: string } {
    const session = this.auth.session(token);
    const actor = this.controller(session.householdId, token);
    this.db
      .prepare('UPDATE companion_sessions SET phone_confirmed_at=? WHERE token_hash=?')
      .run(this.now().toISOString(), hash(token));
    this.audit(session.householdId, actor.member_id, 'auth.phone.confirm', actor.id, null);
    return {
      confirmed: true,
      expiresAt: new Date(this.now().getTime() + 5 * 60_000).toISOString(),
    };
  }

  cookie(token: string, pending = false): string {
    const secure = this.configuration.secureCookie ? '; Secure' : '';
    return `${pending ? PHONE_PENDING_COOKIE : 'hearth_session'}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${pending ? 300 : Math.floor(SESSION_MS / 1000)}${secure}`;
  }

  recoverySummary(home: string, token: string): PhoneRecoverySummary {
    const actor = this.controller(home, token);
    const owner = this.ownerRecord(home);
    const trusted = owner ? this.trustedRecoveryConnections(home, owner.member_id) : [];
    const adults = this.db
      .prepare(
        "SELECT id,display_name FROM members WHERE household_id=? AND role='adult' AND archived_at IS NULL AND EXISTS(SELECT 1 FROM json_each(capabilities_json) WHERE value='household.admin') ORDER BY display_name LIMIT 100",
      )
      .all(home) as { id: string; display_name: string }[];
    return PhoneRecoverySummarySchema.parse({
      available: owner !== undefined,
      ownerName: owner?.display_name ?? null,
      canManage: owner?.id === actor.id,
      canRecoverOwner: Boolean(owner && actor.id !== owner.id && trusted.includes(actor.id)),
      hasRecoveryCard: Boolean(
        owner &&
        this.db
          .prepare(
            'SELECT 1 FROM controller_phone_recovery_cards WHERE household_id=? AND owner_connection_id=? AND activated_at IS NOT NULL AND consumed_at IS NULL AND revoked_at IS NULL',
          )
          .get(home, owner.id),
      ),
      adults: adults
        .map((adult) => {
          const phones = (
            this.db
              .prepare(
                'SELECT id,label FROM controller_phone_connections WHERE household_id=? AND member_id=? AND id<>? AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC LIMIT 100',
              )
              .all(home, adult.id, owner?.id ?? '', this.now().toISOString()) as {
              id: string;
              label: string;
            }[]
          )
            .filter((phone) => this.connectedRecoveryPhone(home, phone.id))
            .map((phone) => ({
              connectionId: phone.id,
              phoneName: phone.label,
              trusted: trusted.includes(phone.id),
            }));
          return {
            memberId: adult.id,
            displayName: adult.display_name,
            connected: phones.length > 0,
            trusted: phones.some((phone) => phone.trusted),
            phones,
          };
        })
        .filter((adult) => adult.memberId !== owner?.member_id || adult.phones.length > 0),
    });
  }

  updateRecoveryPolicy(
    home: string,
    token: string,
    requestId: string,
    trustedConnectionIds: string[],
  ): { accepted: true } {
    return this.db.transaction(() => {
      const owner = this.requireOwner(home, token, true);
      if (this.recoveryCommand(home, owner.id, requestId, 'policy', trustedConnectionIds))
        return { accepted: true as const };
      if (
        new Set(trustedConnectionIds).size !== trustedConnectionIds.length ||
        trustedConnectionIds.length > 20
      )
        throw new RepositoryError('VALIDATION_ERROR', 'Choose each recovery adult once.');
      for (const connection of trustedConnectionIds) {
        const phone = this.db
          .prepare(
            'SELECT member_id FROM controller_phone_connections WHERE id=? AND household_id=?',
          )
          .get(connection, home) as { member_id: string } | undefined;
        if (!phone || connection === owner.id || !this.connectedRecoveryPhone(home, connection))
          throw new RepositoryError(
            'FORBIDDEN',
            'Connect that adult’s own phone before trusting it for recovery.',
          );
        this.adult(home, phone.member_id);
      }
      this.ensureRecoveryPolicy(home, owner.member_id);
      this.db
        .prepare(
          'UPDATE controller_phone_recovery_policy SET trusted_connection_ids_json=?,updated_at=? WHERE household_id=?',
        )
        .run(JSON.stringify(trustedConnectionIds), this.now().toISOString(), home);
      this.recordRecoveryCommand(home, owner.id, requestId, 'policy', trustedConnectionIds);
      this.audit(home, owner.member_id, 'auth.phone.recovery.policy', owner.id, requestId);
      return { accepted: true as const };
    })();
  }

  createRecoveryCard(home: string, token: string, requestId: string): PhoneRecoveryCardReveal {
    return this.db.transaction(() => {
      const owner = this.requireOwner(home, token, true);
      this.limit(`recovery-card:${owner.id}`);
      this.prune();
      if (this.recoveryCommand(home, owner.id, requestId, 'card-create', null)) {
        const row = this.db
          .prepare(
            'SELECT * FROM controller_phone_recovery_cards WHERE household_id=? AND creator_connection_id=? AND request_id=?',
          )
          .get(home, owner.id, requestId) as RecoveryCard | undefined;
        const cached = row ? this.cardReveals.get(row.id) : undefined;
        if (
          !row ||
          !cached ||
          row.revoked_at ||
          row.activated_at ||
          cached.until <= this.now().getTime()
        )
          throw new RepositoryError(
            'CONFLICT',
            'That card reply is no longer available. Create a new card; your active card stays valid.',
          );
        return {
          id: cached.id,
          generation: cached.generation,
          qrUrl: cached.qrUrl,
          expiresAt: cached.expiresAt,
        };
      }
      this.ensureRecoveryPolicy(home, owner.member_id);
      const generation =
        (
          this.db
            .prepare(
              'SELECT code_generation FROM controller_phone_recovery_policy WHERE household_id=?',
            )
            .get(home) as { code_generation: number }
        ).code_generation + 1;
      this.db
        .prepare(
          'UPDATE controller_phone_recovery_policy SET code_generation=?,updated_at=? WHERE household_id=?',
        )
        .run(generation, this.now().toISOString(), home);
      // Replacing an unsaved preview never revokes the currently saved card.
      this.db
        .prepare(
          'UPDATE controller_phone_recovery_cards SET revoked_at=? WHERE household_id=? AND activated_at IS NULL AND revoked_at IS NULL',
        )
        .run(this.now().toISOString(), home);
      const cardId = id('phone_recovery_card');
      const secret = randomBytes(32).toString('base64url');
      const expiresAt = new Date(this.now().getTime() + INVITATION_MS).toISOString();
      this.db
        .prepare(
          'INSERT INTO controller_phone_recovery_cards (id,household_id,member_id,owner_connection_id,creator_connection_id,request_id,generation,secret_hash,created_at,pending_expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          cardId,
          home,
          owner.member_id,
          owner.id,
          owner.id,
          requestId,
          generation,
          hash(secret),
          this.now().toISOString(),
          expiresAt,
        );
      const result = {
        id: cardId,
        generation,
        qrUrl: `${this.configuration.origin}/#recover-phone=${secret}`,
        expiresAt,
      };
      this.recordRecoveryCommand(home, owner.id, requestId, 'card-create', null);
      this.audit(home, owner.member_id, 'auth.phone.recovery.card.prepare', cardId, requestId);
      this.cardReveals.set(cardId, { ...result, until: Date.parse(expiresAt) });
      setTimeout(() => this.cardReveals.delete(cardId), INVITATION_MS).unref();
      return result;
    })();
  }

  activateRecoveryCard(
    home: string,
    token: string,
    cardId: string,
    requestId: string,
  ): { accepted: true } {
    const result = this.db.transaction(() => {
      const owner = this.requireOwner(home, token, false);
      if (this.recoveryCommand(home, owner.id, requestId, 'card-activate', cardId))
        return { accepted: true as const };
      const card = this.db
        .prepare('SELECT * FROM controller_phone_recovery_cards WHERE id=? AND household_id=?')
        .get(cardId, home) as RecoveryCard | undefined;
      if (
        !card ||
        card.creator_connection_id !== owner.id ||
        card.owner_connection_id !== owner.id ||
        card.revoked_at ||
        card.consumed_at ||
        Date.parse(card.pending_expires_at) <= this.now().getTime()
      )
        throw new RepositoryError(
          'CONFLICT',
          'That card preview expired. Create and save a new card.',
        );
      const now = this.now().toISOString();
      this.db
        .prepare(
          'UPDATE controller_phone_recovery_cards SET revoked_at=? WHERE household_id=? AND id<>? AND activated_at IS NOT NULL AND consumed_at IS NULL AND revoked_at IS NULL',
        )
        .run(now, home, cardId);
      this.db
        .prepare('UPDATE controller_phone_recovery_cards SET activated_at=? WHERE id=?')
        .run(now, cardId);
      this.recordRecoveryCommand(home, owner.id, requestId, 'card-activate', cardId);
      this.audit(home, owner.member_id, 'auth.phone.recovery.card.activate', cardId, requestId);
      return { accepted: true as const };
    })();
    this.cardReveals.delete(cardId);
    return result;
  }

  createOwnerRecoveryInvitation(
    home: string,
    token: string,
    requestId: string,
  ): PhoneInvitationReveal {
    const actor = this.controller(home, token);
    const owner = this.recoveryInviter(home, actor);
    this.requireRecentConfirmation(token);
    return this.createInvitation(home, token, owner.member_id, requestId, 'recover-owner');
  }

  recoverWithCard(
    input: PhoneRecoveryClaim,
    address: string,
    browserContext: string,
    assertBrowser: () => void,
    currentToken: string | null = null,
  ): SessionResult {
    this.limit(address);
    const contextHash = hash(browserContext);
    const result = this.db.transaction(() => {
      assertBrowser();
      this.prune();
      const card = this.db
        .prepare('SELECT * FROM controller_phone_recovery_cards WHERE secret_hash=?')
        .get(hash(input.recoverySecret)) as RecoveryCard | undefined;
      if (!card || card.revoked_at || !card.activated_at)
        throw new RepositoryError(
          'FORBIDDEN',
          'That recovery card was not accepted. Use your saved active card or ask a trusted adult.',
        );
      const receiptKey = `recovery:${card.id}:${contextHash}:${input.requestId}`;
      if (card.consumed_at) {
        if (
          card.claim_context_hash !== contextHash ||
          card.claim_request_id !== input.requestId ||
          card.claim_phone_name !== input.phoneName
        )
          throw new RepositoryError('CONFLICT', 'That recovery card has already been used.');
        const receipt = this.exchanges.get(receiptKey);
        if (!receipt)
          throw new RepositoryError(
            'CONFLICT',
            'The recovery reply was lost. Ask a trusted adult or use private backend recovery.',
          );
        this.auth.session(receipt.token);
        if (currentToken !== null && currentToken !== receipt.token)
          throw new RepositoryError(
            'CONFLICT',
            'This phone is already connected to another account. Keep that connection and use the replacement phone.',
          );
        return { session: receipt.session, token: receipt.token };
      }
      if (currentToken !== null)
        throw new RepositoryError(
          'CONFLICT',
          'This phone is already connected. Use the replacement phone to recover access.',
        );
      const owner = this.ownerRecord(card.household_id);
      if (!owner || owner.id !== card.owner_connection_id || owner.member_id !== card.member_id)
        throw new RepositoryError(
          'FORBIDDEN',
          'That recovery card belongs to an earlier owner phone.',
        );
      this.adult(card.household_id, card.member_id);
      this.db
        .prepare(
          'UPDATE controller_phone_recovery_cards SET consumed_at=?,claim_context_hash=?,claim_request_id=?,claim_phone_name=? WHERE id=?',
        )
        .run(this.now().toISOString(), contextHash, input.requestId, input.phoneName, card.id);
      const issued = this.replaceOwner(
        card.household_id,
        card.member_id,
        input.phoneName,
        card.member_id,
        null,
      );
      this.audit(
        card.household_id,
        card.member_id,
        'auth.phone.owner.recovery.card',
        card.id,
        input.requestId,
      );
      return issued;
    })();
    const cardId = (
      this.db
        .prepare('SELECT id FROM controller_phone_recovery_cards WHERE secret_hash=?')
        .get(hash(input.recoverySecret)) as { id: string }
    ).id;
    const receiptKey = `recovery:${cardId}:${contextHash}:${input.requestId}`;
    if (!this.exchanges.has(receiptKey)) {
      this.exchanges.set(receiptKey, { ...result, until: this.now().getTime() + INVITATION_MS });
      setTimeout(() => this.exchanges.delete(receiptKey), INVITATION_MS).unref();
    }
    return result;
  }

  private ownerRecord(home: string): ConnectionActor | undefined {
    return this.db
      .prepare(
        "SELECT c.id,c.household_id,c.member_id,c.label,c.source,c.expires_at,m.display_name FROM controller_phone_connections c JOIN members m ON m.id=c.member_id AND m.household_id=c.household_id WHERE c.household_id=? AND c.source='owner' AND c.revoked_at IS NULL",
      )
      .get(home) as ConnectionActor | undefined;
  }
  private requireOwner(home: string, token: string, recent: boolean): ConnectionActor {
    const actor = this.controller(home, token);
    if (actor.source !== 'owner' || this.ownerRecord(home)?.id !== actor.id)
      throw new RepositoryError('FORBIDDEN', 'Only the owner phone can manage recovery.');
    if (recent) this.requireRecentConfirmation(token);
    return actor;
  }
  private connectedRecoveryPhone(home: string, connection: string): boolean {
    return Boolean(
      this.db
        .prepare(
          'SELECT 1 FROM controller_phone_connections c JOIN companion_sessions s ON s.phone_connection_id=c.id AND s.household_id=c.household_id AND s.member_id=c.member_id LEFT JOIN passkey_credentials p ON p.credential_id=s.credential_id AND p.household_id=s.household_id AND p.member_id=s.member_id WHERE c.household_id=? AND c.id=? AND c.revoked_at IS NULL AND c.expires_at>? AND s.revoked_at IS NULL AND s.expires_at>? AND s.last_seen_at>? AND (s.credential_id IS NULL OR (p.credential_id IS NOT NULL AND p.revoked_at IS NULL))',
        )
        .get(
          home,
          connection,
          this.now().toISOString(),
          this.now().toISOString(),
          new Date(this.now().getTime() - PHONE_IDLE_MS).toISOString(),
        ),
    );
  }
  private requireRecentConfirmation(token: string): void {
    if (!this.auth.assertRecentAuthentication)
      throw new RepositoryError(
        'INTEGRATION_UNAVAILABLE',
        'Connected-phone confirmation is unavailable.',
      );
    this.auth.assertRecentAuthentication(token, INVITATION_MS);
  }
  private trustedRecoveryConnections(home: string, ownerMember: string): string[] {
    const row = this.db
      .prepare(
        'SELECT trusted_connection_ids_json FROM controller_phone_recovery_policy WHERE household_id=? AND owner_member_id=?',
      )
      .get(home, ownerMember) as { trusted_connection_ids_json: string } | undefined;
    const value: unknown = row ? JSON.parse(row.trusted_connection_ids_json) : [];
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, 20)
      : [];
  }
  private ensureRecoveryPolicy(home: string, ownerMember: string): void {
    this.db
      .prepare(
        "INSERT INTO controller_phone_recovery_policy (household_id,owner_member_id,updated_at) VALUES (?,?,?) ON CONFLICT(household_id) DO UPDATE SET owner_member_id=excluded.owner_member_id, trusted_connection_ids_json=CASE WHEN owner_member_id=excluded.owner_member_id THEN trusted_connection_ids_json ELSE '[]' END, updated_at=excluded.updated_at",
      )
      .run(home, ownerMember, this.now().toISOString());
  }
  private recoveryInviter(home: string, actor: ConnectionActor): ConnectionActor {
    const owner = this.ownerRecord(home);
    this.adult(home, actor.member_id);
    if (
      !owner ||
      owner.id === actor.id ||
      !this.trustedRecoveryConnections(home, owner.member_id).includes(actor.id)
    )
      throw new RepositoryError(
        'FORBIDDEN',
        'This phone is not trusted to recover the owner phone.',
      );
    this.adult(home, owner.member_id);
    return owner;
  }
  private recoveryCommand(
    home: string,
    connection: string,
    requestId: string,
    action: string,
    payload: unknown,
  ): boolean {
    const row = this.db
      .prepare(
        'SELECT action,payload_hash FROM controller_phone_recovery_commands WHERE household_id=? AND connection_id=? AND request_id=?',
      )
      .get(home, connection, requestId) as { action: string; payload_hash: string } | undefined;
    if (!row) return false;
    if (row.action !== action || row.payload_hash !== hash(JSON.stringify(payload)))
      throw new RepositoryError(
        'CONFLICT',
        'That request was already used for a different recovery action.',
      );
    return true;
  }
  private recordRecoveryCommand(
    home: string,
    connection: string,
    requestId: string,
    action: string,
    payload: unknown,
  ): void {
    this.db
      .prepare(
        'INSERT INTO controller_phone_recovery_commands (household_id,connection_id,request_id,action,payload_hash,created_at) VALUES (?,?,?,?,?,?)',
      )
      .run(
        home,
        connection,
        requestId,
        action,
        hash(JSON.stringify(payload)),
        this.now().toISOString(),
      );
  }
  private replaceOwner(
    home: string,
    member: string,
    label: string,
    actorMember: string,
    exceptInvite: string | null,
  ): SessionResult {
    const previous = this.db
      .prepare(
        "SELECT id FROM controller_phone_connections WHERE household_id=? AND source='owner' AND revoked_at IS NULL",
      )
      .all(home) as { id: string }[];
    const now = this.now().toISOString();
    for (const connection of previous) {
      this.db
        .prepare('UPDATE controller_phone_connections SET revoked_at=? WHERE id=?')
        .run(now, connection.id);
      this.db
        .prepare(
          'UPDATE companion_sessions SET revoked_at=? WHERE phone_connection_id=? AND revoked_at IS NULL',
        )
        .run(now, connection.id);
      this.db
        .prepare(
          'UPDATE controller_phone_invitations SET cancelled_at=? WHERE creator_connection_id=? AND cancelled_at IS NULL',
        )
        .run(now, connection.id);
      this.audit(home, actorMember, 'auth.phone.owner.replace', connection.id, null);
    }
    this.db
      .prepare(
        'UPDATE controller_phone_recovery_cards SET revoked_at=? WHERE household_id=? AND consumed_at IS NULL AND revoked_at IS NULL',
      )
      .run(now, home);
    this.db
      .prepare(
        'UPDATE controller_phone_owner_grants SET revoked_at=? WHERE household_id=? AND consumed_at IS NULL AND revoked_at IS NULL',
      )
      .run(now, home);
    this.db
      .prepare(
        "UPDATE controller_phone_invitations SET cancelled_at=? WHERE household_id=? AND purpose='recover-owner' AND consumed_at IS NULL AND cancelled_at IS NULL AND (? IS NULL OR id<>?)",
      )
      .run(now, home, exceptInvite, exceptInvite);
    this.ensureRecoveryPolicy(home, member);
    return this.issue(home, member, label, 'owner');
  }

  private controller(home: string, token: string): ConnectionActor {
    const session = this.auth.session(token);
    if (session.householdId !== home)
      throw new RepositoryError('FORBIDDEN', 'This phone cannot manage that household.');
    this.adult(home, session.memberId);
    const source = this.db
      .prepare(
        'SELECT phone_connection_id,created_at,last_seen_at,expires_at FROM companion_sessions WHERE token_hash=?',
      )
      .get(hash(token)) as {
      phone_connection_id: string | null;
      created_at: string;
      last_seen_at: string;
      expires_at: string;
    };
    if (source.phone_connection_id === null) {
      const connection = id('phone');
      this.db
        .prepare(
          "INSERT INTO controller_phone_connections (id,household_id,member_id,label,source,created_at,last_seen_at,expires_at) VALUES (?,?,?,'Earlier browser','legacy',?,?,?)",
        )
        .run(
          connection,
          home,
          session.memberId,
          source.created_at,
          source.last_seen_at,
          source.expires_at,
        );
      this.db
        .prepare('UPDATE companion_sessions SET phone_connection_id=? WHERE token_hash=?')
        .run(connection, hash(token));
    }
    return this.db
      .prepare(
        'SELECT c.id,c.household_id,c.member_id,c.label,c.source,c.expires_at,m.display_name FROM companion_sessions s JOIN controller_phone_connections c ON c.id=s.phone_connection_id JOIN members m ON m.id=c.member_id WHERE s.token_hash=?',
      )
      .get(hash(token)) as ConnectionActor;
  }

  approvalReference(home: string, token: string): PhoneApprovalReference {
    const actor = this.controller(home, token);
    return {
      householdId: home,
      memberId: actor.member_id,
      connectionId: actor.id,
      sessionHash: hash(token),
    };
  }

  /** Recheck the exact approving phone/session immediately before granting machine authority. */
  assertApprovalReference(reference: PhoneApprovalReference): void {
    const live = this.db
      .prepare(
        `SELECT 1 FROM companion_sessions s
      JOIN controller_phone_connections c ON c.id=s.phone_connection_id AND c.member_id=s.member_id AND c.household_id=s.household_id
      JOIN members m ON m.id=c.member_id AND m.household_id=c.household_id
      LEFT JOIN passkey_credentials p ON p.credential_id=s.credential_id
      WHERE s.token_hash=? AND c.id=? AND s.household_id=? AND m.id=?
      AND s.revoked_at IS NULL AND c.revoked_at IS NULL AND s.expires_at>? AND c.expires_at>? AND s.last_seen_at>?
      AND (s.credential_id IS NULL OR (p.credential_id IS NOT NULL AND p.revoked_at IS NULL))
      AND m.archived_at IS NULL AND m.role='adult'
      AND EXISTS(SELECT 1 FROM json_each(m.capabilities_json) WHERE value='household.admin')`,
      )
      .get(
        reference.sessionHash,
        reference.connectionId,
        reference.householdId,
        reference.memberId,
        this.now().toISOString(),
        this.now().toISOString(),
        new Date(this.now().getTime() - PHONE_IDLE_MS).toISOString(),
      );
    if (!live)
      throw new RepositoryError(
        'FORBIDDEN',
        'The approving phone is no longer connected. Start again.',
      );
  }

  private adult(home: string, member: string): void {
    const row = this.db
      .prepare(
        "SELECT 1 FROM members WHERE id=? AND household_id=? AND role='adult' AND archived_at IS NULL AND EXISTS(SELECT 1 FROM json_each(capabilities_json) WHERE value='household.admin')",
      )
      .get(member, home);
    if (!row)
      throw new RepositoryError(
        'FORBIDDEN',
        'Choose an adult with household controller permission.',
      );
  }

  private issue(
    home: string,
    member: string,
    label: string,
    source: 'owner' | 'qr',
  ): SessionResult {
    this.adult(home, member);
    const now = this.now().toISOString();
    const count = this.db
      .prepare(
        'SELECT count(*) AS total FROM controller_phone_connections WHERE household_id=? AND revoked_at IS NULL AND expires_at>?',
      )
      .get(home, now) as { total: number };
    // A private owner-issued recovery grant must still work when lost phones fill the QR cap.
    if (source === 'qr' && count.total >= 20)
      throw new RepositoryError('FORBIDDEN', 'Remove an unused phone connection first.');
    const connection = id('phone');
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(this.now().getTime() + SESSION_MS).toISOString();
    this.db
      .prepare(
        'INSERT INTO controller_phone_connections (id,household_id,member_id,label,source,created_at,last_seen_at,expires_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(connection, home, member, label, source, now, now, expires);
    this.db
      .prepare(
        'INSERT INTO companion_sessions (token_hash,household_id,member_id,created_at,last_seen_at,expires_at,phone_connection_id) VALUES (?,?,?,?,?,?,?)',
      )
      .run(hash(token), home, member, now, now, expires, connection);
    this.audit(home, member, 'auth.phone.connect', connection, null);
    return {
      token,
      session: PasskeySessionSchema.parse({
        authenticated: true,
        householdId: home,
        memberId: member,
        displayName: (
          this.db.prepare('SELECT display_name FROM members WHERE id=?').get(member) as {
            display_name: string;
          }
        ).display_name,
        expiresAt: expires,
      }),
    };
  }

  private invitation(inviteId: string): Invitation {
    const row = this.db
      .prepare(
        'SELECT i.*,m.display_name FROM controller_phone_invitations i JOIN members m ON m.id=i.member_id AND m.household_id=i.household_id WHERE i.id=?',
      )
      .get(inviteId) as Invitation | undefined;
    if (!row) throw new RepositoryError('NOT_FOUND', 'This phone request is not available.');
    return row;
  }
  private assertInviter(home: string, token: string, invite: Invitation): ConnectionActor {
    const actor = this.controller(home, token);
    if (
      invite.household_id !== home ||
      invite.creator_connection_id !== actor.id ||
      invite.creator_session_hash !== hash(token)
    )
      throw new RepositoryError('FORBIDDEN', 'Open this request on the inviting phone.');
    return actor;
  }
  private liveInvitation(invite: Invitation, replay = false): void {
    if (
      invite.cancelled_at !== null ||
      Date.parse(invite.expires_at) <= this.now().getTime() ||
      (!replay && invite.consumed_at !== null)
    )
      throw new RepositoryError('CONFLICT', 'This QR has expired or was used. Ask for a new QR.');
  }
  private invitationState(invite: Invitation): PhoneInvitationState {
    const state =
      invite.cancelled_at !== null
        ? 'cancelled'
        : invite.consumed_at !== null
          ? 'connected'
          : Date.parse(invite.expires_at) <= this.now().getTime()
            ? 'expired'
            : invite.approved_at !== null
              ? 'approved'
              : invite.claim_hash !== null
                ? 'scanned'
                : 'waiting';
    return PhoneInvitationStateSchema.parse({
      id: invite.id,
      state,
      adultName: invite.display_name,
      phoneName: invite.phone_label,
      expiresAt: invite.expires_at,
      ...(invite.purpose === 'recover-owner' ? { purpose: invite.purpose } : {}),
    });
  }
  private limit(address: string): void {
    const now = this.now().getTime();
    for (const [key, v] of this.attempts) if (v.until <= now) this.attempts.delete(key);
    const key = address.slice(0, 128);
    const current = this.attempts.get(key);
    if ((current?.count ?? 0) >= 20 || (!current && this.attempts.size >= 512))
      throw new RepositoryError(
        'FORBIDDEN',
        'Too many connection attempts. Try again in five minutes.',
      );
    this.attempts.set(key, {
      count: (current?.count ?? 0) + 1,
      until: current?.until ?? now + INVITATION_MS,
    });
  }
  private prune(): void {
    const now = this.now().getTime();
    for (const [key, v] of this.exchanges) if (v.until <= now) this.exchanges.delete(key);
    for (const [key, v] of this.cardReveals) if (v.until <= now) this.cardReveals.delete(key);
    this.db
      .prepare('DELETE FROM controller_phone_invitations WHERE expires_at<?')
      .run(new Date(now - 10 * 60_000).toISOString());
  }
  private audit(
    home: string,
    member: string,
    action: AuditSummary['action'],
    target: string,
    requestId: string | null,
  ): void {
    this.db
      .prepare(
        "INSERT INTO audit_events (id,occurred_at,household_id,actor_type,actor_id,source_channel,action_type,target_type,target_id,request_id,result,safe_summary_json) VALUES (?,?,?,'member',?,'companion',?,'phone_connection',?,?,'succeeded','{}')",
      )
      .run(id('audit'), this.now().toISOString(), home, member, action, target, requestId);
  }
  assertOrigin(origin: unknown, site: unknown): void {
    if (
      origin !== this.configuration.origin ||
      (typeof site === 'string' && site !== 'same-origin' && site !== 'none')
    )
      throw new RepositoryError('FORBIDDEN', 'Connect from the trusted private Hearth address.');
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '_')}`;
}
