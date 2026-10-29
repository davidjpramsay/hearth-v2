import { z } from 'zod';
import {
  HomeAssistantConnectionTestRequestSchema,
  type IndoorClimate,
  type IndoorMetric,
  type IndoorPeriod,
  type IndoorReading,
  type IndoorSample,
} from '@hearth/shared';
import { homeAssistantRequest, type HomeAssistantFetch } from './home-assistant-runtime.js';

const EntitySchema = z
  .string()
  .max(255)
  .regex(/^sensor\.[a-z0-9_]+$/);
const RoomSchema = z
  .object({
    id: z.string().min(1).max(120),
    label: z.string().trim().min(1).max(60),
    temperature: EntitySchema.nullable(),
    humidity: EntitySchema.nullable(),
  })
  .strict()
  .refine((room) => room.temperature !== null || room.humidity !== null);
export const IndoorRuntimeSchema = HomeAssistantConnectionTestRequestSchema.extend({
  version: z.literal(1),
  householdId: z.string().min(1).max(120),
  revision: z.number().int().positive(),
  rooms: z.array(RoomSchema).max(8),
})
  .strict()
  .superRefine((config, ctx) => {
    const ids = config.rooms.map((room) => room.id);
    const entities = config.rooms
      .flatMap((room) => [room.temperature, room.humidity])
      .filter((id) => id !== null);
    if (new Set(ids).size !== ids.length || new Set(entities).size !== entities.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate indoor room or sensor.' });
  });
export type IndoorRuntime = z.infer<typeof IndoorRuntimeSchema>;
const StateSchema = z.object({
  entity_id: z.string().max(255),
  state: z.string().max(255),
  last_updated: z.iso.datetime({ offset: true }),
  last_reported: z.iso.datetime({ offset: true }).optional(),
  attributes: z
    .object({
      friendly_name: z.string().max(200).optional(),
      device_class: z.string().optional(),
      state_class: z.string().optional(),
      unit_of_measurement: z.string().optional(),
    })
    .passthrough(),
});
type SensorState = z.infer<typeof StateSchema>;
const StatsSchema = z.object({
  service_response: z.object({
    statistics: z.record(
      z.string(),
      z
        .array(
          z.object({
            start: z.iso.datetime({ offset: true }),
            end: z.iso.datetime({ offset: true }),
            mean: z.number().finite().nullable().optional(),
            min: z.number().finite().nullable().optional(),
            max: z.number().finite().nullable().optional(),
          }),
        )
        .max(370),
    ),
  }),
});
export type IndoorCandidate = { externalId: string; label: string; metric: IndoorMetric };
export interface IndoorProvider {
  discover(
    input: z.infer<typeof HomeAssistantConnectionTestRequestSchema>,
  ): Promise<IndoorCandidate[]>;
  read(
    config: IndoorRuntime,
    period: IndoorPeriod,
    now: Date,
  ): Promise<Pick<IndoorClimate, 'rooms' | 'status'>>;
}
export function indoorWindow(period: IndoorPeriod, now: Date) {
  const days = { day: 1, week: 7, month: 30, year: 365 }[period];
  const intervalSeconds = { day: 300, week: 3600, month: 86400, year: 86400 }[period];
  const end = new Date(Math.floor(now.getTime() / 300_000) * 300_000).toISOString();
  return {
    start: new Date(Date.parse(end) - days * 86_400_000).toISOString(),
    end,
    intervalSeconds,
  };
}
export class RestIndoorProvider implements IndoorProvider {
  constructor(private readonly fetcher: HomeAssistantFetch = fetch) {}
  async discover(input: z.infer<typeof HomeAssistantConnectionTestRequestSchema>) {
    const response = await homeAssistantRequest(input, '/api/states', this.fetcher);
    const states = z
      .array(StateSchema)
      .max(20_000)
      .parse(await response.json());
    return states
      .filter((state) => eligible(state))
      .map((state) => ({
        externalId: state.entity_id,
        label: state.attributes.friendly_name?.trim().slice(0, 100) || 'Indoor sensor',
        metric: state.attributes.device_class as IndoorMetric,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, 160);
  }
  async read(config: IndoorRuntime, period: IndoorPeriod, now: Date) {
    const window = indoorWindow(period, now);
    const entities = config.rooms
      .flatMap((room) => [room.temperature, room.humidity])
      .filter((id) => id !== null);
    const states = new Map<string, SensorState>();
    const signal = AbortSignal.timeout(8_000);
    // Four state requests at a time, with one deadline for the whole projection.
    const currentReads = async () => {
      for (let i = 0; i < entities.length; i += 4)
        await Promise.all(
          entities.slice(i, i + 4).map(async (id) => {
            try {
              const response = await homeAssistantRequest(
                config,
                `/api/states/${encodeURIComponent(id)}`,
                this.fetcher,
                { signal },
              );
              const state = StateSchema.parse(await response.json());
              if (state.entity_id === id) states.set(id, state);
            } catch {
              /* One unavailable sensor must not erase another room. */
            }
          }),
        );
    };
    let stats: z.infer<typeof StatsSchema>['service_response']['statistics'] | null = null;
    const historyRead = async () => {
      if (entities.length === 0) {
        stats = {};
        return;
      }
      try {
        const response = await homeAssistantRequest(
          config,
          '/api/services/recorder/get_statistics?return_response',
          this.fetcher,
          {
            method: 'POST',
            signal,
            body: JSON.stringify({
              statistic_ids: entities,
              start_time: window.start,
              end_time: window.end,
              period: { day: '5minute', week: 'hour', month: 'day', year: 'day' }[period],
              types: ['mean', 'min', 'max'],
              units: { temperature: '°C' },
            }),
          },
        );
        stats = StatsSchema.parse(await response.json()).service_response.statistics;
      } catch {
        /* HA may support live sensor reads before this statistics action. */
      }
    };
    await Promise.all([currentReads(), historyRead()]);
    const reading = (id: string | null, metric: IndoorMetric): IndoorReading | null => {
      if (id === null) return null;
      const state = states.get(id);
      const numeric = state && eligible(state, metric) ? sensorValue(state, metric) : null;
      const reportedAt = state?.last_reported ?? state?.last_updated ?? null;
      const samples: IndoorSample[] = [];
      let invalidHistory = false;
      for (const point of stats?.[id] ?? []) {
        const start = Date.parse(point.start),
          end = Date.parse(point.end);
        if (
          start < Date.parse(window.start) - window.intervalSeconds * 1000 ||
          start >= Date.parse(window.end) ||
          end <= start ||
          end - start >
            window.intervalSeconds * 1000 + (window.intervalSeconds === 86400 ? 2 * 3600_000 : 1000)
        )
          continue;
        const mean = point.mean ?? null,
          min = point.min ?? null,
          max = point.max ?? null;
        if (
          [mean, min, max].some((n) => n !== null && !validValue(n, metric)) ||
          (min !== null && max !== null && min > max) ||
          (mean !== null && min !== null && mean < min - 0.000001) ||
          (mean !== null && max !== null && mean > max + 0.000001)
        ) {
          invalidHistory = true;
          continue;
        }
        samples.push({
          at: new Date(Math.max(start, Date.parse(window.start))).toISOString(),
          end: new Date(Math.min(end, Date.parse(window.end))).toISOString(),
          mean,
          min,
          max,
        });
      }
      samples.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      if (new Set(samples.map((sample) => Date.parse(sample.at))).size !== samples.length) {
        samples.length = 0;
        invalidHistory = true;
      }
      return {
        value: numeric,
        reportedAt,
        status:
          numeric === null
            ? 'unavailable'
            : reportedAt !== null && now.getTime() - Date.parse(reportedAt) > 6 * 3600_000
              ? 'stale'
              : 'current',
        historyStatus:
          stats === null || invalidHistory
            ? 'unavailable'
            : samples.length === 0
              ? 'empty'
              : 'available',
        samples,
      };
    };
    const rooms = config.rooms.map((room) => ({
      id: room.id,
      label: room.label,
      temperature: reading(room.temperature, 'temperature'),
      humidity: reading(room.humidity, 'humidity'),
    }));
    const readings = rooms
      .flatMap((room) => [room.temperature, room.humidity])
      .filter((item) => item !== null);
    const status =
      rooms.length === 0
        ? 'empty'
        : readings.every((item) => item.value === null && item.samples.length === 0)
          ? 'unavailable'
          : readings.some(
                (item) => item.status !== 'current' || item.historyStatus === 'unavailable',
              )
            ? 'partial'
            : 'current';
    return { rooms, status } as const;
  }
}
function eligible(state: SensorState, metric?: IndoorMetric) {
  const kind = state.attributes.device_class;
  return (
    EntitySchema.safeParse(state.entity_id).success &&
    (metric === undefined || kind === metric) &&
    (kind === 'temperature' || kind === 'humidity') &&
    state.attributes.state_class === 'measurement' &&
    (kind === 'humidity'
      ? state.attributes.unit_of_measurement === '%'
      : ['°C', '°F', 'K'].includes(state.attributes.unit_of_measurement ?? ''))
  );
}
function sensorValue(state: SensorState, metric: IndoorMetric) {
  if (state.state.trim() === '') return null;
  let value = Number(state.state);
  if (metric === 'temperature') {
    if (state.attributes.unit_of_measurement === '°F') value = ((value - 32) * 5) / 9;
    if (state.attributes.unit_of_measurement === 'K') value -= 273.15;
  }
  return validValue(value, metric) ? Math.round(value * 100) / 100 : null;
}
function validValue(value: number, metric: IndoorMetric) {
  return (
    Number.isFinite(value) &&
    value >= (metric === 'humidity' ? 0 : -100) &&
    value <= (metric === 'humidity' ? 100 : 100)
  );
}

export class DemoIndoorProvider implements IndoorProvider {
  async discover() {
    return [
      {
        externalId: 'sensor.demo_room_temperature',
        label: 'Family room temperature',
        metric: 'temperature' as const,
      },
      {
        externalId: 'sensor.demo_room_humidity',
        label: 'Family room humidity',
        metric: 'humidity' as const,
      },
    ];
  }
  async read(config: IndoorRuntime, period: IndoorPeriod, now: Date) {
    const window = indoorWindow(period, now);
    const samples = (base: number, amplitude: number) =>
      Array.from(
        {
          length: Math.ceil(
            (Date.parse(window.end) - Date.parse(window.start)) / (window.intervalSeconds * 1000),
          ),
        },
        (_, i) => {
          const mean = Math.round((base + Math.sin(i / 8) * amplitude) * 10) / 10;
          const start = Date.parse(window.start) + i * window.intervalSeconds * 1000;
          return {
            at: new Date(start).toISOString(),
            end: new Date(start + window.intervalSeconds * 1000).toISOString(),
            mean,
            min: mean - 0.5,
            max: mean + 0.5,
          };
        },
      );
    const reading = (base: number, amplitude: number): IndoorReading => ({
      value: base,
      reportedAt: now.toISOString(),
      status: 'current',
      historyStatus: 'available',
      samples: samples(base, amplitude),
    });
    return {
      status: config.rooms.length === 0 ? ('empty' as const) : ('current' as const),
      rooms: config.rooms.map((room) => ({
        id: room.id,
        label: room.label,
        temperature: room.temperature === null ? null : reading(21.4, 2.5),
        humidity: room.humidity === null ? null : reading(53, 8),
      })),
    };
  }
}
