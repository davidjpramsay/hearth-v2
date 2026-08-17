import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PhotoCurationAction, PhotoCurationAsset } from '@hearth/shared';
import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import './PhotosSettingsScreen.css';

import { createRequestId, getHearthRuntime } from '../api/core';
import { photosApi as hearthApi } from '../api/photos';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { PhotoAssetImage } from '../components/PhotoAssetImage';
import { focusById } from '../focus/focusGraph';
import { usePhotoSourceQuery } from '../hooks/usePhotoQueries';

export function PhotosSettingsScreen() {
  const source = usePhotoSourceQuery();
  const queryClient = useQueryClient();
  const pendingCurationFocus = useRef<string | null>(null);
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
  const curation = useMutation({
    mutationFn: ({ assetId, action }: { assetId: string; action: PhotoCurationAction }) =>
      hearthApi.updatePhotoCuration(assetId, action, createRequestId(`photo_${action}`)),
    onSuccess: async (result) => {
      pendingCurationFocus.current = primaryCurationFocusId(result.photo);
      queryClient.setQueryData(queryKeys.photoSource, result.status);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.photos }),
        queryClient.invalidateQueries({ queryKey: queryKeys.today }),
        queryClient.invalidateQueries({ queryKey: queryKeys.activity }),
      ]);
    },
  });

  useLayoutEffect(() => {
    if (
      curation.isSuccess &&
      pendingCurationFocus.current !== null &&
      focusById(pendingCurationFocus.current)
    ) {
      pendingCurationFocus.current = null;
    }
  }, [curation.isSuccess, source.data]);
  if (source.isPending) return <AdminLoading />;
  if (source.isError) return <AdminError message={source.error.message} />;

  const data = source.data;
  const status = data.collection.source.status;
  const canScan = status !== 'unconfigured';
  const firstCurationFocus = data.photos[0]
    ? primaryCurationFocusId(data.photos[0])
    : 'photo-settings-view';
  const lastCurationFocus = data.photos.at(-1)
    ? primaryCurationFocusId(data.photos.at(-1)!)
    : 'photo-source-refresh';
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
              data-focus-down={firstCurationFocus}
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
      <section className="photo-curation" aria-labelledby="photo-curation-title">
        <header className="photo-curation__header">
          <div>
            <h2 id="photo-curation-title">Choose family photos</h2>
            <p>
              Favourites appear first. Hidden photos stay indexed but never appear on Today, in the
              collage or in ambient mode.
            </p>
          </div>
          <div className="photo-curation__counts" aria-label="Photo visibility summary">
            <span>
              <strong>{data.visiblePhotoCount}</strong> showing
            </span>
            <span>
              <strong>{data.hiddenPhotoCount}</strong> hidden
            </span>
          </div>
        </header>
        {data.photos.length === 0 ? (
          <div className="photo-curation__empty">
            <Icon name="image" />
            <p>Photos will appear here after the approved folder has been scanned.</p>
          </div>
        ) : (
          <div className="photo-curation__grid">
            {data.photos.map((photo, index) => (
              <PhotoCurationCard
                busy={curation.isPending}
                key={photo.id}
                nextFocus={
                  data.photos[index + 1]
                    ? primaryCurationFocusId(data.photos[index + 1]!)
                    : 'photo-settings-view'
                }
                onAction={(action) => curation.mutate({ assetId: photo.id, action })}
                photo={photo}
                priorFocus={
                  data.photos[index - 1]
                    ? primaryCurationFocusId(data.photos[index - 1]!)
                    : 'photo-source-refresh'
                }
              />
            ))}
          </div>
        )}
      </section>
      {curation.isError ? <AdminError message={curation.error.message} /> : null}
      {curation.isSuccess ? (
        <p className="save-confirmation" role="status">
          {curationConfirmation(curation.data.audit.action)}
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
        data-focus-up={lastCurationFocus}
        data-focus-id="photo-settings-view"
        to="/photos"
      >
        <Icon name="image" />
        View family photos
      </Link>
    </AdminPage>
  );
}

