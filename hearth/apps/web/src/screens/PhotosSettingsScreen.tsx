import { Link } from 'react-router-dom';

import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { usePhotosQuery } from '../hooks/useHearthQueries';

export function PhotosSettingsScreen() {
  const gallery = usePhotosQuery();
  if (gallery.isPending) return <AdminLoading />;
  if (gallery.isError) return <AdminError message={gallery.error.message} />;
  return (
    <AdminPage title="Photo source" subtitle="Choose what may appear on the family screen">
      <div className="connection-list photo-source-options">
        <article className="connection-row">
          <span className="admin-setting-row__icon">
            <Icon name="image" />
          </span>
          <div>
            <strong>{gallery.data.collection.source.label}</strong>
            <p>
              {gallery.data.collection.photoCount} photos · {gallery.data.collection.source.message}
            </p>
          </div>
          <span className="connection-badge connection-badge--healthy">Current</span>
        </article>
        <article className="connection-row">
          <span className="admin-setting-row__icon">
            <Icon name="shield" />
          </span>
          <div>
            <strong>Approved Synology folder</strong>
            <p>
              Recommended for this home. Hearth will index only the folder or album an adult
              selects, not the whole photo library.
            </p>
          </div>
          <span className="connection-badge">Needs selection</span>
        </article>
        <article className="connection-row">
          <span className="admin-setting-row__icon">
            <Icon name="link" />
          </span>
          <div>
            <strong>Apple Shared Album link</strong>
            <p>
              View-only. A public album webpage can be opened by anyone with its link, but it is not
              a supported Hearth photo feed and will not be scraped or stored here.
            </p>
          </div>
          <span className="connection-badge">Not a sync source</span>
        </article>
      </div>
      <div className="phase-note">
        <strong>What happens next?</strong>
        <p>
          When you choose the exact Synology album, Hearth can create TV-sized copies and thumbnails
          while keeping the original files and private folder path on the NAS. No live Synology
          access has been configured yet.
        </p>
      </div>
      <Link
        className="admin-primary-action focusable"
        data-focus-id="photo-settings-view"
        to="/photos"
      >
        <Icon name="image" />
        View family photos
      </Link>
    </AdminPage>
  );
}
