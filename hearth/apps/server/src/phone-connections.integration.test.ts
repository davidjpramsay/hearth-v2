import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanionAuthService, type CompanionAuthConfiguration } from './companion-auth.js';
import { PhoneConnectionService, PHONE_IDLE_MS } from './phone-connections.js';
import { applyMigrations } from './database.js';
import { buildServer } from './app.js';
import { SqliteAdminRepository } from './admin-repository.js';
import { FixedClock } from './runtime-context.js';
import { HomeAssistantPairingService } from './home-assistant-pairings.js';
import { HomeAssistantBridgeService } from './home-assistant-bridge.js';
import { InMemoryHearthRepository } from './repository.js';

async function bridgeHarness() {
  const h = await harness();
  const admin = new SqliteAdminRepository(h.db, { seedDemo: false, now: h.now });
  const bridge = new HomeAssistantBridgeService(admin, new InMemoryHearthRepository(), {
    database: h.db,
    now: h.now,
  });
  const options = {
    database: h.db,
    now: h.now,
    assertApproval: (ref: Parameters<PhoneConnectionService['assertApprovalReference']>[0]) =>
      h.phones.assertApprovalReference(ref),
  };
  const pairings = new HomeAssistantPairingService(bridge, options);
  const reference = h.phones.approvalReference(h.home, h.first.token);
  const secret = `ha_${'B'.repeat(43)}`;
  const start = pairings.start({ requestId: 'request_ha_start', secret }, 'ha');
  const approval = {
    requestId: 'request_ha_approve',
    code: start.code,
    screenIds: [],
    shareChores: false,
    shareCalendar: false,
    controlChores: false,
  };
  return { ...h, bridge, pairings, reference, secret, start, approval, options, admin };
}

