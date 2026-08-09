import { localDateInTimezone, localMonth, startOfLocalWeek } from '@hearth/core';
import { RuntimeContextSchema, type RuntimeContext, type RuntimeMode } from '@hearth/shared';

import type { AdminRepository } from './admin-repository.js';

export interface HearthClock {
  now(): Date;
}

export interface RuntimeConfiguration {
  mode: RuntimeMode;
  householdId: string | null;
  clock: HearthClock;
  fallbackTimezone?: string;
  fallbackLocale?: string;
}

export class SystemClock implements HearthClock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements HearthClock {
  constructor(private readonly timestamp: string) {}

  now(): Date {
    return new Date(this.timestamp);
  }
}

export async function resolveRuntimeContext(
  configuration: RuntimeConfiguration,
  adminRepository: AdminRepository,
): Promise<RuntimeContext> {
  const household =
    configuration.householdId === null
      ? null
      : await adminRepository.getHousehold(configuration.householdId);
  const timezone = household?.timezone ?? configuration.fallbackTimezone ?? 'Australia/Perth';
  const locale = household?.locale ?? configuration.fallbackLocale ?? 'en-AU';
  const now = configuration.clock.now();
  const generatedAt = now.toISOString();
  const localDate = localDateInTimezone(generatedAt, timezone);

  return RuntimeContextSchema.parse({
    mode: configuration.mode,
    generatedAt,
    household:
      household === null
        ? null
        : {
            id: household.id,
            name: household.name,
            timezone: household.timezone,
            locale: household.locale,
          },
    timezone,
    locale,
    localDate,
    weekStart: startOfLocalWeek(localDate),
    currentMonth: localMonth(localDate),
    requiresSetup: household === null,
  });
}
