import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IconName } from '../components/Icon';

import { signOutAndClear } from '../auth/signOut';
import { AdminError, AdminLoading } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { SettingsMenu, SettingsMenuLink } from '../components/SettingsMenu';
import { useAdminQuery } from '../hooks/useAdminQueries';
import { useHearthRuntime } from '../runtime/context';
import { runtimeApi } from '../api/runtime';
import { authStatusQueryKey } from '../auth/queryKeys';

interface Setting {
  title: string;
  icon: IconName;
  path: string;
}

const settingGroups: Array<{ title: string; settings: Setting[] }> = [
  {
    title: 'Family content',
    settings: [
      {
        title: 'Manage photos',
        icon: 'image',
        path: '/admin/photos',
      },
      {
        title: 'Today screen & notices',
        icon: 'today',
        path: '/admin/today',
      },
      {
        title: 'Chores, routines & pocket money',
        icon: 'wallet',
        path: '/admin/planning',
      },
    ],
  },
  {
    title: 'Household & access',
    settings: [
      {
        title: 'Household details',
        icon: 'home',
        path: '/admin/household',
      },
      {
        title: 'People',
        icon: 'users',
        path: '/admin/people',
      },
    ],
  },
  {
    title: 'Connections & displays',
    settings: [
      {
        title: 'Connections',
        icon: 'link',
        path: '/admin/connections',
      },
      {
        title: 'Phones & screens',
        icon: 'television',
        path: '/admin/televisions',
      },
    ],
  },
  {
    title: 'System',
    settings: [
      {
        title: 'System health',
        icon: 'shield',
        path: '/admin/system',
      },
      {
        title: 'Recent activity',
        icon: 'list',
        path: '/admin/activity',
      },
    ],
  },
];

const settings = settingGroups.flatMap((group) => group.settings);

function settingFocusId(title: string): string {
  const firstWord =
    title
      .toLowerCase()
      .split(' ')[0]
      ?.replaceAll(/[^a-z0-9]/g, '') ?? 'setting';
  return `admin-${firstWord}`;
}

function adjacentSettingFocusId(index: number, fallback: string): string {
  const setting = settings[index];
  return setting === undefined ? fallback : settingFocusId(setting.title);
}

export function AdminScreen() {
  const runtime = useHearthRuntime();
  const queryClient = useQueryClient();
  const admin = useAdminQuery();
  const auth = useQuery({
    queryKey: authStatusQueryKey,
    queryFn: runtimeApi.getAuthStatus,
    enabled: runtime.mode === 'private',
    staleTime: 15_000,
  });
  const signOut = useMutation({
    mutationFn: () => signOutAndClear(queryClient),
  });
  if (admin.isPending) return <AdminLoading />;
  if (admin.isError) return <AdminError message={admin.error.message} />;

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
          {auth.data?.ownerPhone ? (
            <small>Protected owner phone</small>
          ) : runtime.mode === 'private' && auth.data ? (
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
          <strong>Local and private</strong>
        </div>
      </div>
      <div className="admin-setting-groups">
        {settingGroups.map((group) => (
          <section className="admin-setting-group" key={group.title}>
            <h2>{group.title}</h2>
            <SettingsMenu className="admin-setting-list">
              {group.settings.map((setting) => {
                const index = settings.indexOf(setting);
                return (
                  <SettingsMenuLink
                    className="admin-setting-row"
                    icon={setting.icon}
                    label={setting.title}
                    titleClassName="admin-setting-row__copy"
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
                  />
                );
              })}
            </SettingsMenu>
          </section>
        ))}
      </div>
      {runtime.mode === 'private' ? null : (
        <p className="demo-session-note">
          Demo adult session · Private deployment uses approved phone connections.
        </p>
      )}
    </section>
  );
}
