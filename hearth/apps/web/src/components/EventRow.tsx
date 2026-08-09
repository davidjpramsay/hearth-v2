import type { CalendarEvent } from '@hearth/shared';

import { Avatar } from './Avatar';
import { useHearthRuntime } from '../runtime/context';
import { formatEventTime } from '../utils/date';

export function EventRow({ event, focus }: { event: CalendarEvent; focus?: FocusProps }) {
  const { timezone } = useHearthRuntime();
  const timeLabel = formatEventTime(event, timezone);
  return (
    <button
      aria-label={`${timeLabel}, ${event.title}, ${event.owner?.displayName ?? event.sourceLabel}`}
      className="event-row focusable"
      style={{ '--event-color': event.color } as React.CSSProperties}
      type="button"
      {...focus}
    >
      <time className="event-row__time" dateTime={event.start}>
        {timeLabel}
      </time>
      <span className="event-row__rule" />
      <div className="event-row__body">
        <strong>{event.title}</strong>
        <span>{event.owner?.displayName ?? event.sourceLabel}</span>
      </div>
      {event.owner === null ? (
        <span className="family-avatar">H</span>
      ) : (
        <Avatar member={event.owner} />
      )}
    </button>
  );
}

interface FocusProps {
  'data-focus-id': string;
  'data-focus-up'?: string | undefined;
  'data-focus-down'?: string | undefined;
  'data-focus-left'?: string | undefined;
  'data-focus-right'?: string | undefined;
}
