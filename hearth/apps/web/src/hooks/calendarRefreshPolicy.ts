export const CALENDAR_REFRESH_INTERVAL_MS = 5 * 60_000;

export const calendarRefreshPolicy = {
  refetchInterval: CALENDAR_REFRESH_INTERVAL_MS,
  refetchIntervalInBackground: false,
  refetchOnMount: 'always',
  refetchOnReconnect: 'always',
} as const;
