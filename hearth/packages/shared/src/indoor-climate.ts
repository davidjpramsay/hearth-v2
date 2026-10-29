import { z } from 'zod';
import {
  OpaqueIdSchema,
  TimestampSchema,
  HomeAssistantConnectionTestRequestSchema,
} from './schemas.js';

export const IndoorPeriodSchema = z.enum(['day', 'week', 'month', 'year']);
export type IndoorPeriod = z.infer<typeof IndoorPeriodSchema>;
export const IndoorMetricSchema = z.enum(['temperature', 'humidity']);
export type IndoorMetric = z.infer<typeof IndoorMetricSchema>;
export const IndoorSampleSchema = z.object({
  at: TimestampSchema,
  end: TimestampSchema,
  mean: z.number().finite().nullable(),
  min: z.number().finite().nullable(),
  max: z.number().finite().nullable(),
});
export type IndoorSample = z.infer<typeof IndoorSampleSchema>;
export const IndoorReadingSchema = z.object({
  value: z.number().finite().nullable(),
  reportedAt: TimestampSchema.nullable(),
  status: z.enum(['current', 'stale', 'unavailable']),
  historyStatus: z.enum(['available', 'empty', 'unavailable']),
  samples: z.array(IndoorSampleSchema).max(370),
});
export type IndoorReading = z.infer<typeof IndoorReadingSchema>;
export const IndoorRoomSchema = z.object({
  id: OpaqueIdSchema,
  label: z.string().trim().min(1).max(60),
  temperature: IndoorReadingSchema.nullable(),
  humidity: IndoorReadingSchema.nullable(),
});
export const IndoorClimateSchema = z.object({
  source: z.enum(['home-assistant', 'demo']).default('home-assistant'),
  period: IndoorPeriodSchema,
  start: TimestampSchema,
  end: TimestampSchema,
  intervalSeconds: z.number().int().positive(),
  timezone: z.string().max(100),
  status: z.enum(['not-configured', 'empty', 'current', 'partial', 'stale', 'unavailable']),
  fetchedAt: TimestampSchema.nullable(),
  rooms: z.array(IndoorRoomSchema).max(8),
});
export type IndoorClimate = z.infer<typeof IndoorClimateSchema>;
export const IndoorRoomSelectionSchema = z
  .object({
    id: OpaqueIdSchema,
    label: z.string().trim().min(1).max(60),
    temperatureId: OpaqueIdSchema.nullable(),
    humidityId: OpaqueIdSchema.nullable(),
  })
  .strict()
  .refine(
    (room) => room.temperatureId !== null || room.humidityId !== null,
    'Choose a temperature or humidity sensor.',
  );
const RoomSelectionsSchema = z
  .array(IndoorRoomSelectionSchema)
  .max(8)
  .superRefine((rooms, ctx) => {
    const ids = rooms.map((room) => room.id);
    const sensors = rooms
      .flatMap((room) => [room.temperatureId, room.humidityId])
      .filter((id) => id !== null);
    if (new Set(ids).size !== ids.length || new Set(sensors).size !== sensors.length)
      ctx.addIssue({ code: 'custom', message: 'Each room and sensor may be selected only once.' });
  });
export type IndoorRoomSelection = z.infer<typeof IndoorRoomSelectionSchema>;
export const IndoorSettingsSchema = z.object({
  configured: z.boolean(),
  revision: z.number().int().nonnegative(),
  rooms: RoomSelectionsSchema,
});
export type IndoorSettings = z.infer<typeof IndoorSettingsSchema>;
export const IndoorDiscoverySchema = z.object({
  testId: OpaqueIdSchema,
  expiresAt: TimestampSchema,
  options: z
    .array(z.object({ id: OpaqueIdSchema, label: z.string().max(100), metric: IndoorMetricSchema }))
    .max(160),
});
export type IndoorDiscovery = z.infer<typeof IndoorDiscoverySchema>;
export const IndoorTestSchema = HomeAssistantConnectionTestRequestSchema;
export const SaveIndoorSettingsSchema = z
  .object({
    requestId: OpaqueIdSchema,
    testId: OpaqueIdSchema,
    revision: z.number().int().nonnegative(),
    rooms: RoomSelectionsSchema,
  })
  .strict();
export type SaveIndoorSettings = z.infer<typeof SaveIndoorSettingsSchema>;
export const IndoorSettingsResultSchema = z.object({
  settings: IndoorSettingsSchema,
  replayed: z.boolean(),
});
export type IndoorSettingsResult = z.infer<typeof IndoorSettingsResultSchema>;
