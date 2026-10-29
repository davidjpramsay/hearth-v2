import { useQuery } from '@tanstack/react-query';
import { homeAssistantBridgeApi } from '../api/homeAssistantBridge';
import { indoorApi } from '../api/indoorClimate';
import { photosApi } from '../api/photos';
import { weatherApi } from '../api/weather';
import { queryKeys } from '../api/queryKeys';
import { AdminPage } from '../components/AdminPage';
import { SettingsMenu, SettingsMenuLink } from '../components/SettingsMenu';
import {
  useCalendarConnectionQuery,
  useHomeAssistantConnectionQuery,
} from '../hooks/useConnectionQueries';
import { useModules } from '../modules/context';
import '../components/SetupGuidance.css';

export function ConnectionsSettingsScreen() {
  const modules = useModules();
  const calendar = useCalendarConnectionQuery(modules.calendar);
  const homeAssistant = useHomeAssistantConnectionQuery(modules.home);
  const bridge = useQuery({
    queryKey: [...queryKeys.admin, 'home-assistant-bridge'],
    queryFn: ({ signal }) => homeAssistantBridgeApi.getConnection(signal),
    retry: false,
  });
  const weather = useQuery({
    queryKey: queryKeys.weatherLocation,
    queryFn: weatherApi.getLocation,
    enabled: modules.weather,
    retry: false,
  });
  const indoor = useQuery({
    queryKey: queryKeys.indoorSettings,
    queryFn: ({ signal }) => indoorApi.settings(signal),
    enabled: modules.weather,
    retry: false,
  });
  const photos = useQuery({
    queryKey: queryKeys.photoSource,
    queryFn: photosApi.getPhotoSource,
    enabled: modules.photos,
    retry: false,
  });
  return (
    <AdminPage
      title="Connections"
      subtitle="Choose the extras you want. Hearth works without Home Assistant."
    >
      {modules.calendar || modules.weather || modules.photos ? (
        <section className="connection-section" aria-labelledby="everyday-connections">
          <h2 id="everyday-connections">Everyday connections</h2>
          <SettingsMenu>
            {modules.calendar ? (
              <SettingsMenuLink
                icon="calendar"
                label="Calendar"
                to="/admin/connections/calendar"
                description={
                  calendar.data == null
                    ? 'Connect iCloud or a supported CalDAV account. Calendar access is read only.'
                    : `${calendar.data.label} · ${calendar.data.message}`
                }
                status={
                  <Badge
                    text={
                      calendar.isError
                        ? 'Check connection'
                        : calendar.isPending
                          ? 'Checking…'
                          : calendar.data
                            ? 'Connected'
                            : 'Set up'
                    }
                  />
                }
                data-focus-entry="true"
                data-focus-id="connection-calendar"
              />
            ) : null}
            {modules.weather ? (
              <SettingsMenuLink
                icon="cloud-sun"
                label="Outdoor weather"
                to="/admin/household"
                description="Choose your location. No Home Assistant or API key needed."
                status={
                  <Badge
                    text={
                      weather.isError
                        ? 'Check location'
                        : weather.isPending
                          ? 'Checking…'
                          : weather.data
                            ? 'Location set'
                            : 'Set up'
                    }
                  />
                }
              />
            ) : null}
            {modules.photos ? (
              <SettingsMenuLink
                icon="image"
                label="Family photos"
                to="/admin/photos"
                description="Add photos from your phone. A NAS photo library connection is optional."
                status={
                  <Badge
                    text={
                      photos.isError
                        ? 'Check photos'
                        : photos.isPending
                          ? 'Checking…'
                          : photos.data?.visiblePhotoCount
                            ? `${photos.data.visiblePhotoCount} photos`
                            : 'Add photos'
                    }
                  />
                }
              />
            ) : null}
          </SettingsMenu>
        </section>
      ) : null}
      <section className="connection-section" aria-labelledby="optional-smart-home">
        <h2 id="optional-smart-home">Optional smart home</h2>
        <p>
          Already use Home Assistant? Connect it here. Chores, reminders and routines work without
          it.
        </p>
        <SettingsMenu>
          <SettingsMenuLink
            icon="home"
            label="Home Assistant"
            to="/admin/connections/home-assistant"
            description={
              homeAssistant.data != null
                ? `${homeAssistant.data.label} · ${homeAssistant.data.message}`
                : bridge.data != null
                  ? 'Approved Home Assistant access to Hearth.'
                  : 'Install the Hearth integration, then approve six letters. No MQTT needed.'
            }
            data-focus-id="connection-home-assistant"
            status={
              <Badge
                text={
                  homeAssistant.data != null
                    ? 'Connected'
                    : bridge.data != null
                      ? 'Access enabled'
                      : bridge.isPending
                        ? 'Checking access…'
                        : bridge.isError
                          ? 'Check access'
                          : 'Set up'
                }
              />
            }
          />
          {modules.weather ? (
            <SettingsMenuLink
              icon="cloud"
              label="Indoor sensors"
              to="/admin/connections/indoor-sensors"
              description="Show selected HA temperature and humidity sensors with their recorded history."
              data-focus-id="connection-indoor-sensors"
              status={
                <Badge
                  text={
                    indoor.isError
                      ? 'Check sensors'
                      : indoor.isPending
                        ? 'Checking…'
                        : indoor.data?.configured && indoor.data.rooms.length
                          ? `${indoor.data.rooms.length} ${indoor.data.rooms.length === 1 ? 'room' : 'rooms'}`
                          : 'Set up'
                  }
                />
              }
            />
          ) : null}
        </SettingsMenu>
      </section>
      <SettingsMenu>
        <SettingsMenuLink
          icon="leaf"
          label="Choose modules"
          to="/admin/modules"
          description="Hide anything you don’t use. Saved data stays available."
        />
        <SettingsMenuLink
          icon="television"
          label="Phones & screens"
          to="/admin/televisions"
          description="Approve adult phones and display-only screens separately."
        />
      </SettingsMenu>
      <details className="connection-help">
        <summary>Install Hearth for another household</summary>
        <p>
          The installer creates fresh storage and a private first-phone QR. It includes no data,
          photos or credentials from this home.
        </p>
        <a className="admin-secondary" href="/downloads/hearth-server-setup.zip" download>
          Download server setup
        </a>
        <p>
          Requires an x86-64 Docker server, Python 3 and an already trusted private HTTPS address.
          Home Assistant is optional. Existing Synology installations keep their current update
          tools.
        </p>
      </details>
    </AdminPage>
  );
}

function Badge({ text }: { text: string }) {
  return <span className="connection-badge">{text}</span>;
}
