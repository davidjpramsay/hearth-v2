import type { ComponentProps, ReactNode } from 'react';

import { Icon, type IconName } from './Icon';
import { SettingsLink } from './SettingsNavigation';

import './SettingsMenu.css';

export function SettingsMenu({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`settings-menu ${className}`}>{children}</div>;
}

export function SettingsMenuLink({
  icon,
  label,
  description,
  status,
  className = '',
  iconClassName = '',
  titleClassName = '',
  ...props
}: Omit<ComponentProps<typeof SettingsLink>, 'children'> & {
  icon: IconName;
  label: string;
  description?: string | undefined;
  status?: ReactNode;
  iconClassName?: string;
  titleClassName?: string;
}) {
  return (
    <SettingsLink {...props} className={`settings-menu__row focusable ${className}`}>
      <span className={`settings-menu__icon ${iconClassName}`}>
        <Icon name={icon} />
      </span>
      <span className="settings-menu__copy">
        <span className="settings-menu__heading">
          <strong className={titleClassName}>{label}</strong>
          {status}
        </span>
        {description === undefined ? null : (
          <span className="settings-menu__description">{description}</span>
        )}
      </span>
      <Icon className="settings-menu__chevron" name="chevron-right" />
    </SettingsLink>
  );
}
