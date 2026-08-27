import { afterEach, describe, expect, it } from 'vitest';

import { buildServer } from './app.js';

const servers: ReturnType<typeof buildServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('Hearth reminder API', () => {
  it('owns reminder creation, completion and deletion without an external source', async () => {
    const app = buildServer();
    servers.push(app);
    const base = '/api/v1/households/household_hearth_demo/reminders';

    const initial = await app.inject({ method: 'GET', url: `${base}?includeCompleted=false` });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).not.toHaveProperty('source');

    const created = await app.inject({
      method: 'POST',
      url: base,
      headers: { 'x-hearth-demo-actor': 'member_maya' },
      payload: {
        requestId: 'request_api_reminder_create',
        title: 'Water seedlings',
        dueLocalDate: null,
        dueAt: null,
        hasDueTime: false,
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      reminder: { title: 'Water seedlings' },
      replayed: false,
    });
    const reminderId = created.json().reminder.id as string;

    const completed = await app.inject({
      method: 'PUT',
      url: `${base}/${reminderId}/completion`,
      headers: { 'x-hearth-demo-actor': 'member_maya' },
      payload: { requestId: 'request_api_reminder_complete', isCompleted: true },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({ reminder: { isCompleted: true } });

    const removed = await app.inject({
      method: 'POST',
      url: `${base}/${reminderId}/deletions`,
      headers: { 'x-hearth-demo-actor': 'member_maya' },
      payload: { requestId: 'request_api_reminder_delete' },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({ reminderId });

    const oldPairing = await app.inject({
      method: 'POST',
      url: '/api/v1/reminder-source-pairing-requests',
      payload: {},
    });
    expect(oldPairing.statusCode).toBe(404);
  });
});
