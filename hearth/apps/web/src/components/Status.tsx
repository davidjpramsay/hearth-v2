import type { ReactNode } from 'react';

import { Icon } from './Icon';

export function StatusBanner({
  kind,
  children,
}: {
  kind: 'stale' | 'offline' | 'unavailable';
  children: ReactNode;
}) {
  return (
    <div className={`status-banner status-banner--${kind}`} role="status">
      <Icon name={kind === 'offline' ? 'cloud-off' : 'warning'} />
      <span>{children}</span>
    </div>
  );
}

export function LoadingState() {
  return (
    <section className="state-panel state-panel--loading" aria-label="Loading Hearth">
      <div className="state-panel__spinner" />
      <h1>Loading…</h1>
      <div className="loading-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

export function EmptyState({
  onBootstrap,
  title = 'Nothing planned yet',
  description,
}: {
  onBootstrap?: (() => void) | undefined;
  title?: string | undefined;
  description?: string | undefined;
}) {
  return (
    <section className="state-panel">
      <img alt="" className="state-panel__mark" src="/brand/hearth-mark.png" />
      <h1>{title}</h1>
      <p>
        {description ??
          (onBootstrap === undefined
            ? 'Add plans, chores or a calendar to begin.'
            : 'Add the demo household to explore Hearth.')}
      </p>
      {onBootstrap === undefined ? null : (
        <button
          className="primary-action focusable"
          data-focus-id="empty-bootstrap"
          data-focus-left="nav-today"
          onClick={onBootstrap}
          type="button"
        >
          Show demo household
        </button>
      )}
    </section>
  );
}

export function FailureState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="state-panel state-panel--failure" role="alert">
      <Icon name="warning" />
      <h1>Couldn’t load this view</h1>
      <p>Your plans are safe.</p>
      <button
        className="primary-action focusable"
        data-focus-id="state-retry"
        data-focus-left="nav-today"
        onClick={onRetry}
        type="button"
      >
        <Icon name="refresh" /> Try again
      </button>
    </section>
  );
}

export function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="inline-error" role="alert">
      <span>{message}</span>
      <button className="text-action" onClick={onRetry} type="button">
        Try again
      </button>
    </div>
  );
}
