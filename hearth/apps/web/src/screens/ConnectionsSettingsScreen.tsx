import { Link } from 'react-router-dom';

import { AdminPage, AdminQueryState } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { useAdminQuery } from '../hooks/useAdminQueries';
import {
  useCalendarConnectionQuery,
  useHomeAssistantConnectionQuery,
} from '../hooks/useConnectionQueries';

export function ConnectionsSettingsScreen() {
  const admin = useAdminQuery();
  const calendar = useCalendarConnectionQuery();
  const homeAssistant = useHomeAssistantConnectionQuery();
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
      <div className="connection-list">
        <Link
          className="connection-row connection-row--action focusable"
          data-focus-entry="true"
          data-focus-down="connection-home-assistant"
          data-focus-id="connection-calendar"
          data-focus-left="connection-calendar"
          data-focus-right="connection-calendar"
          data-focus-up="connection-calendar"
          to="/admin/connections/calendar"
        >
          <span className="admin-setting-row__icon">
            <Icon name="calendar" />
          </span>
          <div>
            <strong>Calendar</strong>
            {calendar.data === null ? null : (
              <p>{`${calendar.data.label} · ${calendar.data.message}`}</p>
            )}
          </div>
          <span
            className={`connection-badge${calendar.data === null ? '' : ' connection-badge--healthy'}`}
          >
            {calendar.data === null ? 'Set up' : 'Connected'}
          </span>
          <Icon className="connection-row__chevron" name="chevron-right" />
        </Link>
        <Link
          className="connection-row connection-row--action focusable"
          data-focus-down="connection-home-assistant"
          data-focus-id="connection-home-assistant"
          data-focus-left="connection-home-assistant"
          data-focus-right="connection-home-assistant"
          data-focus-up="connection-calendar"
          to="/admin/connections/home-assistant"
        >
          <span className="admin-setting-row__icon">
            <Icon name="home" />
          </span>
          <div>
            <strong>Home Assistant</strong>
            {homeAssistant.data === null ? null : (
              <p>{`${homeAssistant.data.label} · ${homeAssistant.data.message}`}</p>
            )}
          </div>
          <span
            className={`connection-badge${homeAssistant.data === null ? '' : ' connection-badge--healthy'}`}
          >
            {homeAssistant.data === null ? 'Set up' : 'Connected'}
          </span>
          <Icon className="connection-row__chevron" name="chevron-right" />
        </Link>
      </div>
    </AdminPage>
  );
}
