import { useEffect, useRef } from 'react';

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
        <p>Daily Bible verse</p>
        <h2 id="daily-verse-detail-title">{verse.reference}</h2>
        <blockquote>{verse.text}</blockquote>
        {verse.statusMessage === null ? null : (
          <p className="daily-verse-detail__status">{verse.statusMessage}</p>
        )}
        {verse.sourceUrl === null ? (
          <p className="daily-verse-detail__copyright">Fictional text for the demo household.</p>
        ) : (
          <p className="daily-verse-detail__copyright">
            Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard
            Version®), copyright © 2001 by Crossway, a publishing ministry of Good News Publishers.
            Used by permission. All rights reserved.{' '}
            <a href={verse.sourceUrl} rel="noreferrer" target="_blank">
              ESV.org
            </a>
          </p>
        )}
        <button
          className="button button--primary focusable"
          data-back-dismiss="true"
          data-focus-id="daily-verse-detail-close"
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
