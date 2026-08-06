import type { ReactNode } from 'react';

import { Icon, type IconName } from './Icon';

export function SummaryBand({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="summary-band">
      <Icon name={icon} />
      <div>
        <h2>{label}</h2>
        <p>{children}</p>
      </div>
    </section>
  );
}
