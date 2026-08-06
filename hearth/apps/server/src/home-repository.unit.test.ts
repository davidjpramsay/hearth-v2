import { describe, expect, it } from 'vitest';

import { FakeHomeAssistantProvider } from './integrations/home-assistant-provider.js';
import { HomeService } from './home-repository.js';
import type { CommandActor, RepositoryError } from './repository.js';

const tv: CommandActor = {
  id: 'device_living_room_tv',
  type: 'device',
  source: 'tv',
};

describe('HomeService', () => {
  it('projects only curated household and power-safety state', async () => {
    const service = new HomeService();
    const status = await service.getStatus('household_hearth_demo');
    expect(status).toMatchObject({
      roomLabel: 'Living room',
      occupancy: 'occupied',
      televisionPower: 'on',
      protectedMediaActive: false,
      integration: { kind: 'home-assistant', status: 'healthy' },
    });
    expect(Object.keys(status)).not.toEqual(
      expect.arrayContaining(['mediaTitle', 'mediaApp', 'entityId', 'service']),
    );
  });

  it('maps an idempotent action only to its allowlisted script', async () => {
    const provider = new FakeHomeAssistantProvider();
    const service = new HomeService(provider);
    const input = { requestId: 'request_home_evening_001', confirmed: false };
    const first = await service.executeAction('household_hearth_demo', 'evening-mode', input, tv);
    const replay = await service.executeAction('household_hearth_demo', 'evening-mode', input, tv);
    expect(first).toMatchObject({ actionId: 'evening-mode', replayed: false });
    expect(replay).toMatchObject({ actionId: 'evening-mode', replayed: true });
    expect(provider.calls).toEqual(['script.hearth_evening']);
  });

  it('requires confirmation, adult authority and a clear protected-media guard', async () => {
    const provider = new FakeHomeAssistantProvider();
    const service = new HomeService(provider);
    await expect(
      service.executeAction(
        'household_hearth_demo',
        'goodnight',
        { requestId: 'request_home_goodnight_001', confirmed: false },
        tv,
      ),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' } satisfies Partial<RepositoryError>);
    await expect(
      service.executeAction(
        'household_hearth_demo',
        'evening-mode',
        { requestId: 'request_home_child_001', confirmed: false },
        { id: 'member_ezra', type: 'member', source: 'companion' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<RepositoryError>);
    service.setScenario('protected-media');
    await expect(
      service.executeAction(
        'household_hearth_demo',
        'screen-off',
        { requestId: 'request_home_screen_001', confirmed: false },
        tv,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' } satisfies Partial<RepositoryError>);
    expect(provider.calls).toEqual([]);
  });

  it('keeps the last curated state available during a Home Assistant outage', async () => {
    const service = new HomeService();
    await service.getStatus('household_hearth_demo');
    service.setScenario('unavailable');
    const status = await service.getStatus('household_hearth_demo');
    expect(status).toMatchObject({
      freshness: 'stale',
      occupancy: 'occupied',
      integration: { status: 'unavailable' },
    });
    expect(status.actions.every((action) => !action.enabled)).toBe(true);
  });
});
