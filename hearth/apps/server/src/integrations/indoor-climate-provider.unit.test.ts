import { describe, expect, it, vi } from 'vitest';
import { IndoorClimateSchema } from '@hearth/shared';
import {
  IndoorRuntimeSchema,
  RestIndoorProvider,
  indoorWindow,
  type IndoorRuntime,
} from './indoor-climate-provider.js';
const now = new Date('2026-10-29T11:30:00Z');
const config: IndoorRuntime = {
  version: 1,
  householdId: 'household_test',
  revision: 1,
  serverUrl: 'http://homeassistant.local',
  accessToken: 'private-test-token-never-public',
  rooms: [
    {
      id: 'room_bedroom',
      label: 'Bedroom',
      temperature: 'sensor.room_temperature',
      humidity: 'sensor.room_humidity',
    },
  ],
};
const state = (
  id: string,
  metric: string,
  value: string,
  unit = metric === 'temperature' ? '°C' : '%',
) => ({
  entity_id: id,
  state: value,
  last_updated: now.toISOString(),
  attributes: {
    device_class: metric,
    state_class: 'measurement',
    unit_of_measurement: unit,
    friendly_name: `Room ${metric}`,
  },
});
const sample = {
  start: '2026-10-29T11:00:00Z',
  end: '2026-10-29T11:05:00Z',
  mean: 21,
  min: 20,
  max: 22,
};
const json = (body: unknown) => Response.json(body);
describe('read-only indoor HA adapter', () => {
  it('retains the partial current-day aggregate in a year view without inventing future coverage', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).includes('/services/')
        ? json({
            service_response: {
              statistics: {
                'sensor.room_temperature': [
                  { ...sample, start: '2026-10-29T00:00:00Z', end: '2026-10-30T00:00:00Z' },
                ],
              },
            },
          })
        : json(
            String(input).endsWith('humidity')
              ? state('sensor.room_humidity', 'humidity', '55')
              : state('sensor.room_temperature', 'temperature', '21'),
          ),
    );
    const data = await new RestIndoorProvider(fetcher).read(config, 'year', now);
    expect(data.rooms[0]?.temperature?.samples).toHaveLength(1);
    expect(data.rooms[0]?.temperature?.samples[0]?.end).toBe(indoorWindow('year', now).end);
  });
  it('discovers only compatible measurement sensors without selecting diagnostic or unrelated entities', async () => {
    const fetcher = vi.fn(async () =>
      json([
        state('sensor.room_temperature', 'temperature', '21'),
        state('sensor.room_humidity', 'humidity', '55'),
        state('sensor.pressure', 'pressure', '1011', 'hPa'),
        {
          ...state('sensor.bad', 'temperature', '1'),
          attributes: { device_class: 'temperature', unit_of_measurement: '°C' },
        },
        state('light.room', 'temperature', '21'),
      ]),
    );
    const choices = await new RestIndoorProvider(fetcher).discover(config);
    expect(choices.map((item) => item.externalId).sort()).toEqual([
      'sensor.room_humidity',
      'sensor.room_temperature',
    ]);
    expect(fetcher.mock.calls).toHaveLength(1);
  });
  it('uses only exact state reads and the fixed statistics read action, converts Fahrenheit and keeps wire data private', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin).toBe(config.serverUrl);
      expect(init?.redirect).toBe('error');
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${config.accessToken}`);
      if (url.pathname.includes('/services/')) {
        expect(url.pathname).toBe('/api/services/recorder/get_statistics');
        expect(url.search).toBe('?return_response');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          statistic_ids: ['sensor.room_temperature', 'sensor.room_humidity'],
          period: '5minute',
          types: ['mean', 'min', 'max'],
          units: { temperature: '°C' },
        });
        return json({
          changed_states: [],
          service_response: {
            statistics: {
              'sensor.room_temperature': [sample],
              'sensor.room_humidity': [{ ...sample, mean: 55, min: 50, max: 60 }],
            },
          },
        });
      }
      expect(init?.method).toBeUndefined();
      return json(
        url.pathname.endsWith('temperature')
          ? state('sensor.room_temperature', 'temperature', '68', '°F')
          : state('sensor.room_humidity', 'humidity', '55'),
      );
    });
    const result = await new RestIndoorProvider(fetcher).read(config, 'day', now);
    expect(result).toMatchObject({
      status: 'current',
      rooms: [{ temperature: { value: 20 }, humidity: { value: 55 } }],
    });
    const wire = IndoorClimateSchema.parse({
      ...result,
      ...indoorWindow('day', now),
      period: 'day',
      timezone: 'Australia/Perth',
      fetchedAt: now.toISOString(),
    });
    expect(JSON.stringify(wire)).not.toMatch(/sensor\.|private-test-token|homeassistant\.local/);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each(['unavailable', 'unknown', '', 'NaN', 'Infinity', '101'])(
    'never treats invalid humidity %s as zero',
    async (value) => {
      const fetcher = vi.fn(async (input: string | URL | Request) =>
        String(input).includes('/services/')
          ? json({ service_response: { statistics: {} } })
          : json(
              String(input).endsWith('humidity')
                ? state('sensor.room_humidity', 'humidity', value)
                : state('sensor.room_temperature', 'temperature', '21'),
            ),
      );
      const result = await new RestIndoorProvider(fetcher).read(config, 'day', now);
      expect(result.rooms[0]?.humidity).toMatchObject({ value: null, status: 'unavailable' });
      expect(result.rooms[0]?.temperature?.value).toBe(21);
    },
  );
  it('keeps live readings when statistics fail, reports old readings and uses a bounded daily year query', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes('/services/')) {
        expect(JSON.parse(String(init?.body)).period).toBe('day');
        return new Response(null, { status: 404 });
      }
      return json({
        ...state(
          String(input).endsWith('humidity') ? 'sensor.room_humidity' : 'sensor.room_temperature',
          String(input).endsWith('humidity') ? 'humidity' : 'temperature',
          '21',
        ),
        last_updated: '2026-10-28T00:00:00Z',
      });
    });
    const result = await new RestIndoorProvider(fetcher).read(config, 'year', now);
    expect(result.rooms[0]?.temperature).toMatchObject({
      value: 21,
      status: 'stale',
      historyStatus: 'unavailable',
    });
    expect(
      Date.parse(indoorWindow('year', now).end) - Date.parse(indoorWindow('year', now).start),
    ).toBe(365 * 86400_000);
  });
  it('rejects response identity swaps and malformed or oversized statistics', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).includes('/services/')
        ? json({
            service_response: {
              statistics: { 'sensor.room_temperature': Array.from({ length: 371 }, () => sample) },
            },
          })
        : json(state('sensor.wrong', 'temperature', '21')),
    );
    const result = await new RestIndoorProvider(fetcher).read(config, 'day', now);
    expect(result.status).toBe('unavailable');
    expect(result.rooms[0]?.temperature?.value).toBeNull();
  });
  it('validates raw selections to sensor IDs only and disallows duplicate mappings', () => {
    expect(
      IndoorRuntimeSchema.safeParse({
        ...config,
        rooms: [{ ...config.rooms[0], temperature: 'script.turn_off' }],
      }).success,
    ).toBe(false);
    expect(
      IndoorRuntimeSchema.safeParse({
        ...config,
        rooms: [config.rooms[0], { ...config.rooms[0], id: 'room_other' }],
      }).success,
    ).toBe(false);
  });
});
