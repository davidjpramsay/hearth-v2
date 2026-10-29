import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { phoneApi } from '../api/phoneConnections';
import { AdminPage, AdminQueryState } from '../components/AdminPage';
import { SettingsMenu, SettingsMenuLink } from '../components/SettingsMenu';
import { useAdminQuery } from '../hooks/useAdminQueries';
import './GetStartedScreen.css';

export function GetStartedScreen() {
  const admin = useAdminQuery();
  const recovery = useQuery({
    queryKey: ['phone-recovery'],
    queryFn: phoneApi.recovery,
    retry: false,
  });
  if (admin.data === undefined)
    return (
      <AdminQueryState
        title="Welcome to Hearth"
        error={admin.error}
        onRetry={() => void admin.refetch()}
      />
    );
  const screens = admin.data.pairedDevices.filter(
    (device) =>
      device.type === 'television' && device.status !== 'revoked' && device.revokedAt === null,
  );
  const people = admin.data.household.members;
  const safeRecovery =
    recovery.data?.hasRecoveryCard === true ||
    (recovery.data?.adults.some((adult) => adult.phones.some((phone) => phone.trusted)) ?? false);
  return (
    <AdminPage
      title="Welcome to Hearth"
      subtitle="Make it your home. Everything here can be changed later."
    >
      <div className="setup-intro">
        <img src="/brand/hearth-mark.png" alt="" />
        <div>
          <h2>{admin.data.household.name}</h2>
          <p>Your phone is connected. Home Assistant is optional.</p>
        </div>
      </div>
      <section className="setup-group" aria-labelledby="setup-home-title">
        <h2 id="setup-home-title">Your home</h2>
        <SettingsMenu>
          <SettingsMenuLink
            icon="users"
            label="Add your family"
            to="/admin/people"
            description="Add adults and children, then choose their colours and photos."
            status={
              <span>
                {people.length} {people.length === 1 ? 'person' : 'people'}
              </span>
            }
            data-focus-entry="true"
          />
          <SettingsMenuLink
            icon="leaf"
            label="Choose your modules"
            to="/admin/modules"
            description="Keep the things your family uses. Turning one off keeps its data."
          />
          <SettingsMenuLink
            icon="television"
            label="Connect a screen or another phone"
            to="/admin/televisions"
            description="Open Hearth on the screen, then approve its six letters here."
            status={
              <span>
                {screens.length
                  ? `${screens.length} ${screens.length === 1 ? 'screen' : 'screens'} paired`
                  : 'No screen yet'}
              </span>
            }
          />
          <SettingsMenuLink
            icon="shield"
            label="Protect against a lost phone"
            to="/admin/televisions?recovery=1"
            description="Save a private recovery card or trust another connected adult phone."
            status={
              <span>
                {recovery.isPending
                  ? 'Checking…'
                  : recovery.isError
                    ? 'Check recovery'
                    : safeRecovery
                      ? 'Recovery set up'
                      : 'Set up recovery'}
              </span>
            }
          />
        </SettingsMenu>
      </section>
      <section className="setup-group" aria-labelledby="setup-extras-title">
        <h2 id="setup-extras-title">Connect what you use</h2>
        <p>
          Calendar, weather, photos and Home Assistant are independent. Skip any you don’t need.
        </p>
        <SettingsMenu>
          <SettingsMenuLink
            icon="link"
            label="Optional connections"
            to="/admin/connections"
            description="See what each connection adds and set it up at your own pace."
          />
        </SettingsMenu>
      </section>
      <Link className="admin-submit setup-finish" to="/today">
        Start using Hearth
      </Link>
      <p className="field-help">Return here from Hearth settings → Get started.</p>
    </AdminPage>
  );
}
