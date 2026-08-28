import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { useAppearance } from '../appearance/appearance';
import { HouseholdClockProvider } from '../hooks/useHouseholdClock';
import { useHearthRuntime } from '../runtime/context';
import { HouseholdDateTime } from './HouseholdDateTime';
import { Icon, type IconName } from './Icon';

interface NavigationItem {
  label: string;
  path: string;
  icon: IconName;
  enabled: boolean;
}

interface AdminNavigationItem {
  label: string;
  path: string;
  icon: IconName;
  matches?: string[];
}

const baseNavigation: NavigationItem[] = [
  { label: 'Today', path: '/today', icon: 'today', enabled: true },
  { label: 'Calendar', path: '/calendar/week', icon: 'calendar', enabled: true },
  { label: 'Weather', path: '/weather', icon: 'cloud-sun', enabled: true },
  { label: 'Reminders', path: '/reminders', icon: 'bell', enabled: true },
  { label: 'Chores', path: '/chores', icon: 'chores', enabled: true },
  { label: 'Lists', path: '/lists', icon: 'list', enabled: true },
  { label: 'Meals', path: '/meals', icon: 'meal', enabled: true },
  { label: 'Home', path: '/home', icon: 'home', enabled: true },
  { label: 'Photos', path: '/photos', icon: 'image', enabled: true },
];

const phoneNavigation = baseNavigation.filter((item) =>
  ['Today', 'Calendar', 'Weather', 'Chores'].includes(item.label),
);

const adminNavigationGroups: Array<{ label: string; items: AdminNavigationItem[] }> = [
  {
    label: 'Content',
    items: [
      { label: 'Overview', path: '/admin', icon: 'leaf' },
      { label: 'Today', path: '/admin/today', icon: 'today' },
      { label: 'Photos', path: '/admin/photos', icon: 'image' },
      {
        label: 'Planning',
        path: '/admin/planning',
        icon: 'wallet',
        matches: [
          '/admin/routines',
          '/admin/chore-day',
          '/admin/pocket-money',
          '/admin/lists',
          '/admin/meals',
        ],
      },
    ],
  },
  {
    label: 'Household',
    items: [
      { label: 'Details', path: '/admin/household', icon: 'home' },
      { label: 'People', path: '/admin/people', icon: 'users' },
      { label: 'Adult access', path: '/admin/access', icon: 'shield' },
    ],
  },
  {
    label: 'Devices',
    items: [
      {
        label: 'Connections',
        path: '/admin/connections',
        icon: 'link',
        matches: ['/admin/connections/'],
      },
      { label: 'Televisions', path: '/admin/televisions', icon: 'television' },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Health', path: '/admin/system', icon: 'shield' },
      { label: 'Activity', path: '/admin/activity', icon: 'list' },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <HouseholdClockProvider>
      <AppShellLayout>{children}</AppShellLayout>
    </HouseholdClockProvider>
  );
}

function AppShellLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { preferences } = useAppearance();
  const runtime = useHearthRuntime();
  const navigation = baseNavigation;
  if (pathname === '/pair') {
    return (
      <main className="pair-shell" id="main-content">
        {children}
      </main>
    );
  }
  if (pathname.startsWith('/admin')) {
    return (
      <div className="companion-shell companion-shell--admin">
        <AdminDesktopNavigation pathname={pathname} />
        <div className="companion-main">
          <HouseholdDateTime placement="companion" />
          <main className="companion-content" id="main-content">
            {children}
          </main>
        </div>
        <PhoneNavigation />
      </div>
    );
  }
  if (pathname === '/appearance') {
    return (
      <div className="companion-shell">
        <HouseholdDateTime placement="companion" />
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
            <RailItem
              item={item}
              index={index}
              key={item.label}
              navigation={navigation}
              pathname={pathname}
            />
          ))}
        </nav>
        <div className="tv-rail__footer">
          <HouseholdDateTime placement="rail" />
          <NavLink
            aria-label="Appearance settings"
            className="rail-appearance focusable"
            data-focus-down="nav-appearance"
            data-focus-id="nav-appearance"
            data-focus-left="nav-appearance"
            data-focus-right={`appearance-${preferences.theme}`}
            data-focus-up="nav-photos"
            to="/appearance"
          >
            <Icon name="moon" />
            <span>Appearance</span>
          </NavLink>
          <div className="tv-rail__status">
            <span className="connection-dot" /> {runtime.household?.name}
          </div>
        </div>
      </aside>
      <HouseholdDateTime placement="mobile" />
      <main className="app-content" id="main-content">
        {children}
      </main>
      <PhoneNavigation />
    </div>
  );
}

function AdminDesktopNavigation({ pathname }: { pathname: string }) {
  return (
    <aside className="admin-desktop-rail" aria-label="Administration">
      <NavLink className="admin-desktop-brand" to="/admin">
        <img alt="" src="/brand/hearth-mark.png" />
        <span>
          <strong>Hearth</strong>
          <small>Admin</small>
        </span>
      </NavLink>
      <nav className="admin-desktop-nav">
        {adminNavigationGroups.map((group) => (
          <section key={group.label}>
            <h2>{group.label}</h2>
            {group.items.map((item) => {
              const active = isAdminNavigationActive(pathname, item);
              return (
                <Link
                  aria-current={active ? 'page' : undefined}
                  className={`admin-desktop-link${active ? ' admin-desktop-link--active' : ''}`}
                  key={item.path}
                  to={item.path}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </section>
        ))}
      </nav>
      <NavLink className="admin-desktop-exit" to="/today">
        <Icon name="chevron-left" />
        <span>Family dashboard</span>
      </NavLink>
    </aside>
  );
}

function isAdminNavigationActive(pathname: string, item: AdminNavigationItem): boolean {
  if (item.path === '/admin') return pathname === item.path;
  if (pathname === item.path) return true;
  return item.matches?.some((match) => pathname.startsWith(match)) ?? false;
}

function PhoneNavigation() {
  const { pathname } = useLocation();
  const moreActive =
    pathname === '/more' ||
    pathname === '/appearance' ||
    pathname.startsWith('/admin') ||
    ['/lists', '/meals', '/home', '/photos', '/reminders'].includes(pathname);
  return (
    <nav className="phone-tabs" aria-label="Primary navigation">
      {phoneNavigation.map((item, index) => (
        <PhoneTab item={item} index={index} pathname={pathname} key={item.label} />
      ))}
      <NavLink
        className={`phone-tab${moreActive ? ' phone-tab--active' : ''}`}
        data-focus-id="phone-tab-more"
        data-focus-left={`phone-tab-${phoneNavigation.at(-1)?.label.toLowerCase() ?? 'today'}`}
        data-focus-right="phone-tab-more"
        to="/more"
      >
        <Icon name="more" />
        <span>More</span>
      </NavLink>
    </nav>
  );
}

function RailItem({
  item,
  index,
  pathname,
  navigation,
}: {
  item: NavigationItem;
  index: number;
  pathname: string;
  navigation: NavigationItem[];
}) {
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
      className={({ isActive }) => {
        const sectionActive =
          isActive || (item.label === 'Calendar' && pathname.startsWith('/calendar/'));
        return `${className}${sectionActive ? ' rail-item--active' : ''}`;
      }}
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
  const sectionActive =
    pathname === item.path || (item.label === 'Calendar' && pathname.startsWith('/calendar/'));
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
        index === phoneNavigation.length - 1
          ? 'phone-tab-more'
          : `phone-tab-${phoneNavigation[index + 1]?.label.toLowerCase()}`
      }
      to={item.path}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </NavLink>
  );
}
