import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { OpaqueIdSchema, TimezoneSchema } from '@hearth/shared';

import {
  CalDavCalendarProvider,
  type CalDavCalendarProviderOptions,
} from './caldav-calendar-provider.js';
import { UnconfiguredCalendarProvider, type CalendarProvider } from './calendar-provider.js';

const CalDavRuntimeConfigSchema = z
  .object({
    version: z.literal(1),
    provider: z.literal('caldav'),
    serverUrl: z
      .string()
      .url()
      .refine((value) => new URL(value).protocol === 'https:', 'Expected an HTTPS URL'),
    username: z.string().trim().min(1).max(320),
    appPassword: z.string().min(1).max(512),
    householdTimezone: TimezoneSchema,
    calendars: z
      .array(
        z
          .object({
            displayName: z.string().trim().min(1).max(80),
            ownerMemberId: OpaqueIdSchema.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict()
  .superRefine((value, context) => {
    const names = value.calendars.map(({ displayName }) => displayName);
    if (new Set(names).size !== names.length) {
      context.addIssue({
        code: 'custom',
        path: ['calendars'],
        message: 'Calendar display names must be unique',
      });
    }
  });

export interface CalendarRuntime {
  provider: CalendarProvider;
  ownerForCalendarExternalId: (externalId: string) => string | null;
}

export async function resolveCalendarRuntime(input: {
  demoMode: boolean;
  configPath: string | undefined;
}): Promise<CalendarRuntime | null> {
  if (input.demoMode) {
    if (input.configPath !== undefined) {
      throw new Error('HEARTH_CALENDAR_CONFIG_PATH is disabled while HEARTH_MODE=demo.');
    }
    return null;
  }
  if (input.configPath === undefined) {
    return {
      provider: new UnconfiguredCalendarProvider(),
      ownerForCalendarExternalId: (_externalId) => null,
    };
  }
  return loadCalendarRuntime(input.configPath);
}

export async function loadCalendarRuntime(configPath: string): Promise<CalendarRuntime> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(configPath, 'utf8')) as unknown;
  } catch {
    throw new Error('Hearth could not read the external calendar secret configuration.');
  }
  return createCalendarRuntime(value);
}

export function createCalendarRuntime(
  value: unknown,
  overrides: Pick<CalDavCalendarProviderOptions, 'clientFactory' | 'now'> = {},
): CalendarRuntime {
  const parsed = CalDavRuntimeConfigSchema.safeParse(value);
  if (!parsed.success) {
    const paths = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].filter(
      Boolean,
    );
    throw new Error(
      `Calendar secret configuration is invalid${paths.length === 0 ? '' : ` at ${paths.join(', ')}`}.`,
    );
  }
  const provider = new CalDavCalendarProvider({
    serverUrl: parsed.data.serverUrl,
    username: parsed.data.username,
    appPassword: parsed.data.appPassword,
    householdTimezone: parsed.data.householdTimezone,
    calendarAllowlist: parsed.data.calendars,
    ...overrides,
  });
  return {
    provider,
    ownerForCalendarExternalId: (externalId) => provider.ownerMemberId(externalId),
  };
}
