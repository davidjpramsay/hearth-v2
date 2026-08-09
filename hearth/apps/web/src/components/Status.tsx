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
      <h1>Gathering today’s plans…</h1>
      <p>Hearth is getting the household ready.</p>
      <div className="loading-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

export function EmptyState({ onBootstrap }: { onBootstrap?: (() => void) | undefined }) {
  return (
    <section className="state-panel">
      <img alt="" className="state-panel__mark" src="/brand/hearth-mark.png" />
      <h1>Nothing is planned yet</h1>
      <p>
        {onBootstrap === undefined
          ? 'Add plans, chores or a calendar from the companion to begin.'
          : 'Add the fictional demo household to see how Hearth brings a family day together.'}
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
      <h1>Hearth couldn’t load this view</h1>
      <p>Your family’s plans are safe. Try again when the connection settles.</p>
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
