import { useEffect, useState } from 'react';

import { getHearthRuntime } from '../api/client';

export function useHouseholdClock(): string {
  const runtime = getHearthRuntime();
  const [now, setNow] = useState(() =>
    runtime.mode === 'private' ? new Date() : new Date(runtime.generatedAt),
  );

  useEffect(() => {
    if (runtime.mode !== 'private') return undefined;
    const untilNextMinute = 60_000 - (Date.now() % 60_000);
    let interval: number | undefined;
    const timeout = window.setTimeout(() => {
      setNow(new Date());
      interval = window.setInterval(() => setNow(new Date()), 60_000);
    }, untilNextMinute);
    return () => {
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [runtime.mode]);

  return formatHouseholdTime(now, runtime.locale, runtime.timezone);
}

export function formatHouseholdTime(date: Date, locale: string, timezone: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(date);
}
