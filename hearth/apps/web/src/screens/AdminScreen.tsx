import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IconName } from '../components/Icon';
import { Link } from 'react-router-dom';

import { runtimeApi as hearthApi } from '../api/runtime';
import { authStatusQueryKey } from '../auth/queryKeys';
import { AdminError, AdminLoading } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { useAdminQuery } from '../hooks/useAdminQueries';
import { useHearthRuntime } from '../runtime/context';

interface Setting {
  title: string;
  description: (
    members: number,
    televisions: number,
    householdName: string,
    timezone: string,
  ) => string;
  icon: IconName;
  path: string;
}

const settingGroups: Array<{ title: string; settings: Setting[] }> = [
  {
    title: 'Household',
    settings: [
      {
        title: 'Household',
        description: (_members, _televisions, householdName, timezone) =>
          `${householdName} · ${timezoneLabel(timezone)}`,
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
        title: 'Adult access',
        description: () => 'Passkeys, trusted devices and recovery',
        icon: 'shield',
        path: '/admin/access',
      },
    ],
  },
  {
    title: 'Family setup',
    settings: [
      {
        title: 'Today & notices',
        description: () => 'Overview sections and household notices',
        icon: 'today',
        path: '/admin/today',
      },
      {
        title: 'Family planning',
        description: () => 'Routines, meals, lists and pocket money',
        icon: 'wallet',
        path: '/admin/planning',
      },
    ],
  },
  {
    title: 'Connections',
    settings: [
      {
        title: 'Connections',
        description: () => 'Calendar and Home Assistant',
        icon: 'link',
        path: '/admin/connections',
      },
    ],
  },
  {
    title: 'Displays',
    settings: [
      {
        title: 'Photos',
        description: () => 'Approved album and source',
        icon: 'image',
        path: '/admin/photos',
      },
      {
        title: 'Paired televisions',
        description: (_members, televisions) =>
          `${televisions} connected · Approve, pair or revoke a television`,
        icon: 'television',
        path: '/admin/televisions',
      },
      {
        title: 'Appearance',
        description: () => 'Light, dark and evening comfort',
        icon: 'moon',
        path: '/admin/appearance',
      },
    ],
  },
  {
    title: 'System',
    settings: [
      {
        title: 'System health',
        description: () => 'Backups, storage and version',
        icon: 'shield',
        path: '/admin/system',
      },
      {
        title: 'Recent activity',
        description: () => 'Private household change history',
        icon: 'list',
        path: '/admin/activity',
      },
    ],
  },
];

const settings = settingGroups.flatMap((group) => group.settings);

function settingFocusId(title: string): string {
  return `admin-${title.toLowerCase().split(' ')[0]}`;
}

function adjacentSettingFocusId(index: number, fallback: string): string {
  const setting = settings[index];
  return setting === undefined ? fallback : settingFocusId(setting.title);
}

export function AdminScreen() {
  const runtime = useHearthRuntime();
  const queryClient = useQueryClient();
  const admin = useAdminQuery();
  const signOut = useMutation({
    mutationFn: hearthApi.signOut,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authStatusQueryKey });
    },
  });
  if (admin.isPending) return <AdminLoading />;
  if (admin.isError) return <AdminError message={admin.error.message} />;

  const connected = admin.data.pairedDevices.filter(
    (device) => device.status === 'connected',
  ).length;
  return (
    <section className="admin-home">
      <header className="admin-home__topbar">
        <img alt="" src="/brand/hearth-mark.png" />
        <div className="admin-session-controls">
          <div
            className="admin-actor"
            aria-label={`${admin.data.actor.displayName}, administrator`}
          >
            <span aria-hidden="true">{admin.data.actor.displayName.slice(0, 1)}</span>
            <strong>{admin.data.actor.displayName}</strong>
            <small>Administrator</small>
          </div>
          {runtime.mode === 'private' ? (
            <button
              className="button button--quiet"
              type="button"
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
            >
              {signOut.isPending ? 'Signing out…' : 'Sign out'}
            </button>
          ) : null}
        </div>
      </header>
      <div className="admin-home__title">
        <h1>Hearth settings</h1>
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
      <div className="admin-setting-groups">
        {settingGroups.map((group) => (
          <section className="admin-setting-group" key={group.title}>
            <h2>{group.title}</h2>
            <div className="admin-setting-list">
              {group.settings.map((setting) => {
                const index = settings.indexOf(setting);
                return (
                  <Link
                    className="admin-setting-row focusable"
                    data-focus-entry={index === 0 ? 'true' : undefined}
                    data-focus-down={adjacentSettingFocusId(
                      index + 1,
                      settingFocusId(setting.title),
                    )}
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
                          admin.data.household.timezone,
                        )}
                      </small>
                    </span>
                    <Icon name="chevron-right" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {runtime.mode === 'private' ? null : (
        <p className="demo-session-note">
          Demo adult session · Private deployment uses passkey sign-in.
        </p>
      )}
    </section>
  );
}

function timezoneLabel(timezone: string): string {
  return timezone.split('/').at(-1)?.replaceAll('_', ' ') ?? timezone;
}
