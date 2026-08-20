import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PhotoCurationAction, PhotoCurationAsset, PhotoUploadResult } from '@hearth/shared';
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
  const uploadInput = useRef<HTMLInputElement>(null);
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
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const results = [];
      const failures: string[] = [];
      for (const file of files) {
        if (file.size > 25 * 1024 * 1024) {
          failures.push(`${file.name} is larger than 25 MB.`);
          continue;
        }
        try {
          results.push(await hearthApi.uploadPhoto(file, createRequestId('photo_upload')));
        } catch (error) {
          failures.push(error instanceof Error ? error.message : 'A photo could not be added.');
        }
      }
      return { results, failures };
    },
    onSuccess: async ({ results }) => {
      const latest = results.at(-1);
      if (latest !== undefined) queryClient.setQueryData(queryKeys.photoSource, latest.status);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.photoSource }),
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
  const canScan = data.folderImport.configured;
  const firstCurationFocus = data.photos[0]
    ? primaryCurationFocusId(data.photos[0])
    : 'photo-settings-view';
  const lastCurationFocus = data.photos.at(-1)
    ? primaryCurationFocusId(data.photos.at(-1)!)
    : 'photo-upload-select';
  return (
    <AdminPage title="Photos" subtitle="Add and choose what appears on the family screen">
      <section
        aria-labelledby="photo-upload-title"
        className={`photo-source-guide photo-source-guide--${status}`}
      >
        <div className="photo-source-guide__heading">
          <span className="admin-setting-row__icon">
            <Icon name="image" />
          </span>
          <div>
            <h2 id="photo-upload-title">Add photos from this phone</h2>
            <p>
              Choose several photos at once. Hearth makes private, orientation-correct copies on
              your Synology and adds them to the television immediately.
            </p>
          </div>
        </div>
        <input
          accept="image/jpeg,image/png,image/heic,image/heif,image/tiff,image/avif,image/webp,.heic,.heif"
          aria-hidden="true"
          className="photo-upload-input"
          disabled={upload.isPending || !data.upload.enabled}
          multiple
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            if (files.length > 0) upload.mutate(files);
          }}
          ref={uploadInput}
          tabIndex={-1}
          type="file"
        />
        <button
          className="admin-primary-action photo-upload-button focusable"
          data-focus-down={canScan ? 'photo-source-refresh' : firstCurationFocus}
          data-focus-entry="true"
          data-focus-id="photo-upload-select"
          disabled={upload.isPending || !data.upload.enabled}
          onClick={() => uploadInput.current?.click()}
          type="button"
        >
          <Icon name="image" />
          {upload.isPending ? 'Adding photos…' : 'Choose photos'}
        </button>
        <p className="photo-source-guide__formats">
          Up to 25 MB each · JPEG, PNG, HEIC, HEIF, TIFF, AVIF and WebP
        </p>
      </section>
      {upload.isSuccess ? <UploadResult result={upload.data} /> : null}
      {upload.isError ? <AdminError message={upload.error.message} /> : null}
      <div className="connection-list photo-source-options">
        <article className="connection-row">
          <span className="admin-setting-row__icon">
            <Icon name="image" />
          </span>
          <div>
            <strong>{data.collection.name}</strong>
            <p>
              {data.visiblePhotoCount} showing · {data.managedPhotoCount} added in Hearth ·{' '}
              {data.importedPhotoCount} imported
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
            <strong>Optional Synology folder import</strong>
            <p>
              {data.folderImport.message} This is useful for adding a large existing folder, but it
              is not required for everyday phone uploads.
            </p>
            <dl className="photo-source-stats">
              <div>
                <dt>Last check</dt>
                <dd>{formatScanTime(data.folderImport.lastCheckedAt)}</dd>
              </div>
              <div>
                <dt>Imported</dt>
                <dd>{data.importedPhotoCount}</dd>
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
              data-focus-down={firstCurationFocus}
              data-focus-id="photo-source-refresh"
              disabled={refresh.isPending || data.scanInProgress}
              onClick={() => refresh.mutate()}
              type="button"
            >
              <Icon name="refresh" />
              {refresh.isPending || data.scanInProgress ? 'Checking…' : 'Check folder'}
            </button>
          ) : null}
        </article>
      </div>
      {refresh.isError ? <AdminError message={refresh.error.message} /> : null}
      {refresh.isSuccess ? (
        <p className="save-confirmation" role="status">
          Optional folder checked. {refresh.data.status.importedPhotoCount} photos are imported.
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
            <p>Choose photos from this phone to start the family collection.</p>
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
                    : canScan
                      ? 'photo-source-refresh'
                      : 'photo-upload-select'
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
        <strong>Private Synology storage</strong>
        <p>
          Hearth keeps managed photo masters and television copies inside its private data folder.
          Filesystem paths and original upload names never appear in the browser. Include the Hearth
          data folder in encrypted Synology backup.
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

function UploadResult({
  result,
}: {
  result: { results: PhotoUploadResult[]; failures: string[] };
}) {
  const added = result.results.filter((item) => !item.duplicate).length;
  const duplicates = result.results.length - added;
  return (
    <div
      className={`photo-upload-result${result.failures.length > 0 ? ' photo-upload-result--partial' : ''}`}
      role="status"
    >
      <Icon name={result.failures.length > 0 ? 'warning' : 'check'} />
      <div>
        <strong>
          {added > 0
            ? `${added} ${added === 1 ? 'photo' : 'photos'} added.`
            : 'No new photos added.'}
        </strong>
        <p>
          {duplicates > 0
            ? `${duplicates} ${duplicates === 1 ? 'duplicate was' : 'duplicates were'} already in Hearth. `
            : ''}
          {result.failures.length > 0
            ? `${result.failures.length} ${result.failures.length === 1 ? 'photo could' : 'photos could'} not be added.`
            : 'The family collection is ready.'}
        </p>
      </div>
    </div>
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
