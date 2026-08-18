import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { localDateInTimezone } from '@hearth/core';

import { getHearthRuntime } from '../api/core';

export interface HouseholdDateTime {
  date: string;
  instant: string;
  time: string;
}

const HouseholdClockContext = createContext<HouseholdDateTime | null>(null);

export function HouseholdClockProvider({ children }: { children: ReactNode }) {
  const runtime = getHearthRuntime();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() =>
    runtime.mode === 'private' ? new Date() : new Date(runtime.generatedAt),
  );

  useEffect(() => {
    if (runtime.mode !== 'private') return undefined;
    const untilNextMinute = 60_000 - (Date.now() % 60_000);
    let interval: number | undefined;
    const updateClock = () => {
      const nextNow = new Date();
      setNow(nextNow);
      if (hasHouseholdDateChanged(nextNow, runtime.timezone, runtime.localDate)) {
        void queryClient.invalidateQueries({ queryKey: ['hearth-runtime'] });
      }
    };
    const timeout = window.setTimeout(() => {
      updateClock();
      interval = window.setInterval(updateClock, 60_000);
    }, untilNextMinute);
    return () => {
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [queryClient, runtime.localDate, runtime.mode, runtime.timezone]);

  const value = useMemo(
    () => ({
      date: formatHouseholdDate(now, runtime.locale, runtime.timezone),
      instant: now.toISOString(),
      time: formatHouseholdTime(now, runtime.locale, runtime.timezone),
    }),
    [now, runtime.locale, runtime.timezone],
  );

  return createElement(HouseholdClockContext.Provider, { value }, children);
}

export function useHouseholdDateTime(): HouseholdDateTime {
  const value = useContext(HouseholdClockContext);
  if (value === null) throw new Error('Household clock is not available.');
  return value;
}

export function useHouseholdClock(): string {
  return useHouseholdDateTime().time;
}

export function formatHouseholdTime(date: Date, locale: string, timezone: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(date);
}

export function formatHouseholdDate(date: Date, locale: string, timezone: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  }).format(date);
}

export function hasHouseholdDateChanged(
  now: Date,
  timezone: string,
  runtimeLocalDate: string,
): boolean {
  return localDateInTimezone(now.toISOString(), timezone) !== runtimeLocalDate;
}
