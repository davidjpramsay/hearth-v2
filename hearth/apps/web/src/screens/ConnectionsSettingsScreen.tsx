import { Link } from 'react-router-dom';

import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { useAdminQuery, useCalendarConnectionQuery } from '../hooks/useHearthQueries';

export function ConnectionsSettingsScreen() {
  const admin = useAdminQuery();
  const calendar = useCalendarConnectionQuery();
  if (admin.isPending || calendar.isPending) return <AdminLoading />;
  if (admin.isError) return <AdminError message={admin.error.message} />;
  if (calendar.isError) return <AdminError message={calendar.error.message} />;
  const homeAssistant = admin.data.integrations.find(
    (integration) => integration.kind === 'home-assistant',
  );

  return (
    <AdminPage title="Connections" subtitle="Private services Hearth reads from">
      <div className="connection-list">
        <Link
          className="connection-row connection-row--action focusable"
          data-focus-id="connection-calendar"
          to="/admin/connections/calendar"
        >
          <span className="admin-setting-row__icon">
            <Icon name="calendar" />
          </span>
          <div>
            <strong>Calendar</strong>
            <p>
              {calendar.data === null
                ? 'Add an iCloud or CalDAV account and choose the calendars Hearth may read.'
                : `${calendar.data.label} · ${calendar.data.message}`}
            </p>
          </div>
          <span
            className={`connection-badge${calendar.data === null ? '' : ' connection-badge--healthy'}`}
          >
            {calendar.data === null ? 'Set up' : 'Connected'}
          </span>
          <Icon className="connection-row__chevron" name="chevron-right" />
        </Link>
        <article className="connection-row">
          <span className="admin-setting-row__icon">
            <Icon name="home" />
          </span>
          <div>
            <strong>Home Assistant</strong>
            <p>{homeAssistant?.message ?? 'Home Assistant is not connected.'}</p>
          </div>
          <span className="connection-badge">Not connected</span>
        </article>
      </div>
      <div className="phase-note">
        <strong>Private and read-only</strong>
        <p>
          Calendar passwords stay on the Hearth server and are never returned to this screen. Hearth
          reads only the calendars an adult selects. It does not create, edit or delete calendar
          events.
        </p>
      </div>
    </AdminPage>
  );
}
