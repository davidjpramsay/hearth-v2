import { useEffect, useRef, type KeyboardEvent } from 'react';

import type { DailyVerseSummary } from '@hearth/shared';

import { Icon } from './Icon';

export function DailyVerseDetailsDialog({
  verse,
  onClose,
}: {
  verse: DailyVerseSummary | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sourceRef = useRef<HTMLAnchorElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (verse !== null) {
      if (document.activeElement instanceof HTMLElement) openerRef.current = document.activeElement;
      closeRef.current?.focus();
      return;
    }
    openerRef.current?.focus();
    openerRef.current = null;
  }, [verse]);

  function cycleControlFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
    // Both known controls remain reachable even when Safari's native Tab
    // preferences skip links or buttons. Shift+Tab has the same two-item cycle.
    event.preventDefault();
    const next =
      document.activeElement === closeRef.current
        ? (sourceRef.current ?? closeRef.current)
        : closeRef.current;
    next?.focus();
  }

  if (verse === null) return null;
  return (
    <div
      aria-labelledby="daily-verse-detail-title"
      aria-modal="true"
      className="event-detail daily-verse-detail"
      role="dialog"
    >
      <div className="event-detail__panel">
        <div className="notice-detail__icon">
          <Icon name="book-open" />
        </div>
        <div className="daily-verse-detail__heading">
          <h2 id="daily-verse-detail-title">{verse.reference}</h2>
          {verse.translation === 'ESV' ? (
            <a
              className="daily-verse-detail__source focusable"
              href={verse.sourceUrl ?? 'https://www.esv.org/'}
              onKeyDown={cycleControlFocus}
              ref={sourceRef}
              rel="noreferrer"
              target="_blank"
            >
              ESV
            </a>
          ) : null}
        </div>
        <blockquote>{verse.text}</blockquote>
        {verse.statusMessage === null ? null : (
          <p className="daily-verse-detail__status">{verse.statusMessage}</p>
        )}
        <button
          className="button button--primary focusable daily-verse-detail__close"
          data-back-dismiss="true"
          data-focus-id="daily-verse-detail-close"
          onClick={onClose}
          onKeyDown={cycleControlFocus}
          ref={closeRef}
          type="button"
        >
          Close
        </button>
      </div>
    </div>
  );
}
