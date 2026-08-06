import type { ReactNode } from 'react';

export function ScreenHeader({
  eyebrow,
  title,
  meta,
  actions,
}: {
  eyebrow?: string;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="screen-header">
      <div>
        {eyebrow === undefined ? null : <p className="screen-header__eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {meta === undefined ? null : <div className="screen-header__meta">{meta}</div>}
      </div>
      {actions === undefined ? null : <div className="screen-header__actions">{actions}</div>}
    </header>
  );
}
