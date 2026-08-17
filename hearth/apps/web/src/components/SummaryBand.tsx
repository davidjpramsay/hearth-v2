import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Icon, type IconName } from './Icon';

export function SummaryBand({
  icon,
  label,
  children,
  to,
  onActivate,
  focus,
  ariaLabel,
}: SummaryBandProps) {
  const content = (
    <>
      <Icon className="summary-band__icon" name={icon} />
      <div>
        <h2>{label}</h2>
        <p>{children}</p>
      </div>
      {to === undefined && onActivate === undefined ? null : (
        <Icon className="summary-band__chevron" name="chevron-right" />
      )}
    </>
  );

  if (to !== undefined) {
    return (
      <Link
        aria-label={ariaLabel}
        className="summary-band summary-band--action focusable"
        to={to}
        {...focus}
      >
        {content}
      </Link>
    );
  }
  if (onActivate !== undefined) {
    return (
      <button
        aria-label={ariaLabel}
        className="summary-band summary-band--action focusable"
        onClick={onActivate}
        type="button"
        {...focus}
      >
        {content}
      </button>
    );
  }
  return <section className="summary-band">{content}</section>;
}

interface SummaryBandProps {
  icon: IconName;
  label: string;
  children: ReactNode;
  to?: string;
  onActivate?: () => void;
  ariaLabel?: string;
  focus?: SummaryBandFocusProps;
}

interface SummaryBandFocusProps {
  'data-focus-id': string;
  'data-focus-up'?: string;
  'data-focus-down'?: string;
  'data-focus-left'?: string;
  'data-focus-right'?: string;
}
