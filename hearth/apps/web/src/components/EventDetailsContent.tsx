import type { CSSProperties } from 'react';
import type { CalendarEvent } from '@hearth/shared';

import { Avatar } from './Avatar';
import { formatEventDateRange } from '../utils/date';

export function EventDetailsContent({
  event,
  timezone,
}: {
  event: CalendarEvent;
  timezone: string;
}) {
  return (
    <>
      <div className="event-detail__person">
        {event.owner === null ? (
          <span aria-hidden="true" className="family-avatar">
            H
          </span>
        ) : (
          <Avatar member={event.owner} />
        )}
        <span style={{ '--event-color': event.color } as CSSProperties} />
      </div>
      <p>{event.sourceLabel}</p>
      <h2 id="event-detail-title">{event.title}</h2>
      <dl>
        <div>
          <dt>When</dt>
          <dd>{formatEventDateRange(event, timezone)}</dd>
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
    </>
  );
}
