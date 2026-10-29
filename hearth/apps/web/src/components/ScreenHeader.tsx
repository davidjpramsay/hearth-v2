import type { ReactNode } from 'react';

export function ScreenHeader({
  eyebrow,
  title,
  meta,
  actions,
  indicator,
}: {
  eyebrow?: string;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  indicator?: ReactNode;
}) {
  return (
    <header className="screen-header">
      <div>
        {eyebrow === undefined ? null : <p className="screen-header__eyebrow">{eyebrow}</p>}
        {indicator === undefined ? (
          <h1>{title}</h1>
        ) : (
          <div className="screen-header__title-row">
            <h1>{title}</h1>
            {indicator}
          </div>
        )}
        {meta === undefined ? null : <div className="screen-header__meta">{meta}</div>}
      </div>
      {actions === undefined ? null : <div className="screen-header__actions">{actions}</div>}
    </header>
  );
}
