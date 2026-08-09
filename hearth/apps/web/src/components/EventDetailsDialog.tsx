import { useEffect, useRef } from 'react';

import type { CalendarEvent } from '@hearth/shared';

import { Avatar } from './Avatar';
import { formatEventTime } from '../utils/date';

export function EventDetailsDialog({
  event,
  timezone,
  onClose,
}: {
  event: CalendarEvent | null;
  timezone: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (event !== null) {
      if (document.activeElement instanceof HTMLElement) openerRef.current = document.activeElement;
      closeRef.current?.focus();
      return;
    }
    openerRef.current?.focus();
    openerRef.current = null;
  }, [event]);

  if (event === null) return null;
  return (
    <div
      aria-labelledby="event-detail-title"
      aria-modal="true"
      className="event-detail"
      role="dialog"
    >
      <div className="event-detail__panel">
        <div className="event-detail__person">
          {event.owner === null ? (
            <span aria-hidden="true" className="family-avatar">
              H
            </span>
          ) : (
            <Avatar member={event.owner} />
          )}
          <span style={{ '--event-color': event.color } as React.CSSProperties} />
        </div>
        <p>{event.sourceLabel}</p>
        <h2 id="event-detail-title">{event.title}</h2>
        <dl>
          <div>
            <dt>When</dt>
            <dd>{eventDateTime(event, timezone)}</dd>
          </div>
          {event.location === null ? null : (
            <div>
              <dt>Where</dt>
              <dd>{event.location}</dd>
            </div>
          )}
          <div>
            <dt>Calendar</dt>
            <dd>{event.owner?.displayName ?? 'Whole family'}</dd>
          </div>
        </dl>
        <button
          className="button button--primary focusable"
          data-back-dismiss="true"
          data-focus-id="event-detail-close"
          onClick={onClose}
          ref={closeRef}
          type="button"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function eventDateTime(event: CalendarEvent, timezone: string): string {
  const date = new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${event.startLocalDate}T12:00:00.000Z`));
  return event.allDay ? `${date} · All day` : `${date} · ${formatEventTime(event, timezone)}`;
}
