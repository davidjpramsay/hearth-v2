import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { useAdminQuery } from '../hooks/useHearthQueries';

const labels = {
  calendar: 'Calendar',
  'home-assistant': 'Home Assistant',
} as const;

export function ConnectionsSettingsScreen() {
  const admin = useAdminQuery();
  if (admin.isPending) return <AdminLoading />;
  if (admin.isError) return <AdminError message={admin.error.message} />;
  return (
    <AdminPage title="Connections" subtitle="Services Hearth uses directly">
      <div className="connection-list">
        {admin.data.integrations.map((integration) => (
          <article className="connection-row" key={integration.kind}>
            <span className="admin-setting-row__icon">
              <Icon name="link" />
            </span>
            <div>
              <strong>{labels[integration.kind]}</strong>
              <p>{integration.message}</p>
            </div>
            <span className={`connection-badge connection-badge--${integration.status}`}>
              {integration.status === 'healthy' ? 'Demo ready' : 'Not connected'}
            </span>
          </article>
        ))}
      </div>
      <div className="phase-note">
        <strong>How are connections protected?</strong>
        <p>
          Hearth’s private iCloud/CalDAV reader is ready. A real account stays disconnected until an
          adult approves the exact calendar names, supplies a server-only app password and private
          passkey sign-in is enabled. Home Assistant currently uses a fake adapter; a future live
          token and script mapping remain server-only and never enter the TV or phone bundle.
        </p>
      </div>
    </AdminPage>
  );
}
