import { useQuery } from '@tanstack/react-query';

import { homeAssistantBridgeApi } from '../api/homeAssistantBridge';
import { queryKeys } from '../api/queryKeys';
import { AdminPage, AdminQueryState } from '../components/AdminPage';
import { SettingsMenu, SettingsMenuLink } from '../components/SettingsMenu';
import { useAdminQuery } from '../hooks/useAdminQueries';
import {
  useCalendarConnectionQuery,
  useHomeAssistantConnectionQuery,
} from '../hooks/useConnectionQueries';

export function ConnectionsSettingsScreen() {
  const admin = useAdminQuery();
  const calendar = useCalendarConnectionQuery();
  const homeAssistant = useHomeAssistantConnectionQuery();
  // Safe grant metadata only. Never put the one-time issue request/key in Query caches.
  const bridge = useQuery({
    queryKey: [...queryKeys.admin, 'home-assistant-bridge'],
    queryFn: ({ signal }) => homeAssistantBridgeApi.getConnection(signal),
    retry: false,
  });
  if (admin.isPending || calendar.isPending || homeAssistant.isPending)
    return <AdminQueryState title="Connections" />;
  if (admin.data === undefined)
    return (
      <AdminQueryState
        title="Connections"
        error={admin.error ?? new Error('Couldn’t load these settings.')}
        onRetry={() => void admin.refetch()}
      />
    );
  if (calendar.data === undefined)
    return (
      <AdminQueryState
        title="Connections"
        error={calendar.error ?? new Error('Couldn’t load these settings.')}
        onRetry={() => void calendar.refetch()}
      />
    );
  if (homeAssistant.data === undefined)
    return (
      <AdminQueryState
        title="Connections"
        error={homeAssistant.error ?? new Error('Couldn’t load these settings.')}
        onRetry={() => void homeAssistant.refetch()}
      />
    );

  return (
    <AdminPage title="Connections">
      <SettingsMenu className="connection-list">
        <SettingsMenuLink
          className="connection-row connection-row--action focusable"
          icon="calendar"
          label="Calendar"
          description={
            calendar.data === null ? undefined : `${calendar.data.label} · ${calendar.data.message}`
          }
          data-focus-entry="true"
          data-focus-down="connection-home-assistant"
          data-focus-id="connection-calendar"
          data-focus-left="connection-calendar"
          data-focus-right="connection-calendar"
          data-focus-up="connection-calendar"
          to="/admin/connections/calendar"
          status={
            <span
              className={`connection-badge${calendar.data === null ? '' : ' connection-badge--healthy'}`}
            >
              {calendar.data === null ? 'Set up' : 'Connected'}
            </span>
          }
        />
        <SettingsMenuLink
          className="connection-row connection-row--action focusable"
          icon="home"
          label="Home Assistant"
          description={
            homeAssistant.data === null
              ? bridge.data == null
                ? undefined
                : 'Approved Home Assistant access to Hearth.'
              : `${homeAssistant.data.label} · ${homeAssistant.data.message}`
          }
          data-focus-down="connection-home-assistant"
          data-focus-id="connection-home-assistant"
          data-focus-left="connection-home-assistant"
          data-focus-right="connection-home-assistant"
          data-focus-up="connection-calendar"
          to="/admin/connections/home-assistant"
          status={
            <span
              className={`connection-badge${homeAssistant.data === null && bridge.data == null ? '' : ' connection-badge--healthy'}`}
            >
              {homeAssistant.data !== null
                ? 'Connected'
                : bridge.data != null
                  ? 'Access enabled'
                  : bridge.isPending
                    ? 'Checking access…'
                    : bridge.isError
                      ? 'Check access'
                      : 'Set up'}
            </span>
          }
        />
      </SettingsMenu>
    </AdminPage>
  );
}
