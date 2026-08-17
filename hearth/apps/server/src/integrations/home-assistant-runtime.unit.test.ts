import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  HomeAssistantRestProvider,
  createHomeAssistantProvider,
  discoverHomeAssistant,
  loadHomeAssistantProvider,
  removeHomeAssistantRuntimeConfig,
  resolveHomeAssistantProvider,
  writeHomeAssistantRuntimeConfig,
  type HomeAssistantRuntimeConfig,
} from './home-assistant-runtime.js';

const temporaryDirectories: string[] = [];
const ACCESS_TOKEN = 'private-home-assistant-token';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Home Assistant REST runtime', () => {
  it('discovers friendly allowlist candidates without exposing provider responses', async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({
        url,
        authorization: new Headers(init?.headers).get('Authorization'),
      });
      if (url.endsWith('/api/config')) {
        return jsonResponse({ location_name: 'Ramsay Home', version: '2026.8.1' });
      }
      return jsonResponse([
        state('person.david', 'home', 'David'),
        state('media_player.living_room_tv', 'idle', 'Living room television'),
        state('input_boolean.hearth_foreground', 'on', 'Hearth app active'),
        state('binary_sensor.protected_playback', 'off', 'Protected playback active'),
        state('script.hearth_evening', 'off', 'Evening'),
        state('script.hearth_goodnight', 'off', 'Goodnight'),
        state('script.hearth_screen_off', 'off', 'Screen off'),
        state('light.kitchen', 'on', 'Kitchen light'),
      ]);
    });

    const discovery = await discoverHomeAssistant(
      { serverUrl: 'http://homeassistant.local:8123', accessToken: ACCESS_TOKEN },
      fetcher as unknown as typeof fetch,
    );

    expect(discovery).toMatchObject({
      instanceName: 'Ramsay Home',
      version: '2026.8.1',
      options: {
        occupancy: expect.arrayContaining([
          expect.objectContaining({ externalId: 'person.david' }),
        ]),
        televisionPower: expect.arrayContaining([
          expect.objectContaining({ externalId: 'media_player.living_room_tv' }),
        ]),
        hearthForeground: expect.arrayContaining([
          expect.objectContaining({ externalId: 'input_boolean.hearth_foreground' }),
        ]),
        protectedMedia: expect.arrayContaining([
          expect.objectContaining({ externalId: 'binary_sensor.protected_playback' }),
        ]),
      },
    });
    expect(discovery.options.scripts).toHaveLength(3);
    expect(JSON.stringify(discovery)).not.toContain('light.kitchen');
    expect(requests.map(({ authorization }) => authorization)).toEqual([
      `Bearer ${ACCESS_TOKEN}`,
      `Bearer ${ACCESS_TOKEN}`,
    ]);
  });

  it('returns a stable bounded candidate set for large Home Assistant installations', async () => {
    const manySensors = Array.from({ length: 85 }, (_, index) =>
      state(
        `binary_sensor.sensor_${String(84 - index).padStart(2, '0')}`,
        'off',
        `Sensor ${String(84 - index).padStart(2, '0')}`,
      ),
    );
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith('/api/config')
        ? jsonResponse({ location_name: 'Large Home', version: '2026.8.1' })
        : jsonResponse([
            ...manySensors,
            state('media_player.living_room_tv', 'idle', 'Living room television'),
            state('input_boolean.hearth_foreground', 'on', 'Hearth app active'),
            state('script.hearth_evening', 'off', 'Evening'),
          ]),
    );

    const discovery = await discoverHomeAssistant(
      { serverUrl: 'http://homeassistant.local:8123', accessToken: ACCESS_TOKEN },
      fetcher as unknown as typeof fetch,
    );

    expect(discovery.options.occupancy).toHaveLength(80);
    expect(discovery.options.occupancy[0]?.displayName).toBe('Hearth app active');
    expect(discovery.options.occupancy.at(-1)?.displayName).toBe('Sensor 78');
  });

  it('reads only mapped safety states and invokes only the mapped script endpoint', async () => {
    const calls: Array<{ url: string; body: string | null }> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: typeof init?.body === 'string' ? init.body : null });
      if (url.endsWith('/api/services/script/turn_on')) return jsonResponse([]);
      const entityId = decodeURIComponent(url.split('/api/states/')[1] ?? '');
      const states: Record<string, string> = {
        'person.family': 'home',
        'media_player.living_room_tv': 'idle',
        'input_boolean.hearth_foreground': 'on',
        'media_player.protected_playback': 'idle',
      };
      return jsonResponse(state(entityId, states[entityId] ?? 'off', entityId));
    });
    const provider = new HomeAssistantRestProvider(config(), fetcher as unknown as typeof fetch);

    await expect(provider.readHouseholdState()).resolves.toEqual({
      occupied: true,
      televisionPower: 'on',
      hearthForeground: true,
      protectedMediaActive: false,
      observedAt: '2026-08-10T03:00:00.000Z',
    });
    await provider.runScript('script.hearth_goodnight');

    expect(calls).toHaveLength(5);
    expect(calls.at(-1)).toMatchObject({
      url: 'http://homeassistant.local:8123/api/services/script/turn_on',
      body: JSON.stringify({ entity_id: 'script.actual_goodnight' }),
    });
  });

  it('maps network, authentication and malformed responses to secret-safe errors', async () => {
    const unreachable = new HomeAssistantRestProvider(
      config(),
      vi.fn(async () =>
        Promise.reject(new Error(`leaked ${ACCESS_TOKEN}`)),
      ) as unknown as typeof fetch,
    );
    const unauthorized = new HomeAssistantRestProvider(
      config(),
      vi.fn(async () => new Response(null, { status: 401 })) as unknown as typeof fetch,
    );
    const malformed = new HomeAssistantRestProvider(
      config(),
      vi.fn(async () => jsonResponse({ entity_id: 'bad' })) as unknown as typeof fetch,
    );

    for (const provider of [unreachable, unauthorized, malformed]) {
      const error = await provider.readHouseholdState().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) throw new Error('Expected a Home Assistant runtime error.');
      expect(JSON.stringify({ name: error.name, message: error.message })).not.toContain(
        ACCESS_TOKEN,
      );
    }
  });

  it('writes, reloads and removes an external mode-0600 secret file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-home-assistant-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'home-assistant.json');

    await writeHomeAssistantRuntimeConfig(path, config());
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await readFile(path, 'utf8')).toContain(ACCESS_TOKEN);
    expect(await loadHomeAssistantProvider(path)).toBeInstanceOf(HomeAssistantRestProvider);
    expect(createHomeAssistantProvider(config())).toBeInstanceOf(HomeAssistantRestProvider);

    await removeHomeAssistantRuntimeConfig(path);
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps demo mode isolated and treats a missing private secret as unconfigured', async () => {
    await expect(
      resolveHomeAssistantProvider({
        demoMode: true,
        configPath: '/run/hearth-secrets/home-assistant.json',
      }),
    ).rejects.toThrow('disabled while HEARTH_MODE=demo');

    const directory = await mkdtemp(join(tmpdir(), 'hearth-home-assistant-missing-'));
    temporaryDirectories.push(directory);
    const provider = await resolveHomeAssistantProvider({
      demoMode: false,
      configPath: join(directory, 'missing.json'),
    });

    expect(provider?.configured).toBe(false);
  });
});

function config(): HomeAssistantRuntimeConfig {
  return {
    version: 1,
    provider: 'home-assistant',
    serverUrl: 'http://homeassistant.local:8123',
    accessToken: ACCESS_TOKEN,
    stateMappings: {
      occupancy: 'person.family',
      televisionPower: 'media_player.living_room_tv',
      hearthForeground: 'input_boolean.hearth_foreground',
      protectedMedia: 'media_player.protected_playback',
    },
    actionMappings: {
      evening: 'script.actual_evening',
      goodnight: 'script.actual_goodnight',
      screenOff: 'script.actual_screen_off',
    },
  };
}

function state(entityId: string, value: string, friendlyName: string) {
  return {
    entity_id: entityId,
    state: value,
    last_changed: '2026-08-10T03:00:00.000Z',
    last_updated: '2026-08-10T03:00:00.000Z',
    attributes: { friendly_name: friendlyName },
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
