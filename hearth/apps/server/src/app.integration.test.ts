import { afterEach, describe, expect, it } from 'vitest';

import { buildServer, LOGGER_REDACT_PATHS } from './app.js';
import { HomeService } from './home-repository.js';
import { FakeHomeAssistantProvider } from './integrations/home-assistant-provider.js';
import { FixedClock } from './runtime-context.js';

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
  it('distinguishes process health from database readiness', async () => {
    const ready = server();
    expect((await ready.inject({ method: 'GET', url: '/api/v1/health' })).json()).toMatchObject({
      status: 'ok',
    });
    expect((await ready.inject({ method: 'GET', url: '/api/v1/readiness' })).json()).toMatchObject({
      status: 'ready',
      database: 'ready',
    });

    const unavailable = buildServer({
      logger: false,
      readiness: () => {
        throw new Error('database unavailable');
      },
    });
    servers.push(unavailable);
    const response = await unavailable.inject({ method: 'GET', url: '/api/v1/readiness' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'not-ready', database: 'unavailable' });
  });

  it('publishes deterministic test runtime dates and the current household name', async () => {
    const app = server();
    const initial = await app.inject({ method: 'GET', url: '/api/v1/runtime' });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toMatchObject({
      mode: 'test',
      household: { id: 'household_hearth_demo', name: 'Hearth Demo Home' },
      timezone: 'Australia/Perth',
      localDate: '2026-08-03',
      weekStart: '2026-08-03',
      currentMonth: '2026-08',
      requiresSetup: false,
    });

    await app.inject({
      method: 'PATCH',
      url: '/api/v1/households/household_hearth_demo/settings',
      headers: { 'x-hearth-demo-actor': 'member_maya' },
      payload: {
        requestId: 'request_runtime_household_name',
        name: 'Ramsay Home',
        timezone: 'Australia/Perth',
      },
    });
    const updated = await app.inject({ method: 'GET', url: '/api/v1/runtime' });
    expect(updated.json().household.name).toBe('Ramsay Home');
  });

  it('uses the household timezone at the Perth date boundary and exposes honest first use', async () => {
    const app = buildServer({
      logger: false,
      runtime: {
        mode: 'private',
        householdId: null,
        clock: new FixedClock('2026-12-31T16:15:00.000Z'),
      },
    });
    servers.push(app);
    const runtime = await app.inject({ method: 'GET', url: '/api/v1/runtime' });
    expect(runtime.json()).toMatchObject({
      mode: 'private',
      household: null,
      localDate: '2027-01-01',
      weekStart: '2026-12-28',
      currentMonth: '2027-01',
      requiresSetup: true,
    });
    const demoControl = await app.inject({
      method: 'POST',
      url: '/api/v1/demo/scenario',
      payload: { scenario: 'healthy' },
    });
    expect(demoControl.statusCode).toBe(404);
  });

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

  it('creates and removes notices and applies Today section visibility through typed commands', async () => {
    const app = server();
    const headers = { 'x-hearth-demo-actor': 'member_maya' };
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/notices',
      headers,
      payload: {
        requestId: 'request_notice_create',
        message: 'Bring library books tomorrow',
        priority: 'important',
        startsAt: '2026-08-02T00:00:00.000Z',
        expiresAt: '2026-08-04T00:00:00.000Z',
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      replayed: false,
      configuration: {
        notices: expect.arrayContaining([expect.objectContaining({ priority: 'important' })]),
      },
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/notices',
      headers,
      payload: {
        requestId: 'request_notice_create',
        message: 'Bring library books tomorrow',
        priority: 'important',
        startsAt: '2026-08-02T00:00:00.000Z',
        expiresAt: '2026-08-04T00:00:00.000Z',
      },
    });
    expect(replay.json().replayed).toBe(true);

    const sections = await app.inject({
      method: 'PUT',
      url: '/api/v1/households/household_hearth_demo/today-sections',
      headers,
      payload: {
        requestId: 'request_sections_update',
        dinner: false,
        listSummary: true,
        notice: true,
        photo: false,
      },
    });
    expect(sections.statusCode).toBe(200);
    const today = await app.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/today?date=2026-08-03',
    });
    expect(today.json()).toMatchObject({
      notice: 'Bring library books tomorrow',
      photo: null,
      sections: { dinner: false, listSummary: true, notice: true, photo: false },
    });
  });

  it('rejects invalid notice windows and non-administrator notice writes', async () => {
    const app = server();
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/notices',
      headers: { 'x-hearth-demo-actor': 'member_maya' },
      payload: {
        requestId: 'request_notice_invalid',
        message: 'Invalid window',
        priority: 'standard',
        startsAt: '2026-08-04T00:00:00.000Z',
        expiresAt: '2026-08-03T00:00:00.000Z',
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR');

    const child = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/notices',
      headers: { 'x-hearth-demo-actor': 'member_ezra' },
      payload: {
        requestId: 'request_notice_child',
        message: 'Child write',
        priority: 'standard',
        startsAt: '2026-08-02T00:00:00.000Z',
        expiresAt: null,
      },
    });
    expect(child.statusCode).toBe(403);
    expect(child.json().error.code).toBe('FORBIDDEN');
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
        '*.appPassword',
        '*.dataBase64',
        '*.setupCode',
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

  it('tests, selects, replays and removes a credential-safe calendar connection', async () => {
    const app = server();
    const root = '/api/v1/households/household_hearth_demo';
    const headers = { 'x-hearth-demo-actor': 'member_maya' };
    const password = 'fictional-app-password';
    const tested = await app.inject({
      method: 'POST',
      url: `${root}/calendar-connection-tests`,
      headers,
      payload: {
        serverUrl: 'https://caldav.icloud.com',
        username: 'fictional@example.com',
        appPassword: password,
      },
    });
    expect(tested.statusCode).toBe(200);
    expect(tested.json().availableCalendars).toHaveLength(3);
    expect(JSON.stringify(tested.json())).not.toContain(password);
    const family = tested.json().availableCalendars[0] as { id: string };
    const ezra = tested.json().availableCalendars[1] as { id: string };
    const payload = {
      requestId: 'request_calendar_http_save',
      testId: tested.json().testId as string,
      label: 'Family calendars',
      calendars: [
        { calendarId: family.id, ownerMemberId: null },
        { calendarId: ezra.id, ownerMemberId: 'member_ezra' },
      ],
    };
    const saved = await app.inject({
      method: 'PUT',
      url: `${root}/calendar-connection`,
      headers,
      payload,
    });
    const replay = await app.inject({
      method: 'PUT',
      url: `${root}/calendar-connection`,
      headers,
      payload,
    });
    const read = await app.inject({
      method: 'GET',
      url: `${root}/calendar-connection`,
      headers,
    });
    const child = await app.inject({
      method: 'GET',
      url: `${root}/calendar-connection`,
      headers: { 'x-hearth-demo-actor': 'member_ezra' },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      replayed: false,
      connection: {
        provider: 'caldav',
        serverHost: 'caldav.icloud.com',
        accountHint: 'f•••@example.com',
        readOnly: true,
        calendars: [
          { displayName: 'Family', owner: null },
          { displayName: 'Ezra', owner: { id: 'member_ezra' } },
        ],
      },
      audit: { action: 'calendar.connection.save' },
    });
    expect(replay.json()).toMatchObject({ replayed: true });
    expect(read.json()).toMatchObject(saved.json().connection);
    expect(JSON.stringify(read.json())).not.toContain(password);
    expect(child.statusCode).toBe(403);

    const removed = await app.inject({
      method: 'POST',
      url: `${root}/calendar-connection/removals`,
      headers,
      payload: { requestId: 'request_calendar_http_remove' },
    });
    const after = await app.inject({
      method: 'GET',
      url: `${root}/calendar-connection`,
      headers,
    });
    expect(removed.json()).toMatchObject({
      connection: null,
      audit: { action: 'calendar.connection.remove', result: 'reversed' },
    });
    expect(after.json()).toBeNull();
  });

  it('returns stable calendar setup validation and sign-in errors', async () => {
    const app = server();
    const url = '/api/v1/households/household_hearth_demo/calendar-connection-tests';
    const headers = { 'x-hearth-demo-actor': 'member_maya' };
    const insecure = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: {
        serverUrl: 'http://calendar.example.com',
        username: 'fictional@example.com',
        appPassword: 'demo-password',
      },
    });
    const rejected = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: {
        serverUrl: 'https://caldav.icloud.com',
        username: 'fictional@example.com',
        appPassword: 'wrong-password',
      },
    });
    expect(insecure.statusCode).toBe(400);
    expect(insecure.json().error.code).toBe('VALIDATION_ERROR');
    expect(rejected.statusCode).toBe(503);
    expect(rejected.json().error).toMatchObject({
      code: 'INTEGRATION_UNAVAILABLE',
      retryable: false,
    });
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

  it('stores, serves and restores a member profile photo through the typed command routes', async () => {
    const app = server();
    const root = '/api/v1/households/household_hearth_demo/members/member_ezra/avatar';
    const headers = { 'x-hearth-demo-actor': 'member_maya' };
    const dataBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
    const update = await app.inject({
      method: 'PUT',
      url: root,
      headers,
      payload: {
        requestId: 'request_avatar_http_update',
        mimeType: 'image/jpeg',
        dataBase64,
      },
    });
    const replay = await app.inject({
      method: 'PUT',
      url: root,
      headers,
      payload: {
        requestId: 'request_avatar_http_update',
        mimeType: 'image/jpeg',
        dataBase64,
      },
    });
    const image = await app.inject({ method: 'GET', url: root });
    const childDenied = await app.inject({
      method: 'PUT',
      url: root,
      headers: { 'x-hearth-demo-actor': 'member_ezra' },
      payload: {
        requestId: 'request_avatar_http_child',
        mimeType: 'image/jpeg',
        dataBase64,
      },
    });
    const invalid = await app.inject({
      method: 'PUT',
      url: root,
      headers,
      payload: {
        requestId: 'request_avatar_http_invalid',
        mimeType: 'image/jpeg',
        dataBase64: Buffer.from('not-a-jpeg').toString('base64'),
      },
    });
    const reset = await app.inject({
      method: 'POST',
      url: `${root}-resets`,
      headers,
      payload: { requestId: 'request_avatar_http_reset' },
    });
    const removed = await app.inject({ method: 'GET', url: root });

    expect(update).toMatchObject({ statusCode: 200 });
    expect(update.json()).toMatchObject({
      replayed: false,
      member: { avatarUrl: expect.stringContaining('/member_ezra/avatar?v=') },
      audit: { action: 'member.avatar.update' },
    });
    expect(replay.json()).toMatchObject({ replayed: true });
    expect(image.headers).toMatchObject({
      'content-type': 'image/jpeg',
      'x-content-type-options': 'nosniff',
    });
    expect(image.rawPayload).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    expect(childDenied.statusCode).toBe(403);
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR');
    expect(reset.json()).toMatchObject({
      member: { avatarUrl: '/demo/ezra.png' },
      audit: { action: 'member.avatar.reset' },
    });
    expect(removed.statusCode).toBe(404);
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

  it('plans meals and exposes idempotent partial payment and void commands', async () => {
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
    const settings = await app.inject({
      method: 'PUT',
      url: '/api/v1/households/household_hearth_demo/members/member_ezra/pocket-money-settings',
      headers,
      payload: {
        requestId: 'request_pocket_settings_http_001',
        weeklyAmountCents: 1500,
        payday: 'friday',
        weekStart: '2026-08-03',
        asOfDate: '2026-08-03',
      },
    });
    const completion = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/chore-occurrences/occurrence_school_bag/completions',
      payload: { requestId: 'request_pocket_chore_http_001' },
    });
    const overview = await app.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/pocket-money?weekStart=2026-08-03&asOf=2026-08-03',
    });
    const payment = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/pocket-money-payments',
      headers,
      payload: {
        requestId: 'request_pocket_payment_http_001',
        memberId: 'member_ezra',
        weekStart: '2026-08-03',
        asOfDate: '2026-08-03',
        amountCents: 200,
        note: 'Cash',
      },
    });
    const overpayment = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/pocket-money-payments',
      headers,
      payload: {
        requestId: 'request_pocket_payment_http_overpayment',
        memberId: 'member_ezra',
        weekStart: '2026-08-03',
        asOfDate: '2026-08-03',
        amountCents: 301,
      },
    });
    const zeroPayment = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/pocket-money-payments',
      headers,
      payload: {
        requestId: 'request_pocket_payment_http_zero',
        memberId: 'member_ezra',
        weekStart: '2026-08-03',
        asOfDate: '2026-08-03',
        amountCents: 0,
      },
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/pocket-money-payments',
      headers,
      payload: {
        requestId: 'request_pocket_payment_http_001',
        memberId: 'member_ezra',
        weekStart: '2026-08-03',
        asOfDate: '2026-08-03',
        amountCents: 200,
        note: 'Cash',
      },
    });
    const remainder = await app.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/pocket-money-payments',
      headers,
      payload: {
        requestId: 'request_pocket_payment_http_002',
        memberId: 'member_ezra',
        weekStart: '2026-08-03',
        asOfDate: '2026-08-03',
        amountCents: 300,
      },
    });
    const paymentVoid = await app.inject({
      method: 'POST',
      url: `/api/v1/households/household_hearth_demo/pocket-money-payments/${remainder.json().payment.id}/voids`,
      headers,
      payload: {
        requestId: 'request_pocket_payment_void_http_001',
        asOfDate: '2026-08-03',
        reason: 'Wrong account',
      },
    });
    const paymentVoidReplay = await app.inject({
      method: 'POST',
      url: `/api/v1/households/household_hearth_demo/pocket-money-payments/${remainder.json().payment.id}/voids`,
      headers,
      payload: {
        requestId: 'request_pocket_payment_void_http_001',
        asOfDate: '2026-08-03',
        reason: 'Wrong account',
      },
    });
    const secondPaymentVoid = await app.inject({
      method: 'POST',
      url: `/api/v1/households/household_hearth_demo/pocket-money-payments/${remainder.json().payment.id}/voids`,
      headers,
      payload: {
        requestId: 'request_pocket_payment_void_http_002',
        asOfDate: '2026-08-03',
        reason: 'Another correction',
      },
    });
    const afterVoid = await app.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/pocket-money?weekStart=2026-08-03&asOf=2026-08-03',
    });
    const removedRewardsRoute = await app.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/rewards',
    });

    expect(meal.json()).toMatchObject({ entry: { mealName: 'Vegetable curry' } });
    expect(settings.json()).toMatchObject({
      child: { weeklyAmountCents: 1500, payday: 'friday' },
    });
    expect(completion.statusCode).toBe(200);
    expect(overview.json().children[0]).toMatchObject({
      completedCount: 1,
      scheduledCount: 3,
      completionPercentage: 33,
      earnedAmountCents: 500,
    });
    expect(payment.json()).toMatchObject({
      payment: { amountCents: 200, note: 'Cash' },
      child: { status: 'partially-paid', remainingAmountCents: 300 },
      replayed: false,
    });
    expect(replay.json()).toMatchObject({ payment: { amountCents: 200 }, replayed: true });
    expect(overpayment.statusCode).toBe(409);
    expect(overpayment.json().error).toMatchObject({
      code: 'CONFLICT',
      message: 'Only $3.00 remains due for this week.',
    });
    expect(zeroPayment.statusCode).toBe(400);
    expect(zeroPayment.json().error.code).toBe('VALIDATION_ERROR');
    expect(remainder.json()).toMatchObject({ child: { status: 'paid' } });
    expect(paymentVoid.json()).toMatchObject({
      payment: { void: { reason: 'Wrong account' } },
      child: { status: 'partially-paid', remainingAmountCents: 300 },
      replayed: false,
    });
    expect(paymentVoidReplay.json()).toMatchObject({ replayed: true });
    expect(secondPaymentVoid.statusCode).toBe(409);
    expect(secondPaymentVoid.json().error.code).toBe('CONFLICT');
    expect(afterVoid.json().children[0]).toMatchObject({
      status: 'partially-paid',
      paidAmountCents: 200,
    });
    expect(afterVoid.json().recentPayments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: remainder.json().payment.id,
          void: expect.objectContaining({ reason: 'Wrong account' }),
        }),
      ]),
    );
    expect(removedRewardsRoute.statusCode).toBe(404);
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
