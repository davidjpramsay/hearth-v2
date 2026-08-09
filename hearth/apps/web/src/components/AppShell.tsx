import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { useAppearance } from '../appearance/appearance';
import { useHearthRuntime } from '../runtime/context';
import { Icon, type IconName } from './Icon';

interface NavigationItem {
  label: string;
  path: string;
  icon: IconName;
  enabled: boolean;
}

const navigation: NavigationItem[] = [
  { label: 'Today', path: '/today', icon: 'today', enabled: true },
  { label: 'Week', path: '/week', icon: 'calendar', enabled: true },
  { label: 'Month', path: '/month', icon: 'calendar', enabled: true },
  { label: 'Chores', path: '/chores', icon: 'chores', enabled: true },
  { label: 'Lists', path: '/lists', icon: 'list', enabled: true },
  { label: 'Meals', path: '/meals', icon: 'meal', enabled: true },
  { label: 'Photos', path: '/photos', icon: 'image', enabled: true },
  { label: 'Home', path: '/home', icon: 'home', enabled: true },
];

const phoneNavigation = navigation.filter((item) =>
  ['Today', 'Week', 'Chores'].includes(item.label),
);

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { preferences } = useAppearance();
  const runtime = useHearthRuntime();
  if (pathname === '/pair') {
    return (
      <main className="pair-shell" id="main-content">
        {children}
      </main>
    );
  }
  if (pathname.startsWith('/admin')) {
    return (
      <div className="companion-shell">
        <main className="companion-content" id="main-content">
          {children}
        </main>
        <PhoneNavigation />
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className="tv-rail" aria-label="Primary navigation">
        <div className="brand-lockup">
          <img alt="" src="/brand/hearth-mark.png" />
          <span>Hearth</span>
        </div>
        <nav className="tv-rail__nav">
          {navigation.map((item, index) => (
            <RailItem item={item} index={index} key={item.label} />
          ))}
        </nav>
        <div className="tv-rail__footer">
          <NavLink
            aria-label="Appearance settings"
            className="rail-appearance focusable"
            data-focus-down="nav-appearance"
            data-focus-id="nav-appearance"
            data-focus-left="nav-appearance"
            data-focus-right={`appearance-${preferences.theme}`}
            data-focus-up="nav-home"
            to="/admin/appearance"
          >
            <Icon name="moon" />
            <span>Appearance</span>
          </NavLink>
          <div className="tv-rail__status">
            <span className="connection-dot" /> {runtime.household?.name}
          </div>
        </div>
      </aside>
      <main className="app-content" id="main-content">
        {children}
      </main>
      <PhoneNavigation />
    </div>
  );
}

function PhoneNavigation() {
  const { pathname } = useLocation();
  const moreActive = !['/today', '/week', '/month', '/chores'].includes(pathname);
  return (
    <nav className="phone-tabs" aria-label="Primary navigation">
      {phoneNavigation.map((item, index) => (
        <PhoneTab item={item} index={index} pathname={pathname} key={item.label} />
      ))}
      <NavLink
        className={`phone-tab${moreActive ? ' phone-tab--active' : ''}`}
        data-focus-id="phone-tab-more"
        data-focus-left="phone-tab-chores"
        data-focus-right="phone-tab-more"
        to="/admin"
      >
        <Icon name="more" />
        <span>More</span>
      </NavLink>
    </nav>
  );
}

function RailItem({ item, index }: { item: NavigationItem; index: number }) {
  const prior = navigation.slice(0, index).findLast((candidate) => candidate.enabled);
  const next = navigation.slice(index + 1).find((candidate) => candidate.enabled);
  const focusId = `nav-${item.label.toLowerCase()}`;
  const className = `rail-item focusable${item.enabled ? '' : ' rail-item--future'}`;
  const attrs = {
    'data-focus-id': focusId,
    'data-focus-up': prior === undefined ? focusId : `nav-${prior.label.toLowerCase()}`,
    'data-focus-down': next === undefined ? 'nav-appearance' : `nav-${next.label.toLowerCase()}`,
    'data-focus-right': 'screen-entry',
  };
  if (!item.enabled) {
    return (
      <div
        aria-label={`${item.label}, planned for a later phase`}
        className="rail-item rail-item--future"
      >
        <Icon name={item.icon} />
        <span>{item.label}</span>
        <span className="rail-item__status">Later</span>
      </div>
    );
  }
  return (
    <NavLink
      {...attrs}
      className={({ isActive }) => `${className}${isActive ? ' rail-item--active' : ''}`}
      to={item.path}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </NavLink>
  );
}

function PhoneTab({
  item,
  index,
  pathname,
}: {
  item: NavigationItem;
  index: number;
  pathname: string;
}) {
  const sectionActive = pathname === item.path || (item.path === '/week' && pathname === '/month');
  return (
    <NavLink
      className={`phone-tab${sectionActive ? ' phone-tab--active' : ''}`}
      data-focus-id={`phone-tab-${item.label.toLowerCase()}`}
      data-focus-left={
        index === 0
          ? 'phone-tab-today'
          : `phone-tab-${phoneNavigation[index - 1]?.label.toLowerCase()}`
      }
      data-focus-right={
        index === 2
          ? 'phone-tab-chores'
          : `phone-tab-${phoneNavigation[index + 1]?.label.toLowerCase()}`
      }
      to={item.path}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </NavLink>
  );
}