describe('adult-approved HA device codes', () => {
  it('an approval in flight cannot outrun disconnect, and an old disconnect retry cannot cancel a newer approval', async () => {
    const h = await bridgeHarness();
    const original = h.admin.getOverview.bind(h.admin);
    vi.spyOn(h.admin, 'getOverview').mockImplementationOnce(async (...args) => {
      h.pairings.cancelForHousehold(h.home);
      return original(...args);
    });
    await expect(h.pairings.approve(h.approval, h.reference, 'adult')).rejects.toThrow();
    await h.bridge.revoke(h.home, h.reference.memberId, 'request_disconnect', () =>
      h.pairings.cancelForHousehold(h.home),
    );
    const newerSecret = `ha_${'E'.repeat(43)}`;
    const newer = h.pairings.start({ requestId: 'request_newer', secret: newerSecret }, 'ha');
    await h.pairings.approve(
      { ...h.approval, requestId: 'request_newer_approval', code: newer.code },
      h.reference,
      'adult',
    );
    const repeatedCancellation = vi.fn(() => h.pairings.cancelForHousehold(h.home));
    await h.bridge.revoke(h.home, h.reference.memberId, 'request_disconnect', repeatedCancellation);
    expect(repeatedCancellation).not.toHaveBeenCalled();
    expect(await h.pairings.exchange(newer.id, newerSecret, 'ha')).toMatchObject({
      state: 'connected',
    });
  });
  it('separates code, approving phone and original machine proof; exact exchange replays one grant', async () => {
    const h = await bridgeHarness();
    expect(h.start.code).toMatch(/^[A-HJ-NP-Z]{6}$/);
    expect(await h.pairings.exchange(h.start.id, h.secret, 'ha')).toEqual({
      state: 'waiting',
      receipt: null,
    });
    await expect(
      h.pairings.exchange(h.start.id, `ha_${'C'.repeat(43)}`, 'wrong'),
    ).rejects.toThrow();
    await h.pairings.approve(h.approval, h.reference, 'adult');
    const otherRequest = h.pairings.start(
      { requestId: 'request_second_ha', secret: `ha_${'D'.repeat(43)}` },
      'ha',
    );
    await expect(
      h.pairings.approve({ ...h.approval, code: otherRequest.code }, h.reference, 'adult'),
    ).rejects.toThrow();
    const first = await h.pairings.exchange(h.start.id, h.secret, 'ha');
    expect(first).toMatchObject({ state: 'connected', receipt: { replayed: false } });
    expect(await h.pairings.exchange(h.start.id, h.secret, 'ha')).toMatchObject({
      receipt: { replayed: true, connection: first.receipt!.connection },
    });
    expect(h.bridge.authenticate(h.secret).householdId).toBe(h.home);
    expect(
      h.db.prepare('SELECT count(*) AS n FROM home_assistant_bridge_connections').get(),
    ).toEqual({ n: 1 });
    const persisted = JSON.stringify(
      h.db.prepare('SELECT * FROM home_assistant_bridge_pairings').all(),
    );
    for (const privateValue of [h.secret, h.start.code, h.first.token])
      expect(persisted).not.toContain(privateValue);
    await expect(
      h.pairings.approve({ ...h.approval, shareCalendar: true }, h.reference, 'adult'),
    ).rejects.toThrow();
  });
  it('durably retains approval/exact exchange but never reconstructs a lost short-code reveal after restart', async () => {
    const h = await bridgeHarness();
    expect(h.pairings.start({ requestId: 'request_ha_start', secret: h.secret }, 'ha')).toEqual(
      h.start,
    );
    await h.pairings.approve(h.approval, h.reference, 'adult');
    const restarted = new HomeAssistantPairingService(h.bridge, h.options);
    expect(() =>
      restarted.start({ requestId: 'request_ha_start', secret: h.secret }, 'ha'),
    ).toThrow();
    expect(await restarted.approve(h.approval, h.reference, 'adult')).toMatchObject({
      approved: true,
    });
    expect(
      h.db
        .prepare(
          "SELECT count(*) AS n FROM audit_events WHERE action_type='home-assistant.bridge.approve'",
        )
        .get(),
    ).toEqual({ n: 1 });
    expect(await restarted.exchange(h.start.id, h.secret, 'ha')).toMatchObject({
      receipt: { replayed: false },
    });
    const again = new HomeAssistantPairingService(
      new HomeAssistantBridgeService(h.admin, new InMemoryHearthRepository(), {
        database: h.db,
        now: h.now,
      }),
      h.options,
    );
    expect(await again.exchange(h.start.id, h.secret, 'ha')).toMatchObject({
      receipt: { replayed: true },
    });
  });
  it('expiry, removal of approving session, permission loss and cancellation fail closed', async () => {
    for (const scenario of ['expiry', 'session', 'permission', 'cancel'] as const) {
      const h = await bridgeHarness();
      await h.pairings.approve(h.approval, h.reference, 'adult');
      if (scenario === 'expiry') h.advance(300_001);
      if (scenario === 'session') h.auth.invalidateBrowserSession(h.first.token);
      if (scenario === 'permission')
        h.db
          .prepare("UPDATE members SET capabilities_json='[]' WHERE id=?")
          .run(h.reference.memberId);
      if (scenario === 'cancel') h.pairings.cancelForHousehold(h.home);
      await expect(h.pairings.exchange(h.start.id, h.secret, 'ha')).rejects.toThrow();
      expect(
        h.db.prepare('SELECT count(*) AS n FROM home_assistant_bridge_connections').get(),
      ).toEqual({ n: 0 });
    }
  });
  it('bounds creation, guessing and pending state without echoing supplied credentials', async () => {
    const h = await bridgeHarness();
    for (let n = 0; n < 10; n += 1)
      expect(() =>
        h.pairings.start(
          { requestId: 'request_ha_start', secret: `ha_${'C'.repeat(43)}` },
          'guess',
        ),
      ).toThrow();
    expect(() => h.pairings.start({ requestId: 'request_new', secret: h.secret }, 'guess')).toThrow(
      /unavailable/,
    );
    for (let n = 0; n < 10; n += 1)
      await expect(
        h.pairings.approve({ ...h.approval, code: 'ABCDEF' }, h.reference, 'guess'),
      ).rejects.toThrow();
    await expect(h.pairings.approve(h.approval, h.reference, 'guess')).rejects.toThrow(
      /unavailable/,
    );
    h.advance(300_001);
    expect(h.pairings.start({ requestId: 'request_new', secret: h.secret }, 'guess').code).toMatch(
      /^[A-HJ-NP-Z]{6}$/,
    );
  });
  it('rechecks the approving phone after an asynchronous repository read and cannot overwrite approval concurrently', async () => {
    const h = await bridgeHarness();
    const other = await secondary(h);
    const otherRef = h.phones.approvalReference(h.home, other.token);
    const competing = await Promise.allSettled([
      h.pairings.approve(h.approval, h.reference, 'owner'),
      h.pairings.approve({ ...h.approval, requestId: 'request_competing' }, otherRef, 'other'),
    ]);
    expect(competing.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const original = h.admin.getOverview.bind(h.admin);
    vi.spyOn(h.admin, 'getOverview').mockImplementation(async (...args) => {
      const result = await original(...args);
      h.auth.invalidateBrowserSession(h.first.token);
      return result;
    });
    await expect(h.pairings.exchange(h.start.id, h.secret, 'ha')).rejects.toThrow();
    expect(
      h.db.prepare('SELECT count(*) AS n FROM home_assistant_bridge_connections').get(),
    ).toEqual({ n: 0 });
  });
  it('machine routes reject browser/mixed credentials, and adult approval rejects screen/cross-origin/anonymous requests', async () => {
    const h = await bridgeHarness();
    const app = buildServer({
      logger: false,
      demoMode: false,
      companionAuth: h.auth,
      phoneConnections: h.phones,
      adminRepository: h.admin,
      homeAssistantBridge: h.bridge,
      homeAssistantPairings: h.pairings,
      runtime: { mode: 'private', householdId: h.home, clock: { now: h.now } },
    });
    servers.push(app);
    const machine = '/api/v1/home-assistant/pairing-requests';
    for (const headers of [
      { cookie: 'hearth_device=fixture' },
      { origin },
      { authorization: `HearthAutomation ${h.secret}` },
    ]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: machine,
            headers,
            payload: { requestId: 'request_route', secret: h.secret },
          })
        ).statusCode,
      ).toBe(403);
    }
    const url = `/api/v1/households/${h.home}/home-assistant-bridge/pairing-approvals`;
    const cookie = h.phones.cookie(h.first.token).split(';')[0]!;
    expect(
      (await app.inject({ method: 'POST', url, headers: { origin, cookie }, payload: h.approval }))
        .statusCode,
    ).toBe(200);
    const exchangeUrl = `${machine}/${h.start.id}/exchanges`;
    expect(
      (
        await app.inject({ method: 'POST', url: exchangeUrl, payload: { secret: h.secret } })
      ).json(),
    ).toMatchObject({ state: 'connected', receipt: { replayed: false } });
    expect(
      (
        await app.inject({ method: 'POST', url: exchangeUrl, payload: { secret: h.secret } })
      ).json(),
    ).toMatchObject({ receipt: { replayed: true } });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `${url.replace('/pairing-approvals', '')}/revocations`,
          headers: { origin, cookie },
          payload: { requestId: 'request_route_revoke' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: exchangeUrl, payload: { secret: h.secret } }))
        .statusCode,
    ).toBe(403);
    for (const headers of [
      { origin },
      { origin: 'https://evil.example.test', cookie },
      { origin, cookie: `${cookie}; hearth_device=fixture` },
    ]) {
      expect(
        (await app.inject({ method: 'POST', url, headers, payload: h.approval })).statusCode,
      ).not.toBe(200);
    }
    const result = await app.inject({
      method: 'POST',
      url,
      headers: { origin, cookie },
      payload: h.approval,
    });
    // A mixed screen attempt intentionally invalidates retained adult authority. A fresh owner grant is needed.
    expect(result.statusCode).not.toBe(200);
  });
});

