import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanionAuthService, type CompanionAuthConfiguration } from './companion-auth.js';
import { PhoneConnectionService, PHONE_IDLE_MS } from './phone-connections.js';
import { applyMigrations } from './database.js';
import { buildServer } from './app.js';
import { SqliteAdminRepository } from './admin-repository.js';
import { FixedClock } from './runtime-context.js';

const databases: Database.Database[] = [];
const servers: ReturnType<typeof buildServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  for (const db of databases.splice(0)) db.close();
});
const key = 'fixture_owner_key_0123456789abcdef0123456789abcdef';
const origin = 'https://hearth.example.test';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
async function harness() {
  const db = new Database(':memory:');
  databases.push(db);
  applyMigrations(db);
  let instant = Date.parse('2026-10-12T00:00:00.000Z');
  const consume = vi.fn(async () => undefined);
  const config: CompanionAuthConfiguration = {
    mode: 'private',
    rpId: 'hearth.example.test',
    origin,
    secureCookie: true,
    readFirstUseCode: async () => key,
    consumeFirstUseCode: consume,
    now: () => new Date(instant),
  };
  const auth = new CompanionAuthService(db, config);
  const phones = new PhoneConnectionService(db, auth, config);
  const first = await phones.ownerClaim(
    {
      ownerKey: key,
      phoneName: 'David’s iPhone',
      householdName: 'Test household',
      adultName: 'David',
      timezone: 'Australia/Perth',
    },
    'local',
    () => undefined,
  );
  const home = first.session.householdId;
  db.prepare(
    "INSERT INTO members (id,household_id,display_name,colour,avatar_key,role,created_at,updated_at,capabilities_json) VALUES ('member_rachael',?,'Rachael','#2f766d','/brand/hearth-mark.png','adult',?,?,?)",
  ).run(
    home,
    new Date(instant).toISOString(),
    new Date(instant).toISOString(),
    JSON.stringify(['household.admin', 'household.view']),
  );
  return {
    db,
    phones,
    auth,
    config,
    first,
    home,
    consume,
    advance: (ms: number) => {
      instant += ms;
    },
    now: () => new Date(instant),
  };
}
async function invited(h: Awaited<ReturnType<typeof harness>>) {
  const invite = h.phones.createInvitation(
    h.home,
    h.first.token,
    'member_rachael',
    'request_phone_test',
  );
  const secret = new URL(invite.qrUrl).hash.slice('#connect-phone='.length);
  const claim = h.phones.claimInvitation(secret, 'Rachael’s iPhone', 'other', null);
  return { invite, secret, claim };
}
async function secondary(h: Awaited<ReturnType<typeof harness>>) {
  const { invite, claim } = await invited(h);
  h.phones.approve(h.home, h.first.token, invite.id, 'request_approve');
  return h.phones.exchange(claim.pendingToken, () => undefined);
}
function ownerGrant(
  h: Awaited<ReturnType<typeof harness>>,
  ownerKey: string,
  member = h.first.session.memberId,
) {
  h.db
    .prepare(
      'INSERT INTO controller_phone_owner_grants (id,household_id,member_id,key_hash,created_at,expires_at) VALUES (?,?,?,?,?,?)',
    )
    .run(
      'phone_owner_fixture',
      h.home,
      member,
      digest(ownerKey),
      h.now().toISOString(),
      new Date(h.now().getTime() + 900_000).toISOString(),
    );
}

