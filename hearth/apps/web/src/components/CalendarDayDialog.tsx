import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CalendarEvent, WeekDay } from '@hearth/shared';

import { EventDetailsContent } from './EventDetailsContent';
import { formatEventDayTime } from '../utils/date';

export function CalendarDayDialog({
  day,
  events,
  timezone,
  onClose,
}: {
  day: WeekDay;
  events: CalendarEvent[];
  timezone: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnEvent = useRef<string | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const focusId = (id: string) => `day-list-${id}`;

  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const target =
      selected !== null
        ? 'day-list-back'
        : returnEvent.current === null
          ? 'day-list-close'
          : focusId(returnEvent.current);
    dialogRef.current
      ?.querySelector<HTMLElement>(`[data-focus-id="${CSS.escape(target)}"]`)
      ?.focus();
  }, [selected]);

  return (
    <dialog
      aria-labelledby={selected === null ? 'calendar-day-title' : 'event-detail-title'}
      className="calendar-day-dialog event-detail__panel"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button');
        const first = buttons?.[0];
        const last = buttons?.[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (selected === null) onClose();
        else setSelected(null);
      }}
      ref={dialogRef}
    >
      {selected === null ? (
        <>
          <header className="calendar-day-dialog__header">
            <div>
              <h2 id="calendar-day-title">
                {day.dayLabel} {day.dateLabel}
              </h2>
              <p>
                {events.length} {events.length === 1 ? 'event' : 'events'}
              </p>
            </div>
            <button
              className="focusable"
              type="button"
              data-back-dismiss="true"
              data-focus-id="day-list-close"
              data-focus-up={focusId(events.at(-1)?.id ?? 'close')}
              data-focus-down={focusId(events[0]?.id ?? 'close')}
              data-focus-left="day-list-close"
              data-focus-right="day-list-close"
              onClick={onClose}
            >
              Close
            </button>
          </header>
          <div className="calendar-day-dialog__events">
            {events.map((event, index) => (
              <button
                className="agenda-event focusable"
                type="button"
                key={event.id}
                data-focus-id={focusId(event.id)}
                data-focus-up={index === 0 ? 'day-list-close' : focusId(events[index - 1]!.id)}
                data-focus-down={
                  index === events.length - 1 ? 'day-list-close' : focusId(events[index + 1]!.id)
                }
                data-focus-left={focusId(event.id)}
                data-focus-right={focusId(event.id)}
                style={{ '--event-color': event.color } as CSSProperties}
                onClick={() => {
                  returnEvent.current = event.id;
                  setSelected(event);
                }}
              >
                <time>{formatEventDayTime(event, day.localDate, timezone)}</time>
                <span />
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.owner?.displayName ?? event.sourceLabel}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <EventDetailsContent event={selected} timezone={timezone} />
          <button
            className="focusable"
            type="button"
            data-back-dismiss="true"
            data-focus-id="day-list-back"
            data-focus-left="day-list-back"
            data-focus-right="day-list-back"
            data-focus-up="day-list-back"
            data-focus-down="day-list-back"
            onClick={() => setSelected(null)}
          >
            Back to day
          </button>
        </>
      )}
    </dialog>
  );
}