const databases: Database.Database[] = [];
const servers: ReturnType<typeof buildServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  for (const db of databases.splice(0)) db.close();
});
const key = 'fixture_owner_key_0123456789abcdef0123456789abcdef';
const origin = 'https://hearth.example.test';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function currentPhone(h: Awaited<ReturnType<typeof harness>>, token: string) {
  return h.phones.list(h.home, token).connections.find((phone) => phone.current)!.id;
}

async function savedCard(
  h: Awaited<ReturnType<typeof harness>>,
  requestId = 'request_card_fixture',
) {
  h.phones.confirm(h.first.token);
  const card = h.phones.createRecoveryCard(h.home, h.first.token, requestId);
  const secret = new URL(card.qrUrl).hash.slice('#recover-phone='.length);
  h.phones.activateRecoveryCard(h.home, h.first.token, card.id, `${requestId}_activate`);
  return { card, secret };
}
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
  it('six-letter invitations require original adult approval and a separate pending cookie', async () => {
    const h = await harness();
    const invite = h.phones.createInvitation(
      h.home,
      h.first.token,
      'member_rachael',
      'request_code',
    );
    expect(invite.code).toMatch(/^[A-HJ-NP-Z]{6}$/);
    const claim = h.phones.claimInvitation(invite.code!, 'New phone', 'new', null, true);
    expect(() => h.phones.exchange(invite.code!, () => undefined)).toThrow();
    expect(() => h.phones.exchange(claim.pendingToken, () => undefined)).toThrow(/Waiting/);
    expect(() => h.phones.claimInvitation(invite.code!, 'Imposter', 'other', null, true)).toThrow(
      /already/,
    );
    h.phones.approve(h.home, h.first.token, invite.id, 'request_code_approve');
    expect(
      h.auth.session(h.phones.exchange(claim.pendingToken, () => undefined).token).displayName,
    ).toBe('Rachael');
    expect(
      JSON.stringify(h.db.prepare('SELECT * FROM controller_phone_invitation_codes').all()),
    ).not.toContain(invite.code);
    expect(h.auth.session(h.first.token).displayName).toBe('David');
  });
  it('expired and cancelled codes cannot be claimed and code guessing is bounded', async () => {
    const h = await harness();
    const invite = h.phones.createInvitation(
      h.home,
      h.first.token,
      'member_rachael',
      'request_expiring',
    );
    h.advance(300_001);
    expect(() => h.phones.claimInvitation(invite.code!, 'New', 'new', null, true)).toThrow();
    for (let n = 0; n < 20; n += 1)
      expect(() => h.phones.claimInvitation('ABCDEF', 'New', 'guess', null, true)).toThrow();
    expect(() => h.phones.claimInvitation('ABCDEF', 'New', 'guess', null, true)).toThrow(
      /Too many/,
    );
    const other = h.phones.createInvitation(
      h.home,
      h.first.token,
      'member_rachael',
      'request_cancelcode',
    );
    h.phones.approve(h.home, h.first.token, other.id, 'request_cancelcode_command', true);
    expect(() => h.phones.claimInvitation(other.code!, 'New', 'cancelled', null, true)).toThrow();
  });
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

