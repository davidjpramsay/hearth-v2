import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Icon } from './Icon';

export function AdminPage({
  title,
  subtitle,
  children,
  backTo = '/admin',
  backLabel = 'Back to Hearth settings',
  loading = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  backTo?: string;
  backLabel?: string;
  loading?: boolean;
}) {
  return (
    <section
      aria-busy={loading || undefined}
      className="admin-page"
      data-focus-loading={loading ? 'true' : undefined}
    >
      <header className="admin-page__header">
        <Link
          aria-label={backLabel}
          className="admin-back focusable"
          data-focus-id="admin-back"
          to={backTo}
        >
          <Icon name="chevron-left" />
        </Link>
        <div>
          <h1>{title}</h1>
          {subtitle === undefined ? null : <p>{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

export function AdminLoading() {
  return (
    <div aria-live="polite" className="admin-feedback" role="status">
      Loading…
    </div>
  );
}

export function AdminError({
  message,
  onRetry,
  focusId,
}: {
  message: string;
  onRetry?: (() => void) | undefined;
  focusId?: string;
}) {
  return (
    <div className="admin-feedback admin-feedback--error">
      <span role="alert">{message}</span>
      {onRetry === undefined ? null : (
        <button
          className="admin-secondary"
          data-focus-entry={focusId === undefined ? undefined : 'true'}
          data-focus-id={focusId}
          onClick={onRetry}
          type="button"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function AdminQueryState({
  title,
  backTo,
  backLabel,
  error,
  onRetry,
}: {
  title: string;
  backTo?: string;
  backLabel?: string;
  error?: Error | null;
  onRetry?: () => void;
}) {
  return (
    <AdminPage
      title={title}
      backTo={backTo ?? '/admin'}
      backLabel={backLabel ?? 'Back to Hearth settings'}
      loading={error == null}
    >
      {error == null ? (
        <AdminLoading />
      ) : (
        <AdminError focusId="admin-query-retry" message={error.message} onRetry={onRetry} />
      )}
    </AdminPage>
  );
}
