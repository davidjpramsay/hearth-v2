import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Icon } from './Icon';

export function AdminPage({
  title,
  subtitle,
  children,
  backTo = '/admin',
  backLabel = 'Back to Hearth settings',
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <section className="admin-page">
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
          <p>{subtitle}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

export function AdminLoading() {
  return (
    <div aria-live="polite" className="admin-feedback" role="status">
      Loading Hearth settings…
    </div>
  );
}

export function AdminError({ message }: { message: string }) {
  return (
    <div className="admin-feedback admin-feedback--error" role="alert">
      {message}
    </div>
  );
}