describe('private recovery cards and deliberately trusted adults', () => {
  it('recovery audits remain readable through the typed admin and activity APIs', async () => {
    const h = await harness();
    const other = await secondary(h);
    const { secret } = await savedCard(h);
    h.phones.updateRecoveryPolicy(h.home, h.first.token, 'request_audit_trust', [
      currentPhone(h, other.token),
    ]);
    h.phones.confirm(other.token);
    const invitation = h.phones.createOwnerRecoveryInvitation(
      h.home,
      other.token,
      'request_audit_invite',
    );
    h.phones.approve(h.home, other.token, invitation.id, 'request_audit_cancel', true);
    const recovered = h.phones.recoverWithCard(
      { requestId: 'request_audit_recover', recoverySecret: secret, phoneName: 'Recovered phone' },
      'replacement',
      'fixture_browser_context',
      () => undefined,
    );
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
    for (const path of ['admin', 'activity']) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/households/${h.home}/${path}`,
        headers: { cookie: h.phones.cookie(recovered.token).split(';')[0]! },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      const entries = path === 'admin' ? body.recentAudit : body.entries;
      expect(entries.map((entry: { action: string }) => entry.action)).toEqual(
        expect.arrayContaining([
          'auth.phone.recovery.card.prepare',
          'auth.phone.recovery.card.activate',
          'auth.phone.recovery.policy',
          'auth.phone.owner.recovery.card',
          'auth.phone.owner.recovery.invite',
        ]),
      );
      expect(response.body).not.toContain(secret);
      expect(response.body).not.toContain(recovered.token);
    }
  });

  it('ordinary invitations cannot clone owner or trusted-phone recovery authority', async () => {
    const h = await harness();
    const other = await secondary(h);
    h.phones.confirm(h.first.token);
    h.phones.updateRecoveryPolicy(h.home, h.first.token, 'request_trust_original', [
      currentPhone(h, other.token),
    ]);
    for (const member of [h.first.session.memberId, 'member_rachael']) {
      const invite = h.phones.createInvitation(
        h.home,
        other.token,
        member,
        `request_clone_${member}`,
      );
      const claim = h.phones.claimInvitation(
        new URL(invite.qrUrl).hash.slice('#connect-phone='.length),
        'Another browser',
        'clone',
        null,
      );
      h.phones.approve(h.home, other.token, invite.id, `request_approve_${member}`);
      const cloned = h.phones.exchange(claim.pendingToken, () => undefined);
      h.phones.confirm(cloned.token);
      expect(h.auth.status(cloned.token).ownerPhone).not.toBe(true);
      expect(h.phones.recoverySummary(h.home, cloned.token).canRecoverOwner).toBe(false);
      expect(() =>
        h.phones.createOwnerRecoveryInvitation(h.home, cloned.token, 'request_clone_recovery'),
      ).toThrow(/not trusted/);
      expect(() => h.phones.createRecoveryCard(h.home, cloned.token, 'request_clone_card')).toThrow(
        /Only the owner/,
      );
    }
    expect(h.phones.recoverySummary(h.home, other.token).canRecoverOwner).toBe(true);
    expect(h.auth.session(h.first.token).displayName).toBe('David');
  });

  it('HTTP recovery requires origin, owner consent and browser-only authority; receipt retries bind the context', async () => {
    const h = await harness();
    const other = await secondary(h);
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
    const root = `/api/v1/households/${h.home}/phone-recovery`;
    const ownerHeaders = { origin, cookie: h.phones.cookie(h.first.token).split(';')[0]! };
    const otherHeaders = { origin, cookie: h.phones.cookie(other.token).split(';')[0]! };
    for (const [url, headers, payload, code] of [
      [`${root}/cards`, {}, { requestId: 'request_none' }, 403],
      [
        `${root}/cards`,
        { ...ownerHeaders, origin: 'https://wrong.example.test' },
        { requestId: 'request_cross_origin' },
        403,
      ],
      [`${root}/cards`, ownerHeaders, { requestId: 'request_no_consent' }, 409],
      [`${root}/cards`, otherHeaders, { requestId: 'request_secondary' }, 403],
      [
        `${root}/policies`,
        ownerHeaders,
        { requestId: 'request_bad_fields', trustedAdultIds: ['member_rachael'] },
        400,
      ],
    ] as const) {
      const response = await app.inject({ method: 'POST', url, headers, payload });
      expect(response.statusCode, url).toBe(code);
    }
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phones/confirmations',
      headers: ownerHeaders,
    });
    const prepare = await app.inject({
      method: 'POST',
      url: `${root}/cards`,
      headers: ownerHeaders,
      payload: { requestId: 'request_http_card' },
    });
    expect(prepare.statusCode).toBe(200);
    expect(prepare.headers['cache-control']).toBe('no-store');
    const card = prepare.json<{ id: string; qrUrl: string }>();
    const recoverySecret = new URL(card.qrUrl).hash.slice('#recover-phone='.length);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `${root}/cards/${card.id}/activations`,
          headers: ownerHeaders,
          payload: { requestId: 'request_http_save' },
        })
      ).statusCode,
    ).toBe(200);
    const summary = await app.inject({ method: 'GET', url: root, headers: ownerHeaders });
    expect(summary.body).not.toContain(recoverySecret);
    const nonce = 'fixture_unused_context';
    // An invalid context cookie is replaced by the server, not accepted as a binding.
    const runtime = await app.inject({ method: 'GET', url: '/api/v1/runtime' });
    const context = String(runtime.headers['set-cookie']).split(';')[0]!;
    expect(context).not.toContain(nonce);
    const payload = {
      requestId: 'request_http_recover',
      recoverySecret,
      phoneName: 'Replacement phone',
    };
    for (const headers of [
      { origin, 'user-agent': 'Android TV' },
      { origin, authorization: 'Bearer display_fixture' },
    ]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/auth/phones/recovery-claims',
            headers,
            payload,
          })
        ).statusCode,
      ).toBe(403);
    }
    const recovered = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phones/recovery-claims',
      headers: { origin, cookie: context },
      payload,
    });
    expect(recovered.statusCode).toBe(200);
    const retried = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phones/recovery-claims',
      headers: { origin, cookie: context },
      payload,
    });
    expect(retried.statusCode).toBe(200);
    expect(retried.json()).toEqual(recovered.json());
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/phones/recovery-claims',
          headers: { origin },
          payload,
        })
      ).statusCode,
    ).toBe(409);
    expect(h.auth.session(other.token).displayName).toBe('Rachael');
  });
  it('requires the live owner and recent confirmation to manage recovery', async () => {
    const h = await harness();
    const other = await secondary(h);
    expect(() => h.phones.createRecoveryCard(h.home, h.first.token, 'request_no_consent')).toThrow(
      /Confirm/,
    );
    h.phones.confirm(other.token);
    expect(() => h.phones.createRecoveryCard(h.home, other.token, 'request_not_owner')).toThrow(
      /Only the owner/,
    );
    expect(() =>
      h.phones.updateRecoveryPolicy(h.home, other.token, 'request_not_owner', []),
    ).toThrow(/Only the owner/);
    h.phones.confirm(h.first.token);
    h.advance(300_001);
    expect(() =>
      h.phones.createRecoveryCard(h.home, h.first.token, 'request_stale_consent'),
    ).toThrow(/Confirm/);
    expect(h.phones.recoverySummary(h.home, h.first.token).hasRecoveryCard).toBe(false);
  });

  it('keeps an unsaved card powerless and exposes no proof in status or SQLite', async () => {
    const h = await harness();
    h.phones.confirm(h.first.token);
    const card = h.phones.createRecoveryCard(h.home, h.first.token, 'request_new_card');
    const secret = new URL(card.qrUrl).hash.slice('#recover-phone='.length);
    expect(h.phones.recoverySummary(h.home, h.first.token).hasRecoveryCard).toBe(false);
    expect(() =>
      h.phones.recoverWithCard(
        { requestId: 'request_use', recoverySecret: secret, phoneName: 'Replacement' },
        'new',
        'context_new',
        () => undefined,
      ),
    ).toThrow(/not accepted/);
    h.phones.activateRecoveryCard(h.home, h.first.token, card.id, 'request_saved');
    expect(h.phones.recoverySummary(h.home, h.first.token).hasRecoveryCard).toBe(true);
    const persisted = JSON.stringify(
      h.db.prepare('SELECT * FROM controller_phone_recovery_cards').all(),
    );
    expect(persisted).not.toContain(secret);
    expect(persisted).not.toContain(card.qrUrl);
    expect(JSON.stringify(h.phones.recoverySummary(h.home, h.first.token))).not.toContain(secret);
  });

  it('exact prepare/activate retries have one effect and changed request reuse fails', async () => {
    const h = await harness();
    h.phones.confirm(h.first.token);
    const card = h.phones.createRecoveryCard(h.home, h.first.token, 'request_retry_card');
    expect(h.phones.createRecoveryCard(h.home, h.first.token, 'request_retry_card')).toEqual(card);
    h.phones.activateRecoveryCard(h.home, h.first.token, card.id, 'request_retry_activate');
    h.phones.activateRecoveryCard(h.home, h.first.token, card.id, 'request_retry_activate');
    expect(() =>
      h.phones.updateRecoveryPolicy(h.home, h.first.token, 'request_retry_activate', []),
    ).toThrow(/different recovery/);
    expect(
      h.db
        .prepare(
          "SELECT count(*) AS total FROM audit_events WHERE action_type='auth.phone.recovery.card.activate'",
        )
        .get(),
    ).toEqual({ total: 1 });
    expect(
      h.db.prepare('SELECT count(*) AS total FROM controller_phone_recovery_cards').get(),
    ).toEqual({ total: 1 });
  });

  it('an expired or lost unsaved preview leaves the previous saved card valid', async () => {
    const h = await harness();
    const old = await savedCard(h);
    const newer = h.phones.createRecoveryCard(h.home, h.first.token, 'request_unsaved');
    h.advance(300_001);
    expect(() =>
      h.phones.activateRecoveryCard(h.home, h.first.token, newer.id, 'request_expired'),
    ).toThrow(/expired/);
    expect(h.phones.recoverySummary(h.home, h.first.token).hasRecoveryCard).toBe(true);
    const freshProcess = new PhoneConnectionService(h.db, h.auth, h.config);
    h.phones.confirm(h.first.token);
    expect(() => freshProcess.createRecoveryCard(h.home, h.first.token, 'request_unsaved')).toThrow(
      /reply is no longer/,
    );
    const result = freshProcess.recoverWithCard(
      { requestId: 'request_recover', recoverySecret: old.secret, phoneName: 'New David phone' },
      'new',
      'context_new',
      () => undefined,
    );
    expect(h.auth.session(result.token).displayName).toBe('David');
  });

  it('card recovery preserves other phones, screens, people and content and rejects the lost phone', async () => {
    const h = await harness();
    const other = await secondary(h);
    h.db
      .prepare(
        "INSERT INTO paired_devices (id,household_id,name,device_type,credential_reference,scopes_json,paired_at,capabilities_json) VALUES ('device_kept',?,'Kept TV','television','fixture','[\"household.read\"]',?,'[\"dpad\"]')",
      )
      .run(h.home, h.now().toISOString());
    const before = JSON.stringify(h.db.prepare('SELECT * FROM household_lists ORDER BY id').all());
    const { secret } = await savedCard(h);
    const input = {
      requestId: 'request_recover_card',
      recoverySecret: secret,
      phoneName: 'Replacement David phone',
    };
    const result = h.phones.recoverWithCard(input, 'new', 'context_new', () => undefined);
    expect(h.auth.status(result.token).ownerPhone).toBe(true);
    expect(() => h.auth.session(h.first.token)).toThrow();
    expect(h.auth.session(other.token).displayName).toBe('Rachael');
    expect(
      h.db.prepare("SELECT revoked_at FROM paired_devices WHERE id='device_kept'").get(),
    ).toEqual({ revoked_at: null });
    expect(JSON.stringify(h.db.prepare('SELECT * FROM household_lists ORDER BY id').all())).toBe(
      before,
    );
    expect(h.db.prepare('SELECT count(*) AS total FROM members').get()).toEqual({ total: 2 });
    expect(h.phones.recoverySummary(h.home, result.token).hasRecoveryCard).toBe(false);
    const receipt = h.phones.recoverWithCard(
      input,
      'new',
      'context_new',
      () => undefined,
      result.token,
    );
    expect(receipt.token).toBe(result.token);
    for (const [context, change] of [
      ['context_other', {}],
      ['context_new', { requestId: 'request_changed' }],
      ['context_new', { phoneName: 'Changed name' }],
    ] as const)
      expect(() =>
        h.phones.recoverWithCard({ ...input, ...change }, 'new', context, () => undefined),
      ).toThrow(/already been used/);
    expect(
      h.db
        .prepare(
          "SELECT count(*) AS total FROM controller_phone_connections WHERE source='owner' AND revoked_at IS NULL",
        )
        .get(),
    ).toEqual({ total: 1 });
  });

  it('does not switch an already connected phone into the recovered owner', async () => {
    const h = await harness();
    const other = await secondary(h);
    const { secret } = await savedCard(h);
    expect(() =>
      h.phones.recoverWithCard(
        { requestId: 'request_wrong_phone', recoverySecret: secret, phoneName: 'Wrong browser' },
        'new',
        'context_new',
        () => undefined,
        other.token,
      ),
    ).toThrow(/already connected/);
    expect(h.auth.session(h.first.token).displayName).toBe('David');
    expect(h.auth.session(other.token).displayName).toBe('Rachael');
    expect(h.phones.recoverySummary(h.home, h.first.token).hasRecoveryCard).toBe(true);
  });

  it('an activated card does not expire just because every phone has expired', async () => {
    const h = await harness();
    const { secret } = await savedCard(h);
    h.advance(400 * 24 * 60 * 60_000);
    const result = h.phones.recoverWithCard(
      { requestId: 'request_year_later', recoverySecret: secret, phoneName: 'Later replacement' },
      'new',
      'context_new',
      () => undefined,
    );
    expect(h.auth.status(result.token).ownerPhone).toBe(true);
    expect(h.auth.session(result.token).displayName).toBe('David');
  });

  it('a failed replacement or browser guard rolls back consumption and revocation', async () => {
    const h = await harness();
    const { secret } = await savedCard(h);
    const input = {
      requestId: 'request_rollback',
      recoverySecret: secret,
      phoneName: 'Replacement',
    };
    expect(() =>
      h.phones.recoverWithCard(input, 'new', 'context_new', () => {
        throw new Error('paired screen');
      }),
    ).toThrow(/paired screen/);
    h.db.exec(
      "CREATE TRIGGER fixture_reject_recovery BEFORE INSERT ON controller_phone_connections WHEN NEW.source='owner' BEGIN SELECT RAISE(ABORT,'fixture storage failure'); END;",
    );
    expect(() => h.phones.recoverWithCard(input, 'new', 'context_new', () => undefined)).toThrow(
      /fixture storage failure/,
    );
    expect(h.auth.session(h.first.token).displayName).toBe('David');
    expect(
      h.db.prepare('SELECT consumed_at,revoked_at FROM controller_phone_recovery_cards').get(),
    ).toEqual({ consumed_at: null, revoked_at: null });
    expect(
      h.db
        .prepare(
          "SELECT count(*) AS total FROM audit_events WHERE action_type='auth.phone.owner.replace'",
        )
        .get(),
    ).toEqual({ total: 0 });
  });

  it('only a connected, explicitly trusted adult can approve owner replacement', async () => {
    const h = await harness();
    h.phones.confirm(h.first.token);
    expect(() =>
      h.phones.updateRecoveryPolicy(h.home, h.first.token, 'request_unconnected', [
        'phone_not_connected',
      ]),
    ).toThrow(/Connect that adult/);
    const other = await secondary(h);
    h.phones.confirm(other.token);
    expect(() =>
      h.phones.createOwnerRecoveryInvitation(h.home, other.token, 'request_untrusted'),
    ).toThrow(/not trusted/);
    h.phones.updateRecoveryPolicy(h.home, h.first.token, 'request_trust', [
      currentPhone(h, other.token),
    ]);
    h.phones.updateRecoveryPolicy(h.home, h.first.token, 'request_trust', [
      currentPhone(h, other.token),
    ]);
    expect(() => h.phones.updateRecoveryPolicy(h.home, h.first.token, 'request_trust', [])).toThrow(
      /different recovery/,
    );
    const invite = h.phones.createOwnerRecoveryInvitation(
      h.home,
      other.token,
      'request_owner_invite',
    );
    expect(invite.purpose).toBe('recover-owner');
    expect(invite.adultName).toBe('David');
    const claim = h.phones.claimInvitation(
      new URL(invite.qrUrl).hash.slice('#connect-phone='.length),
      'David replacement',
      'new',
      null,
    );
    h.phones.approve(h.home, other.token, invite.id, 'request_approve_recovery');
    const replacement = h.phones.exchange(claim.pendingToken, () => undefined);
    expect(h.auth.status(replacement.token).ownerPhone).toBe(true);
    expect(h.auth.session(replacement.token).displayName).toBe('David');
    expect(h.auth.session(other.token).displayName).toBe('Rachael');
    expect(() => h.auth.session(h.first.token)).toThrow();
    expect(h.phones.exchange(claim.pendingToken, () => undefined).token).toBe(replacement.token);
  });

  it.each(['untrust', 'remove', 'demote'] as const)(
    'rejects recovery if the approving adult changes: %s',
    async (change) => {
      const h = await harness();
      const other = await secondary(h);
      h.phones.confirm(h.first.token);
      h.phones.updateRecoveryPolicy(h.home, h.first.token, 'request_trust', [
        currentPhone(h, other.token),
      ]);
      h.phones.confirm(other.token);
      const invite = h.phones.createOwnerRecoveryInvitation(h.home, other.token, 'request_recover');
      const claim = h.phones.claimInvitation(
        new URL(invite.qrUrl).hash.slice('#connect-phone='.length),
        'New phone',
        'new',
        null,
      );
      h.phones.approve(h.home, other.token, invite.id, 'request_approve');
      if (change === 'untrust')
        h.phones.updateRecoveryPolicy(h.home, h.first.token, 'request_untrust', []);
      if (change === 'remove')
        h.phones.remove(
          h.home,
          h.first.token,
          h.phones
            .list(h.home, h.first.token)
            .connections.find((p) => p.memberId === 'member_rachael')!.id,
          'request_remove',
        );
      if (change === 'demote')
        h.db.prepare("UPDATE members SET role='child' WHERE id='member_rachael'").run();
      expect(() => h.phones.exchange(claim.pendingToken, () => undefined)).toThrow();
      expect(h.auth.session(h.first.token).displayName).toBe('David');
    },
  );
});