describe('owner-key and QR-approved adult phones', () => {
  it('bootstraps atomically with no passkey and consumes the setup file', async () => {
    const h = await harness();
    expect(h.consume).toHaveBeenCalledOnce();
    expect(h.db.prepare('SELECT count(*) AS total FROM passkey_credentials').get()).toEqual({
      total: 0,
    });
    expect(h.auth.session(h.first.token).displayName).toBe('David');
    await expect(
      h.phones.ownerClaim({ ownerKey: key, phoneName: 'Duplicate' }, 'local', () => undefined),
    ).rejects.toThrow(/not accepted/);
    expect(h.db.prepare('SELECT count(*) AS total FROM households').get()).toEqual({ total: 1 });
    expect(JSON.stringify(h.db.prepare('SELECT * FROM companion_sessions').all())).not.toContain(
      h.first.token,
    );
  });
  it('approval and exchange leave David unchanged and create independent Rachael access', async () => {
    const h = await harness();
    const { invite, claim, secret } = await invited(h);
    expect(h.phones.pending(claim.pendingToken)?.state).toBe('scanned');
    expect(() => h.phones.exchange(claim.pendingToken, () => undefined)).toThrow(
      /Waiting for approval/,
    );
    h.phones.approve(h.home, h.first.token, invite.id, 'request_approve');
    const second = h.phones.exchange(claim.pendingToken, () => undefined);
    expect(h.auth.session(h.first.token).displayName).toBe('David');
    expect(h.auth.session(second.token).displayName).toBe('Rachael');
    expect(h.phones.exchange(claim.pendingToken, () => undefined).token).toBe(second.token);
    expect(h.db.prepare('SELECT count(*) AS total FROM companion_sessions').get()).toEqual({
      total: 2,
    });
    const stored = JSON.stringify(h.db.prepare('SELECT * FROM controller_phone_invitations').all());
    for (const sensitive of [secret, claim.pendingToken, second.token])
      expect(stored).not.toContain(sensitive);
  });
  it('rejects a second browser claiming the same QR, but supports the original browser retry', async () => {
    const h = await harness();
    const { secret, claim } = await invited(h);
    expect(() => h.phones.claimInvitation(secret, 'Other', 'other2', null)).toThrow(
      /already been scanned/,
    );
    expect(
      h.phones.claimInvitation(secret, 'Rachael’s iPhone', 'other', claim.pendingToken)
        .pendingToken,
    ).toBe(claim.pendingToken);
    expect(() => h.phones.exchange('not_the_pending_cookie', () => undefined)).toThrow(/new QR/);
  });
  it.each(['expiry', 'cancellation', 'target-demotion'] as const)(
    'rejects exchange after %s',
    async (reason) => {
      const h = await harness();
      const { invite, claim } = await invited(h);
      h.phones.approve(h.home, h.first.token, invite.id, 'request_approve');
      if (reason === 'expiry') h.advance(5 * 60_000);
      if (reason === 'cancellation')
        h.phones.approve(h.home, h.first.token, invite.id, 'request_cancel', true);
      if (reason === 'target-demotion')
        h.db.prepare("UPDATE members SET role='child' WHERE id='member_rachael'").run();
      expect(() => h.phones.exchange(claim.pendingToken, () => undefined)).toThrow();
      expect(h.db.prepare('SELECT count(*) AS total FROM companion_sessions').get()).toEqual({
        total: 1,
      });
    },
  );
  it.each(['remove', 'sign-out'] as const)(
    'rejects an invitation after its secondary inviter uses %s',
    async (reason) => {
      const h = await harness();
      const second = await secondary(h);
      const invite = h.phones.createInvitation(
        h.home,
        second.token,
        h.first.session.memberId,
        'request_qr_secondary',
      );
      const claim = h.phones.claimInvitation(
        new URL(invite.qrUrl).hash.slice('#connect-phone='.length),
        'David’s other browser',
        'third',
        null,
      );
      h.phones.approve(h.home, second.token, invite.id, 'request_approve_secondary');
      if (reason === 'sign-out') h.auth.signOut(second.token);
      else
        h.phones.remove(
          h.home,
          h.first.token,
          h.phones.list(h.home, second.token).connections.find((p) => p.current)!.id,
          'request_remove',
        );
      expect(() => h.phones.exchange(claim.pendingToken, () => undefined)).toThrow();
      expect(h.auth.session(h.first.token).displayName).toBe('David');
      expect(h.db.prepare('SELECT count(*) AS total FROM companion_sessions').get()).toEqual({
        total: 2,
      });
    },
  );
  it('rechecks browser access before creating any grant', async () => {
    const h = await harness();
    const { invite, claim } = await invited(h);
    h.phones.approve(h.home, h.first.token, invite.id, 'request_approve');
    expect(() =>
      h.phones.exchange(claim.pendingToken, () => {
        throw new Error('screen pairing won');
      }),
    ).toThrow(/screen pairing won/);
    expect(h.db.prepare('SELECT count(*) AS total FROM companion_sessions').get()).toEqual({
      total: 1,
    });
  });
  it('removes only the selected connection, including replayed sessions', async () => {
    const h = await harness();
    const { invite, claim } = await invited(h);
    h.phones.approve(h.home, h.first.token, invite.id, 'request_approve');
    const second = h.phones.exchange(claim.pendingToken, () => undefined);
    const target = h.phones
      .list(h.home, h.first.token)
      .connections.find((p) => p.memberId === 'member_rachael')!;
    expect(h.phones.remove(h.home, h.first.token, target.id, 'request_remove')).toEqual({
      removed: true,
      current: false,
    });
    expect(h.phones.remove(h.home, h.first.token, target.id, 'request_remove')).toEqual({
      removed: true,
      current: false,
    });
    expect(() => h.auth.session(second.token)).toThrow();
    expect(h.auth.session(h.first.token).displayName).toBe('David');
    expect(() => h.phones.exchange(claim.pendingToken, () => undefined)).toThrow();
    expect(
      h.db
        .prepare("SELECT count(*) AS total FROM audit_events WHERE action_type='auth.phone.remove'")
        .get(),
    ).toEqual({ total: 1 });
  });
  it('does not manufacture recent consent at enrollment and expires explicit consent', async () => {
    const h = await harness();
    expect(() => h.auth.assertRecentAuthentication(h.first.token, 300_000)).toThrow(/Confirm/);
    h.phones.confirm(h.first.token);
    expect(() => h.auth.assertRecentAuthentication(h.first.token, 300_000)).not.toThrow();
    h.advance(300_001);
    expect(() => h.auth.assertRecentAuthentication(h.first.token, 300_000)).toThrow(/Confirm/);
  });
  it('enforces idle and absolute session limits server-side', async () => {
    const h = await harness();
    h.advance(PHONE_IDLE_MS + 1);
    expect(() => h.auth.session(h.first.token)).toThrow();
  });
  it('caps active and retained invitations, including create/cancel amplification', async () => {
    const h = await harness();
    for (let i = 0; i < 5; i++)
      h.phones.createInvitation(h.home, h.first.token, 'member_rachael', `request_limit_${i}`);
    expect(() =>
      h.phones.createInvitation(h.home, h.first.token, 'member_rachael', 'request_limit_over'),
    ).toThrow(/earlier QR/);
    const ids = h.db.prepare('SELECT id FROM controller_phone_invitations').all() as {
      id: string;
    }[];
    for (const row of ids) h.phones.approve(h.home, h.first.token, row.id, 'request_cancel', true);
    for (let i = 5; i < 50; i++) {
      const v = h.phones.createInvitation(
        h.home,
        h.first.token,
        'member_rachael',
        `request_limit_${i}`,
      );
      h.phones.approve(h.home, h.first.token, v.id, 'request_cancel', true);
    }
    expect(() =>
      h.phones.createInvitation(h.home, h.first.token, 'member_rachael', 'request_retention_over'),
    ).toThrow();
    expect(
      h.db.prepare('SELECT count(*) AS total FROM controller_phone_invitations').get(),
    ).toEqual({ total: 50 });
  });
  it('uses a backend key to atomically replace only the owner and consume the key once', async () => {
    const h = await harness();
    const rachael = await secondary(h);
    const admin = new SqliteAdminRepository(h.db, { seedDemo: false });
    const screen = await admin.createPairing('Test TV', 'request_screen');
    const tv = await admin.approvePairing(
      h.home,
      h.first.session.memberId,
      screen.code,
      'request_screen_approve',
    );
    const outstanding = h.phones.createInvitation(
      h.home,
      h.first.token,
      'member_rachael',
      'request_outstanding',
    );
    const ownerKey = 'a'.repeat(64);
    ownerGrant(h, ownerKey);
    const second = await h.phones.ownerClaim(
      { ownerKey, phoneName: 'David replacement iPhone' },
      'local',
      () => undefined,
    );
    expect(h.auth.session(second.token).displayName).toBe('David');
    expect(h.auth.status(second.token).ownerPhone).toBe(true);
    expect(() => h.auth.session(h.first.token)).toThrow();
    expect(h.auth.session(rachael.token).displayName).toBe('Rachael');
    expect(() => h.phones.readInvitation(h.home, second.token, outstanding.id)).toThrow();
    expect(
      h.db
        .prepare('SELECT cancelled_at FROM controller_phone_invitations WHERE id=?')
        .get(outstanding.id),
    ).toEqual({ cancelled_at: h.now().toISOString() });
    expect(h.db.prepare('SELECT revoked_at FROM paired_devices WHERE id=?').get(tv.id)).toEqual({
      revoked_at: null,
    });
    expect(
      h.db
        .prepare(
          "SELECT count(*) AS total FROM controller_phone_connections WHERE source='owner' AND revoked_at IS NULL",
        )
        .get(),
    ).toEqual({ total: 1 });
    await expect(
      h.phones.ownerClaim({ ownerKey, phoneName: 'Duplicate' }, 'local', () => undefined),
    ).rejects.toThrow(/not accepted/);
  });
  it('never revokes the owner when an invalid key or interrupted browser proof is supplied', async () => {
    const h = await harness();
    const ownerKey = 'a'.repeat(64);
    ownerGrant(h, ownerKey);
    await expect(
      h.phones.ownerClaim(
        { ownerKey: 'b'.repeat(64), phoneName: 'Invalid' },
        'other',
        () => undefined,
      ),
    ).rejects.toThrow(/not accepted/);
    await expect(
      h.phones.ownerClaim({ ownerKey, phoneName: 'Interrupted' }, 'other', () => {
        throw new Error('screen pairing won');
      }),
    ).rejects.toThrow(/screen pairing won/);
    expect(h.auth.session(h.first.token).displayName).toBe('David');
    expect(h.db.prepare('SELECT consumed_at FROM controller_phone_owner_grants').get()).toEqual({
      consumed_at: null,
    });
  });
  it('rolls back replacement and key consumption when issuing the new owner fails', async () => {
    const h = await harness();
    const ownerKey = 'a'.repeat(64);
    ownerGrant(h, ownerKey);
    h.db.exec(
      "CREATE TRIGGER fixture_reject_owner BEFORE INSERT ON controller_phone_connections WHEN NEW.source='owner' BEGIN SELECT RAISE(ABORT,'fixture storage failure'); END;",
    );
    await expect(
      h.phones.ownerClaim({ ownerKey, phoneName: 'Interrupted' }, 'other', () => undefined),
    ).rejects.toThrow(/fixture storage failure/);
    expect(h.auth.session(h.first.token).displayName).toBe('David');
    expect(h.db.prepare('SELECT consumed_at FROM controller_phone_owner_grants').get()).toEqual({
      consumed_at: null,
    });
    expect(
      h.db
        .prepare(
          "SELECT count(*) AS total FROM audit_events WHERE action_type='auth.phone.owner.replace'",
        )
        .get(),
    ).toEqual({ total: 0 });
  });
  it('both adults and direct sign-out are refused removal of the owner phone', async () => {
    const h = await harness();
    const other = await secondary(h);
    const owner = h.phones.list(h.home, other.token).connections.find((p) => p.source === 'owner')!;
    for (const token of [h.first.token, other.token])
      expect(() => h.phones.remove(h.home, token, owner.id, 'request_forbidden')).toThrow(
        /owner phone is protected/,
      );
    expect(() => h.auth.signOut(h.first.token)).toThrow(/owner phone is protected/);
    expect(h.auth.session(h.first.token).displayName).toBe('David');
    expect(h.auth.session(other.token).displayName).toBe('Rachael');
    expect(
      h.db
        .prepare("SELECT count(*) AS total FROM audit_events WHERE action_type='auth.phone.remove'")
        .get(),
    ).toEqual({ total: 0 });
  });
  it('cannot bypass owner protection through People removal or demotion', async () => {
    const h = await harness();
    const other = await secondary(h);
    const admin = new SqliteAdminRepository(h.db, { seedDemo: false });
    const member = h.first.session.memberId;
    await expect(
      admin.archiveMember(h.home, member, other.session.memberId, 'request_archive'),
    ).rejects.toThrow(/owner phone is protected/);
    for (const role of ['adult', 'child'] as const)
      await expect(
        admin.updateMember(h.home, member, other.session.memberId, {
          requestId: 'request_demote',
          displayName: 'David',
          color: '#2f766d',
          role,
          administrator: false,
        }),
      ).rejects.toThrow(/owner phone is protected/);
    await expect(
      admin.updateMember(h.home, member, other.session.memberId, {
        requestId: 'request_safe_edit',
        displayName: 'David',
        color: '#227766',
        role: 'adult',
        administrator: true,
      }),
    ).resolves.toMatchObject({ displayName: 'David' });
    expect(h.auth.session(h.first.token).displayName).toBe('David');
  });
  it('restrictive shared-screen cleanup invalidates browser authority but never removes ownership', async () => {
    const h = await harness();
    const owner = h.phones.list(h.home, h.first.token).connections[0]!;
    h.auth.invalidateBrowserSession(h.first.token);
    expect(() => h.auth.session(h.first.token)).toThrow();
    expect(
      h.db.prepare('SELECT revoked_at FROM controller_phone_connections WHERE id=?').get(owner.id),
    ).toEqual({ revoked_at: null });
  });
  it('retains expired ownership and allows only a backend key to replace it', async () => {
    const h = await harness();
    const owner = h.phones.list(h.home, h.first.token).connections[0]!;
    h.advance(181 * 24 * 60 * 60_000);
    const ownerKey = 'a'.repeat(64);
    ownerGrant(h, ownerKey);
    expect(() => h.auth.signOut(h.first.token)).toThrow(/owner phone is protected/);
    const replacement = await h.phones.ownerClaim(
      { ownerKey, phoneName: 'Replacement' },
      'other',
      () => undefined,
    );
    expect(
      h.db.prepare('SELECT revoked_at FROM controller_phone_connections WHERE id=?').get(owner.id),
    ).toEqual({ revoked_at: h.now().toISOString() });
    expect(h.auth.status(replacement.token).ownerPhone).toBe(true);
  });
  it('HTTP rejects owner removal, sign-out, People bypasses and conversion into a screen', async () => {
    const h = await harness();
    const second = await secondary(h);
    const owner = h.phones
      .list(h.home, second.token)
      .connections.find((p) => p.source === 'owner')!;
    const admin = new SqliteAdminRepository(h.db, { seedDemo: false });
    const exchange = vi.spyOn(admin, 'exchangeTvPairing');
    const app = buildServer({
      logger: false,
      demoMode: false,
      companionAuth: h.auth,
      phoneConnections: h.phones,
      adminRepository: admin,
      runtime: {
        mode: 'private',
        householdId: h.home,
        clock: new FixedClock(h.now().toISOString()),
      },
    });
    servers.push(app);
    const root = `/api/v1/households/${h.home}`;
    const headers = { origin, cookie: h.phones.cookie(second.token).split(';')[0]! };
    const ownerHeaders = { origin, cookie: h.phones.cookie(h.first.token).split(';')[0]! };
    for (const entry of [
      {
        method: 'POST' as const,
        url: `${root}/phone-connections/${owner.id}/revocations`,
        headers,
        payload: { requestId: 'request_remove_owner' },
      },
      {
        method: 'POST' as const,
        url: `${root}/phone-connections/${owner.id}/revocations`,
        headers: ownerHeaders,
        payload: { requestId: 'request_self_remove_owner' },
      },
      {
        method: 'POST' as const,
        url: '/api/v1/auth/sign-outs',
        headers: ownerHeaders,
        payload: {},
      },
      {
        method: 'PATCH' as const,
        url: `${root}/members/${h.first.session.memberId}`,
        headers,
        payload: {
          requestId: 'request_demote_owner',
          displayName: 'David',
          role: 'adult',
          color: '#2f766d',
          administrator: false,
        },
      },
      {
        method: 'POST' as const,
        url: `${root}/members/${h.first.session.memberId}/archives`,
        headers,
        payload: { requestId: 'request_archive_owner' },
      },
      {
        method: 'POST' as const,
        url: '/api/v1/tv-pairing-sessions/pairing_fixture/credential-exchanges',
        headers: ownerHeaders,
        payload: {
          requestId: 'request_owner_screen',
          pairingSecret: 'a'.repeat(43),
        },
      },
    ]) {
      const response = await app.inject(entry);
      expect(response.statusCode, entry.url).toBe(403);
      expect(response.headers['set-cookie']).not.toBeDefined();
    }
    expect(exchange).not.toHaveBeenCalled();
    expect(
      (await app.inject({ url: '/api/v1/auth/status', headers: ownerHeaders })).json().ownerPhone,
    ).toBe(true);
    expect((await app.inject({ url: '/api/v1/auth/status', headers })).json().ownerPhone).toBe(
      false,
    );
    expect(h.auth.session(h.first.token).displayName).toBe('David');
    expect(h.auth.session(second.token).displayName).toBe('Rachael');
  });
  it('rejects wrong household, missing capability, stale owner grants and anonymous brute force', async () => {
    const h = await harness();
    expect(() => h.phones.list('household_other', h.first.token)).toThrow();
    h.db.prepare("UPDATE members SET capabilities_json='[]' WHERE id='member_rachael'").run();
    expect(() =>
      h.phones.createInvitation(h.home, h.first.token, 'member_rachael', 'request_wrong'),
    ).toThrow(/controller/);
    for (let i = 0; i < 20; i++)
      await expect(
        h.phones.ownerClaim(
          { ownerKey: 'b'.repeat(64), phoneName: 'Invalid' },
          'bad',
          () => undefined,
        ),
      ).rejects.toThrow(/not accepted/);
    await expect(
      h.phones.ownerClaim(
        { ownerKey: 'b'.repeat(64), phoneName: 'Invalid' },
        'bad',
        () => undefined,
      ),
    ).rejects.toThrow(/Too many/);
  });
  it('HTTP path uses cookie-only secrets, refuses passkey ceremonies, and rejects cross-origin and screen requests', async () => {
    const h = await harness();
    const app = buildServer({
      logger: false,
      demoMode: false,
      companionAuth: h.auth,
      phoneConnections: h.phones,
      adminRepository: new SqliteAdminRepository(h.db, { seedDemo: false }),
      runtime: {
        mode: 'private',
        householdId: h.home,
        clock: new FixedClock(h.now().toISOString()),
      },
    });
    servers.push(app);
    const headers = { origin, cookie: h.phones.cookie(h.first.token).split(';')[0]! };
    expect((await app.inject({ url: '/api/v1/auth/status', headers })).json().accessMethod).toBe(
      'phone',
    );
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/auth/authentication-options', headers }))
        .statusCode,
    ).toBe(403);
    const root = `/api/v1/households/${h.home}`;
    const create = await app.inject({
      method: 'POST',
      url: `${root}/phone-invitations`,
      headers,
      payload: { memberId: 'member_rachael', requestId: 'request_route' },
    });
    expect(create.statusCode).toBe(200);
    const reveal = create.json();
    const secret = new URL(reveal.qrUrl).hash.slice('#connect-phone='.length);
    const claim = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phones/invitation-claims',
      headers: { origin },
      payload: { invitationSecret: secret, phoneName: 'Rachael’s iPhone' },
    });
    expect(claim.statusCode).toBe(200);
    expect(claim.body).not.toContain('pendingToken');
    const cookies = claim.headers['set-cookie'];
    const pendingCookie = (Array.isArray(cookies) ? cookies : [String(cookies)])
      .find((cookie) => cookie.startsWith('hearth_phone_pending='))!
      .split(';')[0]!;
    expect(String(claim.headers['set-cookie'])).toMatch(/HttpOnly; SameSite=Strict.*Secure/);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `${root}/phone-invitations/${reveal.id}/approvals`,
          headers,
          payload: { requestId: 'request_route_approve' },
        })
      ).statusCode,
    ).toBe(200);
    const exchanged = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phones/exchanges',
      headers: { origin, cookie: pendingCookie },
      payload: {},
    });
    expect(exchanged.statusCode).toBe(200);
    expect(exchanged.json().displayName).toBe('Rachael');
    expect(exchanged.body).not.toContain('token');
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phones/exchanges',
      headers: { origin, cookie: pendingCookie },
      payload: {},
    });
    expect(replay.json()).toEqual(exchanged.json());
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phones/confirmations',
      headers: { origin: 'https://wrong.example', cookie: headers.cookie },
      payload: {},
    });
    expect(bad.statusCode).toBe(403);
    const screen = await app.inject({
      url: '/api/v1/auth/phones/pending',
      headers: { 'user-agent': 'Android TV' },
    });
    expect(screen.statusCode).toBe(403);
    expect(h.auth.session(h.first.token).displayName).toBe('David');
    const overview = await app.inject({ url: `${root}/admin`, headers });
    expect(overview.statusCode).toBe(200);
    expect(
      overview
        .json()
        .recentAudit.some((entry: { action: string }) => entry.action === 'auth.phone.connect'),
    ).toBe(true);
  });
});
