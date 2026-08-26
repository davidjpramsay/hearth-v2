import { Link } from 'react-router-dom';

import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { useAdminQuery } from '../hooks/useAdminQueries';
import {
  useCalendarConnectionQuery,
  useHomeAssistantConnectionQuery,
  useReminderSourcesQuery,
} from '../hooks/useConnectionQueries';

export function ConnectionsSettingsScreen() {
  const admin = useAdminQuery();
  const calendar = useCalendarConnectionQuery();
  const homeAssistant = useHomeAssistantConnectionQuery();
  const reminderSources = useReminderSourcesQuery();
  if (admin.isPending || calendar.isPending || homeAssistant.isPending || reminderSources.isPending)
    return <AdminLoading />;
  if (admin.isError) return <AdminError message={admin.error.message} />;
  if (calendar.isError) return <AdminError message={calendar.error.message} />;
  if (homeAssistant.isError) return <AdminError message={homeAssistant.error.message} />;
  if (reminderSources.isError) return <AdminError message={reminderSources.error.message} />;

  const activeReminderSource = reminderSources.data.sources.find(
    (source) => source.status !== 'revoked',
  );

  return (
    <AdminPage title="Connections" subtitle="Private services Hearth reads from">
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
            <p>
              {homeAssistant.data === null
                ? 'Connect four household states and three approved Home actions.'
                : `${homeAssistant.data.label} · ${homeAssistant.data.message}`}
            </p>
          </div>
          <span
            className={`connection-badge${homeAssistant.data === null ? '' : ' connection-badge--healthy'}`}
          >
            {homeAssistant.data === null ? 'Set up' : 'Connected'}
          </span>
          <Icon className="connection-row__chevron" name="chevron-right" />
        </Link>
        <Link
          className="connection-row connection-row--action focusable"
          data-focus-id="connection-apple-reminders"
          to="/admin/connections/reminders"
        >
          <span className="admin-setting-row__icon">
            <Icon name="list" />
          </span>
          <div>
            <strong>Apple Reminders</strong>
            <p>
              {activeReminderSource === undefined
                ? 'Pair the read-only Hearth Companion bridge on an iPhone.'
                : `${activeReminderSource.device.name} · ${reminderSourceMessage(activeReminderSource.status)}`}
            </p>
          </div>
          <span
            className={`connection-badge${
              activeReminderSource?.status === 'current'
                ? ' connection-badge--healthy'
                : activeReminderSource === undefined
                  ? ''
                  : ' connection-badge--unavailable'
            }`}
          >
            {activeReminderSource === undefined
              ? 'Set up'
              : activeReminderSource.status === 'current'
                ? 'Connected'
                : activeReminderSource.status === 'awaiting-first-snapshot'
                  ? 'Waiting'
                  : 'Attention'}
          </span>
          <Icon className="connection-row__chevron" name="chevron-right" />
        </Link>
      </div>
      <div className="phase-note">
        <strong>Private and tightly scoped</strong>
        <p>
          Connection secrets stay on the Hearth server and never return to this screen. Calendar is
          read-only. Apple Reminders is read through the permissioned iPhone bridge and cannot be
          edited by Hearth. Home Assistant is limited to four safety states and the three actions
          shown on Hearth’s Home screen.
        </p>
      </div>
    </AdminPage>
  );
}

function reminderSourceMessage(
  status: 'awaiting-first-snapshot' | 'current' | 'stale' | 'revoked',
) {
  if (status === 'awaiting-first-snapshot') return 'Waiting for the first upload';
  if (status === 'current') return 'Up to date';
  if (status === 'stale') return 'Last upload is old';
  return 'Disconnected';
}
