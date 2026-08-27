import { Link } from 'react-router-dom';

import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
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
  if (admin.isPending || calendar.isPending || homeAssistant.isPending) return <AdminLoading />;
  if (admin.isError) return <AdminError message={admin.error.message} />;
  if (calendar.isError) return <AdminError message={calendar.error.message} />;
  if (homeAssistant.isError) return <AdminError message={homeAssistant.error.message} />;

  return (
    <AdminPage title="Connections">
      <div className="connection-list">
        <Link
          className="connection-row connection-row--action focusable"
          data-focus-entry="true"
          data-focus-id="connection-calendar"
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
          data-focus-id="connection-home-assistant"
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
