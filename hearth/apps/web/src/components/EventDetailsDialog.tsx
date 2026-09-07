import { useEffect, useRef } from 'react';

import type { CalendarEvent } from '@hearth/shared';

import { EventDetailsContent } from './EventDetailsContent';

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
        <EventDetailsContent event={event} timezone={timezone} />
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
