import { StatusBanner } from './Status';
import './CalendarFeedback.css';

export function CalendarRefreshIndicator({ active }: { active: boolean }) {
  return active ? (
    <span className="calendar-refresh-indicator" role="img" aria-label="Refreshing calendar" />
  ) : null;
}

export function CalendarIssue({
  online,
  failed,
  freshness,
  message,
}: {
  online: boolean;
  failed: boolean;
  freshness: 'current' | 'stale' | 'offline';
  message: string | null;
}) {
  if (!online) return null;
  if (failed)
    return (
      <StatusBanner kind="unavailable">
        Couldn’t update the calendar · Showing saved plans.
      </StatusBanner>
    );
  return freshness === 'stale' && message ? (
    <StatusBanner kind="stale">{message}</StatusBanner>
  ) : null;
}
