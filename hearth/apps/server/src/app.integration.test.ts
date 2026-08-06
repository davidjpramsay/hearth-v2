import { afterEach, describe, expect, it } from 'vitest';

import { buildServer, LOGGER_REDACT_PATHS } from './app.js';
import { HomeService } from './home-repository.js';
import { FakeHomeAssistantProvider } from './integrations/home-assistant-provider.js';

const servers: ReturnType<typeof buildServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => server.close()));
});

function server() {
  const instance = buildServer({ logger: false });
  servers.push(instance);
  return instance;
}

describe('Hearth v2 API', () => {
  it('returns schema-valid Today, Week, Month and Chores projections', async () => {
    const app = server();
    const [today, week, month, chores] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/api/v1/households/household_hearth_demo/today?date=2026-08-03',
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/households/household_hearth_demo/week?start=2026-08-03',
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/households/household_hearth_demo/month?month=2026-08',
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/households/household_hearth_demo/chore-occurrences?date=2026-08-03',
      }),
    ]);
    expect([today.statusCode, week.statusCode, month.statusCode, chores.statusCode]).toEqual([
      200, 200, 200, 200,
    ]);
    expect(today.json().events).toHaveLength(3);
    expect(today.json().calendars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'calendar_ezra', access: 'read-only' }),
        expect.objectContaining({ id: 'calendar_maya', access: 'read-only' }),
        expect.objectContaining({ id: 'calendar_family', access: 'read-only' }),
      ]),
    );
    expect(today.json().events[0]).toEqual(
      expect.objectContaining({
        calendarId: expect.stringMatching(/^calendar_/),
        startLocalDate: '2026-08-03',
        endLocalDate: '2026-08-03',
      }),
    );
    expect(today.json().photo).toEqual({
      url: '/demo/family-breakfast.webp',
      alt: 'Ezra and Maya set the breakfast table together.',
    });
    expect(week.json().days).toHaveLength(7);
    expect(week.json().days[0].forecast).toEqual({
      temperatureCelsius: 16,
      condition: 'clear',
      label: 'Clear',
    });
    expect(month.json()).toMatchObject({
      month: '2026-08',
      gridStartDate: '2026-07-27',
      gridEndDate: '2026-09-06',
      displayMonth: 'August',
      displayYear: '2026',
    });
    expect(month.json().days).toHaveLength(42);
    expect(month.json().events.length).toBeGreaterThan(13);
    expect(chores.json()).toMatchObject({ totalCount: 6, completedCount: 1 });
  });

  it('returns a path-safe photo gallery with empty, cached-unavailable and retry states', async () => {
    const app = server();
    const url = '/api/v1/households/household_hearth_demo/photos';
    const healthy = await app.inject({ method: 'GET', url });
    expect(healthy.statusCode).toBe(200);
    expect(healthy.json()).toMatchObject({
      featuredPhotoId: 'photo_family_breakfast',
      collection: {
        name: 'Family favourites',
        photoCount: 5,
        source: { kind: 'demo', status: 'ready' },
      },
    });
    expect(healthy.json().photos).toHaveLength(5);
    expect(healthy.json().photos).toEqual(
      expect.arrayContaining([expect.objectContaining({ orientation: 'portrait' })]),
    );
    expect(JSON.stringify(healthy.json())).not.toMatch(/volume1|filesystem|sourceConfig/);

    await app.inject({
      method: 'POST',
      url: '/api/v1/demo/scenario',
      payload: { scenario: 'empty' },
    });
    const empty = await app.inject({ method: 'GET', url });
    expect(empty.json()).toMatchObject({ featuredPhotoId: null, photos: [] });

    await app.inject({
      method: 'POST',
      url: '/api/v1/demo/scenario',
      payload: { scenario: 'unavailable' },
    });
    const unavailable = await app.inject({ method: 'GET', url });
    expect(unavailable.json()).toMatchObject({
      freshness: 'stale',
      collection: { source: { status: 'unavailable' } },
    });
    expect(unavailable.json().photos).toHaveLength(5);

    await app.inject({
      method: 'POST',
      url: '/api/v1/demo/scenario',
      payload: { scenario: 'fail-next' },
    });
    const failed = await app.inject({ method: 'GET', url });
    const retried = await app.inject({ method: 'GET', url });
    expect(failed.statusCode).toBe(503);
    expect(failed.json().error).toMatchObject({
      code: 'INTEGRATION_UNAVAILABLE',
      retryable: true,
    });
    expect(retried.statusCode).toBe(200);
  });

  it('keeps private Photos unconfigured until an approved source is selected', async () => {
    const app = buildServer({ logger: false, demoMode: false });
    servers.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/photos',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      photos: [],
      collection: {
        source: { kind: 'synology-folder', status: 'unconfigured' },
      },
    });
  });

  it('completes, replays and reverses through the HTTP contract', async () => {
    const app = server();
    const url = '/api/v1/households/household_hearth_demo/chore-occurrences/occurrence_school_bag';
    const complete = await app.inject({
      method: 'POST',
      url: `${url}/completions`,
      payload: { requestId: 'request_http_001' },
    });
    const replay = await app.inject({
      method: 'POST',
      url: `${url}/completions`,
      payload: { requestId: 'request_http_001' },
    });
    const undo = await app.inject({
      method: 'POST',
      url: `${url}/completion-reversals`,
      payload: {
        requestId: 'request_http_undo_001',
        completionId: complete.json().completionId,
      },
    });
    expect(complete.json()).toMatchObject({ replayed: false, occurrence: { state: 'completed' } });
    expect(replay.json()).toMatchObject({ replayed: true });
    expect(undo.json()).toMatchObject({ occurrence: { state: 'pending' } });
  });

  it('supports adult skip while enforcing child ownership and authenticated command channels', async () => {
    const app = server();
    const root = '/api/v1/households/household_hearth_demo/chore-occurrences';
    const childOwn = await app.inject({
      method: 'POST',
      url: `${root}/occurrence_school_bag/completions`,
      headers: { 'x-hearth-demo-actor': 'member_ezra', 'x-hearth-demo-source': 'companion' },
      payload: { requestId: 'request_child_http_own' },
    });
    const childOther = await app.inject({
      method: 'POST',
      url: `${root}/occurrence_laundry/completions`,
      headers: { 'x-hearth-demo-actor': 'member_ezra', 'x-hearth-demo-source': 'companion' },
      payload: { requestId: 'request_child_http_other' },
    });
    const adultSkip = await app.inject({
      method: 'POST',
      url: `${root}/occurrence_laundry/skips`,
      headers: { 'x-hearth-demo-actor': 'member_maya', 'x-hearth-demo-source': 'companion' },
      payload: { requestId: 'request_adult_http_skip' },
    });
    const locked = buildServer({ logger: false, demoMode: false });
    servers.push(locked);
    const unauthenticated = await locked.inject({
      method: 'POST',
      url: `${root}/occurrence_herbs/completions`,
      payload: { requestId: 'request_locked_http' },
    });

    expect(childOwn).toMatchObject({ statusCode: 200 });
    expect(childOther).toMatchObject({ statusCode: 403 });
    expect(adultSkip.json()).toMatchObject({ occurrence: { state: 'skipped' }, replayed: false });
    expect(unauthenticated.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('returns stable family-safe validation, permission and retryable failure errors', async () => {
    const app = server();
    const invalid = await app.inject({
      method: 'GET',
      url: '/api/v1/households/123/today?date=03-08-2026',
    });
    const invalidMonth = await app.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/month?month=2026-13',
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/demo/scenario',
      payload: { scenario: 'permission' },
    });
    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/chore-occurrences/occurrence_school_bag/completions',
      payload: { requestId: 'request_forbidden_001' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/demo/scenario',
      payload: { scenario: 'fail-next' },
    });
    const failed = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/chore-occurrences/occurrence_feed_pepper/completions',
      payload: { requestId: 'request_fail_001' },
    });

    expect(invalid).toMatchObject({ statusCode: 400 });
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR');
    expect(invalidMonth).toMatchObject({ statusCode: 400 });
    expect(invalidMonth.json().error.code).toBe('VALIDATION_ERROR');
    expect(forbidden).toMatchObject({ statusCode: 403 });
    expect(forbidden.json().error.message).toBe('Ask an adult to change this.');
    expect(failed).toMatchObject({ statusCode: 503 });
    expect(failed.json().error).toMatchObject({ code: 'COMMAND_FAILED', retryable: true });
  });

  it('keeps credential-bearing fields behind explicit log redaction', async () => {
    expect(LOGGER_REDACT_PATHS).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        '*.token',
        '*.password',
      ]),
    );
    const app = server();
    const secret = 'private-demo-token-must-not-escape';
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(response.json())).not.toContain(secret);
  });

  it('serves adult setup while rejecting child and unauthenticated admin access', async () => {
    const app = server();
    const adult = await app.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/admin',
      headers: { 'x-hearth-demo-actor': 'member_maya' },
    });
    const child = await app.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/admin',
      headers: { 'x-hearth-demo-actor': 'member_ezra' },
    });
    const locked = buildServer({ logger: false, demoMode: false });
    servers.push(locked);
    const unauthenticated = await locked.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/admin',
    });

    expect(adult.statusCode).toBe(200);
    expect(adult.json()).toMatchObject({
      actor: { displayName: 'Maya', role: 'adult' },
      localOnly: true,
    });
    expect(
      adult.json().integrations.map((integration: { kind: string }) => integration.kind),
    ).toEqual(['calendar', 'home-assistant']);
    expect(child.statusCode).toBe(403);
    expect(child.json().error.code).toBe('FORBIDDEN');
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('updates household and member setup with companion audit summaries', async () => {
    const app = server();
    const headers = { 'x-hearth-demo-actor': 'member_maya' };
    const household = await app.inject({
      method: 'PATCH',
      url: '/api/v1/households/household_hearth_demo/settings',
      headers,
      payload: {
        requestId: 'request_household_http_001',
        name: 'Rowan household',
        timezone: 'Australia/Perth',
      },
    });
    const member = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/members',
      headers,
      payload: {
        requestId: 'request_member_http_001',
        displayName: 'Alex',
        role: 'child',
        color: '#718778',
        administrator: false,
      },
    });
    const overview = await app.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/admin',
      headers,
    });
    const today = await app.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/today?date=2026-08-03',
    });

    expect(household.statusCode).toBe(200);
    expect(household.json().household.name).toBe('Rowan household');
    expect(member.statusCode).toBe(200);
    expect(member.json()).toMatchObject({ displayName: 'Alex', role: 'child' });
    expect(today.json().household).toMatchObject({ name: 'Rowan household' });
    expect(
      today.json().household.members.map((item: { displayName: string }) => item.displayName),
    ).toContain('Alex');
    expect(overview.json().recentAudit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'household.update', source: 'companion' }),
        expect.objectContaining({ action: 'member.create', source: 'companion' }),
      ]),
    );
  });

  it('pairs, observes and revokes a television through a short-lived code', async () => {
    const app = server();
    const headers = { 'x-hearth-demo-actor': 'member_maya' };
    const requested = await app.inject({
      method: 'POST',
      url: '/api/v1/device-pairing-requests',
      payload: { requestId: 'request_pairing_http_001', deviceName: 'Kitchen TV' },
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/device-pairing-requests',
      payload: { requestId: 'request_pairing_http_001', deviceName: 'Kitchen TV' },
    });
    const paired = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/pairing-approvals',
      headers,
      payload: { requestId: 'request_approval_http_001', code: requested.json().code },
    });
    const observed = await app.inject({
      method: 'GET',
      url: `/api/v1/device-pairing-requests/${requested.json().id}`,
    });
    const revoked = await app.inject({
      method: 'POST',
      url: `/api/v1/households/household_hearth_demo/paired-devices/${paired.json().id}/revocations`,
      headers,
      payload: { requestId: 'request_revoke_http_001' },
    });

    expect(requested.statusCode).toBe(200);
    expect(replay.json()).toEqual(requested.json());
    expect(paired.json()).toMatchObject({ name: 'Kitchen TV', status: 'connected' });
    expect(observed.json()).toMatchObject({
      status: 'approved',
      approvedDeviceId: paired.json().id,
    });
    expect(revoked.json()).toMatchObject({ status: 'revoked' });
  });

  it('exchanges a native television secret without returning it to browser pairing responses', async () => {
    const app = server();
    const pairingSecret = 'a'.repeat(43);
    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/tv-pairing-sessions',
      payload: {
        requestId: 'request_tv_native_start_001',
        deviceName: 'Living room Google TV',
        applicationVersion: '0.1.0-debug',
        pairingSecret,
      },
    });
    const pairing = started.json().pairing;
    const beforeApproval = await app.inject({
      method: 'POST',
      url: `/api/v1/tv-pairing-sessions/${pairing.id}/credential-exchanges`,
      payload: { requestId: 'request_tv_exchange_early_001', pairingSecret },
    });
    const approved = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/pairing-approvals',
      headers: { 'x-hearth-demo-actor': 'member_maya' },
      payload: { requestId: 'request_tv_native_approve_001', code: pairing.code },
    });
    const exchanged = await app.inject({
      method: 'POST',
      url: `/api/v1/tv-pairing-sessions/${pairing.id}/credential-exchanges`,
      payload: { requestId: 'request_tv_exchange_001', pairingSecret },
    });
    const current = await app.inject({
      method: 'GET',
      url: '/api/v1/device-sessions/current',
      headers: { authorization: `Bearer ${pairingSecret}` },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/households/household_hearth_demo/paired-devices/${approved.json().id}/revocations`,
      headers: { 'x-hearth-demo-actor': 'member_maya' },
      payload: { requestId: 'request_tv_native_revoke_001' },
    });
    const afterRevocation = await app.inject({
      method: 'GET',
      url: '/api/v1/device-sessions/current',
      headers: { cookie: `hearth_device=${pairingSecret}` },
    });

    expect(started.statusCode).toBe(200);
    expect(JSON.stringify(started.json())).not.toContain(pairingSecret);
    expect(beforeApproval.statusCode).toBe(409);
    expect(exchanged.json()).toMatchObject({
      deviceId: approved.json().id,
      householdId: 'household_hearth_demo',
      deviceName: 'Living room Google TV',
    });
    expect(JSON.stringify(exchanged.json())).not.toContain(pairingSecret);
    expect(current.statusCode).toBe(200);
    expect(current.json().deviceId).toBe(approved.json().id);
    expect(afterRevocation.statusCode).toBe(401);
    expect(afterRevocation.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('serves Phase 4 planning routes with typed, idempotent Assist list commands', async () => {
    const app = server();
    const headers = {
      'x-hearth-demo-actor': 'member_maya',
      'x-hearth-demo-source': 'voice',
    };
    const lists = await app.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/lists',
    });
    const url = '/api/v1/households/household_hearth_demo/assist/list-items';
    const command = {
      requestId: 'request_voice_list_http_001',
      listName: 'grocery list',
      text: 'Apples',
      quantity: null,
    };
    const added = await app.inject({ method: 'POST', url, headers, payload: command });
    const replayed = await app.inject({ method: 'POST', url, headers, payload: command });
    const duplicate = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: { ...command, requestId: 'request_voice_list_http_002' },
    });
    const invalid = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: { requestId: 'request_voice_list_http_003', text: 'Pears', quantity: null },
    });

    expect(lists.statusCode).toBe(200);
    expect(lists.json().lists).toHaveLength(3);
    expect(added.json()).toMatchObject({
      replayed: false,
      item: { text: 'Apples', checked: false },
      audit: { source: 'voice', action: 'list.item.add' },
    });
    expect(replayed.json()).toMatchObject({ replayed: true, item: { id: added.json().item.id } });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('DUPLICATE_ITEM');
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('plans meals and reverses reward adjustments without rewriting history', async () => {
    const app = server();
    const headers = { 'x-hearth-demo-actor': 'member_maya' };
    const meal = await app.inject({
      method: 'PUT',
      url: '/api/v1/households/household_hearth_demo/meal-plan-entries',
      headers,
      payload: {
        requestId: 'request_meal_http_001',
        localDate: '2026-08-04',
        slot: 'dinner',
        mealName: 'Vegetable curry',
        savedMealId: null,
        note: 'Rice at 5:30',
      },
    });
    const adjustment = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/reward-adjustments',
      headers,
      payload: {
        requestId: 'request_reward_http_001',
        memberId: 'member_ezra',
        delta: 4,
        reason: 'Helped with dinner',
        rewardId: null,
      },
    });
    const reversal = await app.inject({
      method: 'POST',
      url: `/api/v1/households/household_hearth_demo/reward-ledger/${adjustment.json().entry.id}/reversals`,
      headers,
      payload: { requestId: 'request_reward_reverse_http_001' },
    });
    const rewards = await app.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/rewards',
    });

    expect(meal.json()).toMatchObject({ entry: { mealName: 'Vegetable curry' } });
    expect(adjustment.json()).toMatchObject({ entry: { delta: 4 } });
    expect(reversal.json()).toMatchObject({
      entry: { delta: -4, reversalOfEntryId: adjustment.json().entry.id },
    });
    expect(rewards.json().ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: adjustment.json().entry.id, delta: 4 }),
        expect.objectContaining({ reversalOfEntryId: adjustment.json().entry.id, delta: -4 }),
      ]),
    );
  });

  it('keeps recurring chore administration adult-only at the HTTP boundary', async () => {
    const app = server();
    const url = '/api/v1/households/household_hearth_demo/chore-templates';
    const adult = await app.inject({
      method: 'GET',
      url,
      headers: { 'x-hearth-demo-actor': 'member_maya' },
    });
    const child = await app.inject({
      method: 'GET',
      url,
      headers: { 'x-hearth-demo-actor': 'member_ezra' },
    });

    expect(adult.statusCode).toBe(200);
    expect(adult.json().templates.length).toBeGreaterThan(0);
    expect(child.statusCode).toBe(403);
    expect(child.json().error.code).toBe('FORBIDDEN');
  });

  it('serves curated Home Assistant state and idempotent allowlisted actions', async () => {
    const provider = new FakeHomeAssistantProvider();
    const app = buildServer({ logger: false, homeRepository: new HomeService(provider) });
    servers.push(app);
    const status = await app.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/home',
    });
    const actionUrl = '/api/v1/households/household_hearth_demo/home/actions/evening-mode';
    const command = { requestId: 'request_home_http_001', confirmed: false };
    const executed = await app.inject({ method: 'POST', url: actionUrl, payload: command });
    const replayed = await app.inject({ method: 'POST', url: actionUrl, payload: command });
    const arbitrary = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/home/actions/light.turn_on',
      payload: { requestId: 'request_home_http_002', confirmed: true },
    });

    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      integration: { kind: 'home-assistant', status: 'healthy' },
      occupancy: 'occupied',
      protectedMediaActive: false,
    });
    expect(JSON.stringify(status.json())).not.toContain('entity_id');
    expect(executed.json()).toMatchObject({ actionId: 'evening-mode', replayed: false });
    expect(replayed.json()).toMatchObject({ actionId: 'evening-mode', replayed: true });
    expect(provider.calls).toEqual(['script.hearth_evening']);
    expect(arbitrary.statusCode).toBe(400);
    expect(arbitrary.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('requires confirmation and prevents screen-off while native playback is protected', async () => {
    const app = server();
    const goodnight = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/home/actions/goodnight',
      payload: { requestId: 'request_goodnight_http_001', confirmed: false },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/demo/scenario',
      payload: { scenario: 'protected-media' },
    });
    const status = await app.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/home',
    });
    const screenOff = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/home/actions/screen-off',
      payload: { requestId: 'request_screen_off_http_001', confirmed: false },
    });

    expect(goodnight.statusCode).toBe(409);
    expect(goodnight.json().error.code).toBe('CONFIRMATION_REQUIRED');
    expect(status.json()).toMatchObject({
      protectedMediaActive: true,
      powerProtectionLabel: 'Playback is protected',
    });
    expect(screenOff.statusCode).toBe(409);
    expect(screenOff.json().error.message).toContain('protected playback');
  });

  it('returns deterministic Assist speech and completes exactly one named chore', async () => {
    const app = server();
    const day = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/assist/day-summary',
      payload: { requestId: 'request_assist_day_001', date: '2026-08-03' },
    });
    const command = {
      requestId: 'request_assist_chore_001',
      date: '2026-08-03',
      memberName: 'Ezra',
      choreTitle: 'dishwasher',
    };
    const completed = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/assist/chore-completions',
      payload: command,
    });
    const replayed = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/assist/chore-completions',
      payload: command,
    });
    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/assist/chore-completions',
      payload: {
        ...command,
        requestId: 'request_assist_chore_002',
        choreTitle: 'wash the car',
      },
    });

    expect(day.json().speech).toContain('The first event is School drop-off at 8:15 am.');
    expect(completed.json()).toMatchObject({
      speech: 'Done. I marked Dishwasher complete for Ezra today.',
      command: {
        replayed: false,
        occurrence: { id: 'occurrence_dishes', state: 'completed' },
        audit: { actorId: 'service_home_assistant', source: 'voice' },
      },
    });
    expect(replayed.json().command.replayed).toBe(true);
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('NOT_FOUND');
  });

  it('keeps Hearth household data readable while Home Assistant is unavailable', async () => {
    const app = server();
    await app.inject({
      method: 'POST',
      url: '/api/v1/demo/scenario',
      payload: { scenario: 'unavailable' },
    });
    const [home, today, chores, lists] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/api/v1/households/household_hearth_demo/home',
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/households/household_hearth_demo/today?date=2026-08-03',
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/households/household_hearth_demo/chore-occurrences?date=2026-08-03',
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/households/household_hearth_demo/lists',
      }),
    ]);

    expect(home.json().integration.status).toBe('unavailable');
    expect([today.statusCode, chores.statusCode, lists.statusCode]).toEqual([200, 200, 200]);
  });

  it('fails closed for private Home/Assist commands without a configured service identity', async () => {
    const app = buildServer({ logger: false, demoMode: false });
    servers.push(app);
    const status = await app.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/home',
    });
    const action = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/home/actions/evening-mode',
      payload: { requestId: 'request_private_home_001', confirmed: false },
    });
    const assist = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/assist/day-summary',
      payload: { requestId: 'request_private_assist_001', date: '2026-08-03' },
    });

    expect(status.json()).toMatchObject({
      occupancy: 'unknown',
      televisionPower: 'unknown',
      integration: { status: 'not-configured', lastSuccessfulAt: null },
    });
    expect(action.statusCode).toBe(401);
    expect(action.json().error.code).toBe('UNAUTHENTICATED');
    expect(assist.statusCode).toBe(401);
    expect(assist.json().error.code).toBe('UNAUTHENTICATED');
  });
});
