import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { createRequestId, getHearthRuntime, hearthApi, queryKeys } from '../api/client';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { usePhotoSourceQuery } from '../hooks/useHearthQueries';

export function PhotosSettingsScreen() {
  const source = usePhotoSourceQuery();
  const queryClient = useQueryClient();
  const refresh = useMutation({
    mutationFn: () => hearthApi.refreshPhotoSource(createRequestId('photo_scan')),
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.photoSource, result.status);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.photos }),
        queryClient.invalidateQueries({ queryKey: queryKeys.today }),
      ]);
    },
  });
  if (source.isPending) return <AdminLoading />;
  if (source.isError) return <AdminError message={source.error.message} />;

  const data = source.data;
  const status = data.collection.source.status;
  const canScan = status !== 'unconfigured';
  return (
    <AdminPage title="Photo source" subtitle="Control what may appear on the family screen">
      <div className="connection-list photo-source-options">
        <article className="connection-row">
          <span className="admin-setting-row__icon">
            <Icon name="image" />
          </span>
          <div>
            <strong>{data.collection.name}</strong>
            <p>
              {data.visiblePhotoCount} ready · {data.collection.source.message}
            </p>
          </div>
          <span
            className={`connection-badge${status === 'ready' ? ' connection-badge--healthy' : ''}`}
          >
            {sourceBadge(status)}
          </span>
        </article>
        <article className="connection-row photo-source-detail">
          <span className="admin-setting-row__icon">
            <Icon name="shield" />
          </span>
          <div>
            <strong>Read-only Synology folder</strong>
            <p>
              Hearth indexes only the approved folder. Originals and its private path never appear
              in the browser.
            </p>
            <dl className="photo-source-stats">
              <div>
                <dt>Last scan</dt>
                <dd>{formatScanTime(data.collection.updatedAt)}</dd>
              </div>
              <div>
                <dt>Indexed</dt>
                <dd>{data.indexedFileCount}</dd>
              </div>
              <div>
                <dt>Skipped</dt>
                <dd>{data.unsupportedFileCount + data.corruptFileCount}</dd>
              </div>
              {data.hiddenPhotoCount > 0 ? (
                <div>
                  <dt>Hidden</dt>
                  <dd>{data.hiddenPhotoCount}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          {canScan ? (
            <button
              className="photo-source-refresh focusable"
              data-focus-entry="true"
              data-focus-id="photo-source-refresh"
              disabled={refresh.isPending || data.scanInProgress}
              onClick={() => refresh.mutate()}
              type="button"
            >
              <Icon name="refresh" />
              {refresh.isPending || data.scanInProgress ? 'Scanning…' : 'Scan now'}
            </button>
          ) : null}
        </article>
        <article className="connection-row">
          <span className="admin-setting-row__icon">
            <Icon name="link" />
          </span>
          <div>
            <strong>Apple Shared Album link</strong>
            <p>
              A public album page can be opened by anyone with its link, but it is not a supported
              private Hearth feed and will not be scraped or stored.
            </p>
          </div>
          <span className="connection-badge">Not a sync source</span>
        </article>
      </div>
      {refresh.isError ? <AdminError message={refresh.error.message} /> : null}
      {refresh.isSuccess ? (
        <p className="save-confirmation" role="status">
          Photo folder checked. {refresh.data.status.visiblePhotoCount} photos are ready.
        </p>
      ) : null}
      <div className="phase-note">
        <strong>{canScan ? 'Local and private' : 'Folder selection is still required'}</strong>
        <p>
          {canScan
            ? 'Hearth makes orientation-correct TV copies and thumbnails locally, then checks the approved folder quietly in the background.'
            : 'The server administrator must mount exactly one approved NAS folder as read-only. Hearth will not browse the rest of Synology Photos.'}
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

function sourceBadge(status: 'ready' | 'unconfigured' | 'unavailable'): string {
  if (status === 'ready') return 'Current';
  if (status === 'unavailable') return 'Unavailable';
  return 'Needs selection';
}

function formatScanTime(value: string | null): string {
  if (value === null) return 'Not yet';
  const runtime = getHearthRuntime();
  return new Intl.DateTimeFormat(runtime.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: runtime.timezone,
  }).format(new Date(value));
}