function PhotoCurationCard({
  photo,
  busy,
  priorFocus,
  nextFocus,
  onAction,
}: {
  photo: PhotoCurationAsset;
  busy: boolean;
  priorFocus: string;
  nextFocus: string;
  onAction: (action: PhotoCurationAction) => void;
}) {
  const favouriteFocus = `photo-curation-favourite-${photo.id}`;
  const hideFocus = `photo-curation-hide-${photo.id}`;
  const restoreFocus = `photo-curation-restore-${photo.id}`;
  return (
    <article className={`photo-curation-card${photo.hidden ? ' photo-curation-card--hidden' : ''}`}>
      <div className="photo-curation-card__preview">
        <PhotoAssetImage
          alt={photo.alt}
          className="photo-curation-card__image"
          src={photo.thumbnailUrl}
        />
        <span className="photo-curation-card__state">
          <Icon name={photo.hidden ? 'eye-off' : photo.favourite ? 'star' : 'eye'} />
          {photo.hidden ? 'Hidden' : photo.favourite ? 'Favourite' : 'In rotation'}
        </span>
      </div>
      <div className="photo-curation-card__copy">
        <strong>{photo.alt}</strong>
        <span>
          {orientationLabel(photo.orientation)} · {formatPhotoDate(photo.capturedAt)}
        </span>
      </div>
      <div className="photo-curation-card__actions">
        {photo.hidden ? (
          <button
            aria-label={`Restore photo: ${photo.alt}`}
            className="photo-curation-action photo-curation-action--restore focusable"
            data-focus-down={nextFocus}
            data-focus-id={restoreFocus}
            data-focus-left={restoreFocus}
            data-focus-right={restoreFocus}
            data-focus-up={priorFocus}
            disabled={busy}
            onClick={() => onAction('unhide')}
            type="button"
          >
            <Icon name="eye" />
            Restore
          </button>
        ) : (
          <>
            <button
              aria-label={`${photo.favourite ? 'Remove favourite from' : 'Favourite'} photo: ${photo.alt}`}
              aria-pressed={photo.favourite}
              className="photo-curation-action photo-curation-action--favourite focusable"
              data-focus-down={nextFocus}
              data-focus-id={favouriteFocus}
              data-focus-left={favouriteFocus}
              data-focus-right={hideFocus}
              data-focus-up={priorFocus}
              disabled={busy}
              onClick={() => onAction(photo.favourite ? 'unfavourite' : 'favourite')}
              type="button"
            >
              <Icon name="star" />
              Favourite
            </button>
            <button
              aria-label={`Hide photo: ${photo.alt}`}
              className="photo-curation-action photo-curation-action--hide focusable"
              data-focus-down={nextFocus}
              data-focus-id={hideFocus}
              data-focus-left={favouriteFocus}
              data-focus-right={hideFocus}
              data-focus-up={priorFocus}
              disabled={busy}
              onClick={() => onAction('hide')}
              type="button"
            >
              <Icon name="eye-off" />
              Hide
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function primaryCurationFocusId(photo: PhotoCurationAsset): string {
  return photo.hidden
    ? `photo-curation-restore-${photo.id}`
    : `photo-curation-favourite-${photo.id}`;
}

function orientationLabel(orientation: PhotoCurationAsset['orientation']): string {
  return `${orientation[0]?.toUpperCase() ?? ''}${orientation.slice(1)}`;
}

function formatPhotoDate(value: string | null): string {
  if (value === null) return 'Date unavailable';
  const runtime = getHearthRuntime();
  return new Intl.DateTimeFormat(runtime.locale, {
    dateStyle: 'medium',
    timeZone: runtime.timezone,
  }).format(new Date(value));
}

function curationConfirmation(action: string): string {
  if (action === 'photo.favourite')
    return 'Photo added to favourites and moved forward in rotation.';
  if (action === 'photo.unfavourite') return 'Photo will still rotate, after family favourites.';
  if (action === 'photo.hide') return 'Photo hidden from Today, Photos and ambient mode.';
  return 'Photo restored to the family rotation.';
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
