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
            sourceReminderId: 'eventkit-reminder-overdue',
            sourceListId: 'eventkit-list-family',
            title: 'Overdue reminder',
            dueLocalDate: '2026-08-02',
            dueAt: null,
            hasDueTime: false,
            isCompleted: false,
            completedAt: null,
            sourceUpdatedAt: null,
          },
          {
            sourceReminderId: 'eventkit-reminder-today',
            sourceListId: 'eventkit-list-family',
            title: 'Due today reminder',
            dueLocalDate: '2026-08-03',
            dueAt: null,
            hasDueTime: false,
            isCompleted: false,
            completedAt: null,
            sourceUpdatedAt: null,
          },
          {
            sourceReminderId: 'eventkit-reminder-undated',
            sourceListId: 'eventkit-list-family',
            title: 'House reminder',
            dueLocalDate: null,
            dueAt: null,
            hasDueTime: false,
            isCompleted: false,
            completedAt: null,
            sourceUpdatedAt: null,
          },
          {
            sourceReminderId: 'eventkit-reminder-future',
            sourceListId: 'eventkit-list-family',
            title: 'Future reminder',
            dueLocalDate: '2026-08-04',
            dueAt: null,
            hasDueTime: false,
            isCompleted: false,
            completedAt: null,
            sourceUpdatedAt: null,
          },
          {
            sourceReminderId: 'eventkit-reminder-completed',
            sourceListId: 'eventkit-list-family',
            title: 'Completed reminder',
            dueLocalDate: '2026-08-01',
            dueAt: null,
            hasDueTime: false,
            isCompleted: true,
            completedAt: '2026-08-02T09:00:00+08:00',
            sourceUpdatedAt: null,
          },
        ],
      },
    });
    expect(snapshotResponse.statusCode).toBe(200);
    expect(snapshotResponse.json()).toMatchObject({
      sequence: 1,
      reminderCount: 5,
      nextSnapshotSequence: 2,
    });

    const overviewResponse = await server.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/reminders',
    });
    expect(overviewResponse.statusCode).toBe(200);
    expect(overviewResponse.json()).toMatchObject({
      source: { status: 'current', reminderCount: 5 },
      reminders: [
        { title: 'Overdue reminder' },
        { title: 'Due today reminder' },
        { title: 'Future reminder' },
        { title: 'House reminder' },
      ],
    });

    const todayResponse = await server.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/today?date=2026-08-03',
    });
    expect(todayResponse.statusCode).toBe(200);
    expect(todayResponse.json()).toMatchObject({
      reminderSummary: {
        sourceStatus: 'current',
        openCount: 4,
        items: [
          { title: 'Overdue reminder', dueAt: null, hasDueTime: false },
          { title: 'Due today reminder', dueAt: null, hasDueTime: false },
          { title: 'House reminder', dueAt: null, hasDueTime: false },
        ],
      },
      sections: { reminders: true },
    });

    const completedOnlySnapshotResponse = await server.inject({
      method: 'PUT',
      url: `/api/v1/reminder-sources/${session.sourceId}/snapshots/current`,
      headers: { authorization: `HearthReminderSource ${secret}` },
      payload: {
        requestId: 'request_reminder_api_snapshot_completed',
        contractVersion: 1,
        snapshotId: 'snapshot_reminder_api_002',
        sequence: 2,
        generatedAt: '2026-08-03T07:42:00+08:00',
        lists: [{ sourceListId: 'eventkit-list-family', title: 'Family Reminders' }],
        reminders: [
          {
            sourceReminderId: 'eventkit-reminder-completed',
            sourceListId: 'eventkit-list-family',
            title: 'Completed reminder',
            dueLocalDate: '2026-08-01',
            dueAt: null,
            hasDueTime: false,
            isCompleted: true,
            completedAt: '2026-08-02T09:00:00+08:00',
            sourceUpdatedAt: null,
          },
        ],
      },
    });
    expect(completedOnlySnapshotResponse.statusCode).toBe(200);

    const noOpenTodayResponse = await server.inject({
      method: 'GET',
      url: '/api/v1/households/household_hearth_demo/today?date=2026-08-03',
    });
    expect(noOpenTodayResponse.statusCode).toBe(200);
    expect(noOpenTodayResponse.json()).toMatchObject({
      reminderSummary: {
        sourceStatus: 'current',
        openCount: 0,
        items: [],
      },
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
