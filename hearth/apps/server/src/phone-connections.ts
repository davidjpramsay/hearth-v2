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
} from '@hearth/shared';
import type { CompanionAuthConfiguration, CompanionAuthRepository } from './companion-auth.js';
import { RepositoryError } from './repository.js';
import { OWNER_PHONE_PROTECTED } from './owner-phone.js';

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
}

export class PhoneConnectionService {
  private readonly now: () => Date;
  private readonly attempts = new Map<string, { count: number; until: number }>();
  // Only a short process-local retry receipt holds a raw cookie, never SQLite or logs.
  private readonly exchanges = new Map<string, SessionResult & { until: number }>();
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
      const previous = this.db
        .prepare(
          "SELECT id FROM controller_phone_connections WHERE household_id=? AND source='owner' AND revoked_at IS NULL",
        )
        .all(grant.household_id) as { id: string }[];
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
        this.audit(
          grant.household_id,
          grant.member_id,
          'auth.phone.owner.replace',
          connection.id,
          null,
        );
      }
      const result = this.issue(grant.household_id, grant.member_id, input.phoneName, 'owner');
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
  ): PhoneInvitationReveal {
    return this.db.transaction(() => {
      const actor = this.controller(home, token);
      this.adult(home, member);
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
      const invite = id('phone_invitation');
      const expiry = new Date(this.now().getTime() + INVITATION_MS).toISOString();
      this.db
        .prepare(
          'INSERT INTO controller_phone_invitations (id,household_id,member_id,creator_connection_id,creator_session_hash,request_id,secret_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)',
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
        );
      this.audit(home, actor.member_id, 'auth.phone.invite', invite, requestId);
      return {
        ...this.invitationState(this.invitation(invite)),
        qrUrl: `${this.configuration.origin}/#connect-phone=${secret}`,
      };
    })();
  }

  claimInvitation(
    secret: string,
    phoneName: string,
    address: string,
    pending: string | null,
  ): { state: PhoneInvitationState; pendingToken: string } {
    this.limit(address);
    return this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT id FROM controller_phone_invitations WHERE secret_hash=?')
        .get(hash(secret)) as { id: string } | undefined;
      if (!row)
        throw new RepositoryError('FORBIDDEN', 'This QR is not available. Ask for a new QR.');
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
    const result = this.issue(invite.household_id, invite.member_id, invite.phone_label!, 'qr');
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
        'SELECT c.id,c.household_id,c.member_id,c.label,c.expires_at,m.display_name FROM companion_sessions s JOIN controller_phone_connections c ON c.id=s.phone_connection_id JOIN members m ON m.id=c.member_id WHERE s.token_hash=?',
      )
      .get(hash(token)) as ConnectionActor;
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
    this.db
      .prepare('DELETE FROM controller_phone_invitations WHERE expires_at<?')
      .run(new Date(now - 10 * 60_000).toISOString());
  }
  private audit(
    home: string,
    member: string,
    action: string,
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
