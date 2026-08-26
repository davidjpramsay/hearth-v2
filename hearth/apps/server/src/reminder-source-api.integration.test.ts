import { afterEach, describe, expect, it } from 'vitest';

import { buildServer } from './app.js';

const servers: ReturnType<typeof buildServer>[] = [];
const secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => server.close()));
});

describe('native Reminders source API v1', () => {
  it('uses approval-gated, device-scoped authentication for snapshot replacement', async () => {
    const server = buildServer({ logger: false });
    servers.push(server);
    const pairingResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/reminder-source-pairing-requests',
      payload: {
        requestId: 'request_reminder_api_pair',
        deviceName: "David's iPhone",
        platform: 'ios',
        applicationVersion: '1.0.0',
        pairingSecret: secret,
      },
    });
    expect(pairingResponse.statusCode).toBe(200);
    const pairing = pairingResponse.json<{ id: string; code: string }>();

    const approvalResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/households/household_hearth_demo/reminder-source-pairing-approvals',
      headers: { 'x-hearth-demo-actor': 'member_maya' },
      payload: { requestId: 'request_reminder_api_approve', code: pairing.code },
    });
    expect(approvalResponse.statusCode).toBe(200);
    expect(approvalResponse.json()).toMatchObject({ status: 'approved' });

    const exchangeResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/reminder-source-pairing-requests/${pairing.id}/exchanges`,
      payload: { requestId: 'request_reminder_api_exchange', pairingSecret: secret },
    });
    expect(exchangeResponse.statusCode).toBe(200);
    expect(exchangeResponse.headers['set-cookie']).toBeUndefined();
    const session = exchangeResponse.json<{
      householdId: string;
      sourceId: string;
      deviceId: string;
      scopes: string[];
    }>();
    expect(session).toMatchObject({
      householdId: 'household_hearth_demo',
      scopes: ['reminders.snapshot.write'],
    });

    const bearerAttempt = await server.inject({
      method: 'GET',
      url: '/api/v1/reminder-source-sessions/current',
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(bearerAttempt.statusCode).toBe(401);

    const snapshotResponse = await server.inject({
      method: 'PUT',
      url: `/api/v1/reminder-sources/${session.sourceId}/snapshots/current`,
      headers: { authorization: `HearthReminderSource ${secret}` },
      payload: {
        requestId: 'request_reminder_api_snapshot',
        contractVersion: 1,
        snapshotId: 'snapshot_reminder_api_001',
        sequence: 1,
        generatedAt: '2026-08-03T07:41:00+08:00',
        lists: [{ sourceListId: 'eventkit-list-family', title: 'Family Reminders' }],
        reminders: [
          {
            sourceReminderId: 'eventkit-reminder-test',
            sourceListId: 'eventkit-list-family',
            title: 'Test Reminder',
            dueLocalDate: '2026-08-03',
            dueAt: null,
            hasDueTime: false,
            isCompleted: false,
            completedAt: null,
            sourceUpdatedAt: null,
          },
        ],
      },
    });
    expect(snapshotResponse.statusCode).toBe(200);
    expect(snapshotResponse.json()).toMatchObject({
      sequence: 1,
      reminderCount: 1,
      nextSnapshotSequence: 2,
    });

    const overviewResponse = await server.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/reminders',
    });
    expect(overviewResponse.statusCode).toBe(200);
    expect(overviewResponse.json()).toMatchObject({
      source: { status: 'current', reminderCount: 1 },
      reminders: [{ title: 'Test Reminder' }],
    });

    const todayResponse = await server.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/today?date=2026-08-03',
    });
    expect(todayResponse.statusCode).toBe(200);
    expect(todayResponse.json()).toMatchObject({
      reminderSummary: {
        sourceStatus: 'current',
        dueTodayCount: 1,
        items: [{ title: 'Test Reminder', dueAt: null, hasDueTime: false }],
      },
      sections: { reminders: true },
    });

    const revokeResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/households/household_hearth_demo/reminder-source-devices/${session.deviceId}/revocations`,
      headers: { 'x-hearth-demo-actor': 'member_maya' },
      payload: { requestId: 'request_reminder_api_revoke' },
    });
    expect(revokeResponse.statusCode).toBe(200);
    expect(revokeResponse.json()).toMatchObject({ source: { status: 'revoked' } });

    const revokedSessionResponse = await server.inject({
      method: 'GET',
      url: '/api/v1/reminder-source-sessions/current',
      headers: { authorization: `HearthReminderSource ${secret}` },
    });
    expect(revokedSessionResponse.statusCode).toBe(401);
  });
});
