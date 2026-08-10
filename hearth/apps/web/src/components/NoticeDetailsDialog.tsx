import { useEffect, useRef } from 'react';

import { Icon } from './Icon';

export function NoticeDetailsDialog({
  message,
  onClose,
}: {
  message: string | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (message !== null) {
      if (document.activeElement instanceof HTMLElement) openerRef.current = document.activeElement;
      closeRef.current?.focus();
      return;
    }
    openerRef.current?.focus();
    openerRef.current = null;
  }, [message]);

  if (message === null) return null;
  return (
    <div
      aria-labelledby="notice-detail-title"
      aria-modal="true"
      className="event-detail notice-detail"
      role="dialog"
    >
      <div className="event-detail__panel">
        <div className="notice-detail__icon">
          <Icon name="home" />
        </div>
        <p>Household notice</p>
        <h2 id="notice-detail-title">Notice</h2>
        <p className="notice-detail__message">{message}</p>
        <button
          className="button button--primary focusable"
          data-back-dismiss="true"
          data-focus-id="notice-detail-close"
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
