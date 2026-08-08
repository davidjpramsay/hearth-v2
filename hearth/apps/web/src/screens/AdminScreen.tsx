import type { IconName } from '../components/Icon';
import { Link } from 'react-router-dom';

import { AdminError, AdminLoading } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { useAdminQuery } from '../hooks/useHearthQueries';

const settings: {
  title: string;
  description: (members: number, televisions: number, householdName: string) => string;
  icon: IconName;
  path: string;
}[] = [
  {
    title: 'Household',
    description: (_members, _televisions, householdName) => `${householdName} · Perth`,
    icon: 'home',
    path: '/admin/household',
  },
  {
    title: 'People',
    description: (members) => `${members} members · Roles and permissions`,
    icon: 'users',
    path: '/admin/people',
  },
  {
    title: 'Appearance',
    description: () => 'Light, dark and evening comfort',
    icon: 'moon',
    path: '/admin/appearance',
  },
  {
    title: 'Family planning',
    description: () => 'Routines, meals, lists and pocket money',
    icon: 'wallet',
    path: '/admin/planning',
  },
  {
    title: 'Paired televisions',
    description: (_members, televisions) =>
      `${televisions} connected · Approve or revoke a television`,
    icon: 'television',
    path: '/admin/televisions',
  },
  {
    title: 'Connections',
    description: () => 'Calendar and Home Assistant',
    icon: 'link',
    path: '/admin/connections',
  },
  {
    title: 'Photos',
    description: () => 'Approved album and source',
    icon: 'image',
    path: '/admin/photos',
  },
];

function settingFocusId(title: string): string {
  return `admin-${title.toLowerCase().split(' ')[0]}`;
}

function adjacentSettingFocusId(index: number, fallback: string): string {
  const setting = settings[index];
  return setting === undefined ? fallback : settingFocusId(setting.title);
}

export function AdminScreen() {
  const admin = useAdminQuery();
  if (admin.isPending) return <AdminLoading />;
  if (admin.isError) return <AdminError message={admin.error.message} />;

  const connected = admin.data.pairedDevices.filter(
    (device) => device.status === 'connected',
  ).length;
  return (
    <section className="admin-home">
      <header className="admin-home__topbar">
        <img alt="" src="/brand/hearth-mark.png" />
        <div className="admin-actor" aria-label={`${admin.data.actor.displayName}, administrator`}>
          <span aria-hidden="true">{admin.data.actor.displayName.slice(0, 1)}</span>
          <strong>{admin.data.actor.displayName}</strong>
          <small>Administrator</small>
        </div>
      </header>
      <div className="admin-home__title">
        <h1>Home settings</h1>
        <p>{admin.data.household.name}</p>
      </div>
      <div className="local-status" role="status">
        <span className="local-status__icon">
          <Icon name="leaf" />
        </span>
        <div>
          <strong>Everything is running locally</strong>
          <span>Private to this home and its Tailscale network</span>
        </div>
      </div>
      <div className="admin-setting-list">
        {settings.map((setting, index) => (
          <Link
            className="admin-setting-row focusable"
            data-focus-down={adjacentSettingFocusId(index + 1, 'admin-pair-television')}
            data-focus-id={settingFocusId(setting.title)}
            data-focus-left={settingFocusId(setting.title)}
            data-focus-right={settingFocusId(setting.title)}
            data-focus-up={adjacentSettingFocusId(index - 1, settingFocusId(setting.title))}
            to={setting.path}
            key={setting.title}
          >
            <span className="admin-setting-row__icon">
              <Icon name={setting.icon} />
            </span>
            <span className="admin-setting-row__copy">
              <strong>{setting.title}</strong>
              <small>
                {setting.description(
                  admin.data.household.members.length,
                  connected,
                  admin.data.household.name,
                )}
              </small>
            </span>
            <Icon name="chevron-right" />
          </Link>
        ))}
      </div>
      <Link
        className="admin-primary-action focusable"
        data-focus-down="admin-pair-television"
        data-focus-id="admin-pair-television"
        data-focus-left="admin-pair-television"
        data-focus-right="admin-pair-television"
        data-focus-up={settingFocusId(settings.at(-1)?.title ?? 'Photos')}
        to="/admin/televisions"
      >
        <Icon name="television" />
        Pair a television
      </Link>
      <p className="demo-session-note">
        Demo adult session · Real passkey sign-in starts after the private HTTPS hostname is
        configured.
      </p>
    </section>
  );
}
