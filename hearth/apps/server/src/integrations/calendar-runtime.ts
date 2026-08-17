import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { z } from 'zod';

import { OpaqueIdSchema, TimezoneSchema } from '@hearth/shared';

import {
  CalDavCalendarProvider,
  type CalDavCalendarProviderOptions,
} from './caldav-calendar-provider.js';
import { UnconfiguredCalendarProvider, type CalendarProvider } from './calendar-provider.js';

export const CalDavRuntimeConfigSchema = z
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

export type CalDavRuntimeConfig = z.infer<typeof CalDavRuntimeConfigSchema>;

class CalendarRuntimeReadError extends Error {
  constructor(readonly missing: boolean) {
    super('Hearth could not read the external calendar secret configuration.');
  }
}

export class ManagedCalendarProvider implements CalendarProvider {
  readonly providerType = 'caldav';
  private runtime: CalendarRuntime = {
    provider: new UnconfiguredCalendarProvider(),
    ownerForCalendarExternalId: () => null,
  };

  configure(runtime: CalendarRuntime): void {
    this.runtime = runtime;
  }

  disconnect(): void {
    this.runtime = {
      provider: new UnconfiguredCalendarProvider(),
      ownerForCalendarExternalId: () => null,
    };
  }

  ownerForCalendarExternalId = (externalId: string): string | null =>
    this.runtime.ownerForCalendarExternalId(externalId);

  listCalendars() {
    return this.runtime.provider.listCalendars();
  }

  syncEvents(input: { startDate: string; endDate: string; cursor: string | null }) {
    return this.runtime.provider.syncEvents(input);
  }

  getEvent(input: { calendarExternalId: string; eventExternalId: string }) {
    return this.runtime.provider.getEvent(input);
  }
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
    return unconfiguredCalendarRuntime();
  }
  try {
    return await loadCalendarRuntime(input.configPath);
  } catch (error) {
    if (error instanceof CalendarRuntimeReadError && error.missing) {
      return unconfiguredCalendarRuntime();
    }
    throw error;
  }
}

export async function loadCalendarRuntime(configPath: string): Promise<CalendarRuntime> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(configPath, 'utf8')) as unknown;
  } catch (error) {
    const missing =
      typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
    throw new CalendarRuntimeReadError(missing);
  }
  return createCalendarRuntime(value);
}

function unconfiguredCalendarRuntime(): CalendarRuntime {
  return {
    provider: new UnconfiguredCalendarProvider(),
    ownerForCalendarExternalId: (_externalId) => null,
  };
}

export async function writeCalendarRuntimeConfig(
  configPath: string,
  value: CalDavRuntimeConfig,
): Promise<void> {
  const parsed = CalDavRuntimeConfigSchema.parse(value);
  await mkdir(dirname(configPath), { recursive: true });
  const temporaryPath = `${configPath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, configPath);
    await chmod(configPath, 0o600);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function removeCalendarRuntimeConfig(configPath: string): Promise<void> {
  await rm(configPath, { force: true });
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
