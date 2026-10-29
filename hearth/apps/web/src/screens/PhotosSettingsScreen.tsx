import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { PhotoCurationAction, PhotoCurationAsset } from '@hearth/shared';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';

import './PhotosSettingsScreen.css';

import { createRequestId, getHearthRuntime } from '../api/core';
import { photosApi as hearthApi } from '../api/photos';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminPage, AdminQueryState } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { PhotoAssetImage } from '../components/PhotoAssetImage';
import { focusById } from '../focus/focusGraph';
import { usePhotoSourceQuery } from '../hooks/usePhotoQueries';
import { PhotoUploadQueue, type QueuedPhoto } from '../hooks/photoUploadQueue';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';

interface PhotoDeleteRequest {
  photos: PhotoCurationAsset[];
  focusAfter: string;
}

export function PhotosSettingsScreen() {
  const source = usePhotoSourceQuery();
  const queryClient = useQueryClient();
  const pendingCurationFocus = useRef<string | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [photoPage, setPhotoPage] = useState(0);
  const [filter, setFilter] = useState<'all' | 'favourites' | 'hidden'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleteRequest, setDeleteRequest] = useState<PhotoDeleteRequest | null>(null);
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
  const bulkCuration = useMutation({
    mutationFn: async ({
      photos,
      action,
    }: {
      photos: PhotoCurationAsset[];
      action: 'hide' | 'unhide';
    }) => {
      const results = [];
      const failures: string[] = [];
      for (const photo of photos) {
        try {
          results.push(
            await hearthApi.updatePhotoCuration(
              photo.id,
              action,
              createRequestId(`photo_bulk_${action}`),
            ),
          );
        } catch (error) {
          failures.push(error instanceof Error ? error.message : 'A photo could not be updated.');
        }
      }
      return { action, results, failures };
    },
    onSuccess: async ({ results }) => {
      const latest = results.at(-1);
      if (latest !== undefined) queryClient.setQueryData(queryKeys.photoSource, latest.status);
      setSelectedIds(new Set());
      await invalidatePhotoQueries(queryClient);
    },
  });
  const deletion = useMutation({
    mutationFn: async ({ photos }: PhotoDeleteRequest) => {
      const results = [];
      const failures: string[] = [];
      for (const photo of photos) {
        try {
          results.push(
            await hearthApi.deleteManagedPhoto(photo.id, createRequestId('photo_delete')),
          );
        } catch (error) {
          failures.push(error instanceof Error ? error.message : 'A photo could not be removed.');
        }
      }
      return { results, failures };
    },
    onSuccess: async ({ results }, deletionRequest) => {
      const latest = results.at(-1);
      if (latest !== undefined) queryClient.setQueryData(queryKeys.photoSource, latest.status);
      setDeleteRequest(null);
      setSelectedIds(new Set());
      setSelectionMode(false);
      pendingCurationFocus.current = deletionRequest.focusAfter;
      await invalidatePhotoQueries(queryClient);
    },
  });
  const [uploadQueue] = useState(
    () =>
      new PhotoUploadQueue(
        hearthApi.uploadPhoto,
        (result) => queryClient.setQueryData(queryKeys.photoSource, result.status),
        () => {
          void invalidatePhotoQueries(queryClient);
        },
      ),
  );
  const uploads = useSyncExternalStore(uploadQueue.subscribe, uploadQueue.getSnapshot);
  const uploading = uploads.items.some((item) =>
    ['queued', 'uploading', 'processing'].includes(item.state),
  );
  useUnsavedChanges(
    uploading || uploads.items.some((item) => item.state === 'failed' && item.retryable),
  );
  useEffect(() => {
    uploadQueue.setActive(true);
    return () => uploadQueue.setActive(false);
  }, [uploadQueue]);

  useLayoutEffect(() => {
    if (
      (curation.isSuccess || deletion.isSuccess) &&
      pendingCurationFocus.current !== null &&
      (focusById(pendingCurationFocus.current) || focusById('photo-selection-toggle'))
    ) {
      pendingCurationFocus.current = null;
    }
  }, [curation.isSuccess, deletion.isSuccess, source.data]);
  if (source.isPending)
    return <AdminQueryState title="Manage photos" backTo="/more" backLabel="Back to More" />;
  if (source.data === undefined)
    return (
      <AdminQueryState
        title="Manage photos"
        backTo="/more"
        backLabel="Back to More"
        error={source.error ?? new Error('Couldn’t load these settings.')}
        onRetry={() => void source.refetch()}
      />
    );

  const data = source.data;
  const status = data.collection.source.status;
  const canScan = data.folderImport.configured;
  const selectedPhotos = data.photos.filter((photo) => selectedIds.has(photo.id));
  const hideablePhotos = selectedPhotos.filter((photo) => !photo.hidden);
  const restorablePhotos = selectedPhotos.filter((photo) => photo.hidden);
  const deletablePhotos = selectedPhotos.filter((photo) => photo.canDeletePermanently);
  const importedSelections = selectedPhotos.length - deletablePhotos.length;
  const filteredPhotos = data.photos.filter((photo) =>
    filter === 'hidden'
      ? photo.hidden
      : filter === 'favourites'
        ? photo.favourite && !photo.hidden
        : true,
  );
  const pageCount = Math.ceil(filteredPhotos.length / 48);
  const currentPage = Math.min(photoPage, Math.max(0, pageCount - 1));
  const visiblePhotos = filteredPhotos.slice(currentPage * 48, (currentPage + 1) * 48);
  const firstCurationFocus = visiblePhotos[0]
    ? primaryCurationFocusId(visiblePhotos[0], selectionMode)
    : 'photo-settings-view';
  const lastCurationFocus = visiblePhotos.at(-1)
    ? primaryCurationFocusId(visiblePhotos.at(-1)!, selectionMode)
    : 'photo-upload-select';
  return (
    <AdminPage backLabel="Back to More" backTo="/more" title="Manage photos">
      <section
        aria-labelledby="photo-upload-title"
        className={`photo-source-guide photo-source-guide--${status}`}
      >
        <div className="photo-source-guide__heading">
          <span className="admin-setting-row__icon">
            <Icon name="image" />
          </span>
          <div>
            <h2 id="photo-upload-title">Add photos</h2>
          </div>
        </div>
        <input
          accept="image/jpeg,image/png,image/heic,image/heif,image/tiff,image/avif,image/webp,.heic,.heif"
          aria-hidden="true"
          className="photo-upload-input"
          disabled={!data.upload.enabled}
          multiple
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            if (files.length > 0)
              uploadQueue.add(files, data.upload.maxFileBytes, () =>
                createRequestId('photo_upload'),
              );
          }}
          ref={uploadInput}
          tabIndex={-1}
          type="file"
        />
        <button
          className="admin-primary-action photo-upload-button focusable"
          data-focus-down="photo-selection-toggle"
          data-focus-entry="true"
          data-focus-id="photo-upload-select"
          disabled={!data.upload.enabled}
          onClick={() => uploadInput.current?.click()}
          type="button"
        >
          <Icon name="image" />
          Choose photos
        </button>
        <p className="photo-source-guide__formats">
          {data.upload.acceptedFormats.join(', ')} · up to{' '}
          {Math.round(data.upload.maxFileBytes / 1024 / 1024)} MB per photo
        </p>
        <p className="photo-source-guide__formats">
          Choose multiple photos together. Keep this page open while they upload.
        </p>
      </section>
      <PhotoUploadStatus
        items={uploads.items}
        paused={uploads.paused}
        onPause={uploadQueue.pause}
        onResume={uploadQueue.resume}
        onRetry={uploadQueue.retry}
      />
      <div className="connection-list photo-source-options">
        <article className="connection-row">
          <span className="admin-setting-row__icon">
            <Icon name="image" />
          </span>
          <div>
            <strong>{data.collection.name}</strong>
            <p>
              {data.visiblePhotoCount} showing · {data.managedPhotoCount} in Hearth ·{' '}
              {data.importedPhotoCount} imported
            </p>
          </div>
          <span
            className={`connection-badge${status === 'ready' ? ' connection-badge--healthy' : ''}`}
          >
            {sourceBadge(status)}
          </span>
        </article>
        <details className="photo-folder-options" open={data.folderImport.status === 'unavailable'}>
          <summary
            className="focusable"
            data-focus-id="photo-folder-toggle"
            data-focus-right="photo-selection-toggle"
            data-focus-down="photo-selection-toggle"
          >
            Synology folder import
          </summary>
          <article className="connection-row photo-source-detail">
            <span className="admin-setting-row__icon">
              <Icon name="shield" />
            </span>
            <div>
              <strong>Optional folder</strong>
              <p>{canScan ? data.folderImport.message : 'Not connected'}</p>
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
        </details>
      </div>
      {refresh.isError ? <AdminError message={refresh.error.message} /> : null}
      {refresh.isSuccess ? (
        <p className="save-confirmation" role="status">
          Folder checked · {refresh.data.status.importedPhotoCount} imported
        </p>
      ) : null}
      <section className="photo-curation" aria-labelledby="photo-curation-title">
        <header className="photo-curation__header">
          <div>
            <h2 id="photo-curation-title">Family photos</h2>
            <p>Favourites first · hidden photos stay hidden</p>
          </div>
          <div className="photo-curation__header-actions">
            <div className="photo-curation__counts" aria-label="Photo visibility summary">
              <span>
                <strong>{data.visiblePhotoCount}</strong> showing
              </span>
              <span>
                <strong>{data.hiddenPhotoCount}</strong> hidden
              </span>
            </div>
            <button
              aria-pressed={selectionMode}
              className="photo-selection-toggle focusable"
              data-focus-down={firstCurationFocus}
              data-focus-id="photo-selection-toggle"
              data-focus-up="photo-upload-select"
              data-focus-right="photo-filter-all"
              data-focus-left="photo-folder-toggle"
              onClick={() => {
                setSelectionMode((current) => !current);
                setSelectedIds(new Set());
                setPhotoPage(0);
              }}
              type="button"
            >
              <Icon name="check" />
              {selectionMode ? 'Done selecting' : 'Select photos'}
            </button>
          </div>
        </header>
        <div className="photo-library-filters" role="group" aria-label="Filter photos">
          {(['all', 'favourites', 'hidden'] as const).map((value) => (
            <button
              type="button"
              className="photo-selection-toggle focusable"
              aria-pressed={filter === value}
              data-focus-id={`photo-filter-${value}`}
              data-focus-left={
                value === 'all'
                  ? 'photo-selection-toggle'
                  : value === 'favourites'
                    ? 'photo-filter-all'
                    : 'photo-filter-favourites'
              }
              data-focus-right={value === 'all' ? 'photo-filter-favourites' : 'photo-filter-hidden'}
              data-focus-up="photo-selection-toggle"
              data-focus-down={firstCurationFocus}
              key={value}
              onClick={() => {
                setFilter(value);
                setPhotoPage(0);
              }}
            >
              {value === 'all' ? 'All photos' : value === 'favourites' ? 'Favourites' : 'Hidden'}
            </button>
          ))}
        </div>
        {selectionMode ? (
          <div className="photo-bulk-actions" role="group" aria-label="Selected photo actions">
            <div>
              <strong>{selectedPhotos.length} selected</strong>
              <span>
                {importedSelections > 0
                  ? `${importedSelections} from the NAS folder can be hidden but not deleted here.`
                  : 'Choose one or more photos below.'}
              </span>
            </div>
            <button
              className="photo-bulk-action focusable"
              type="button"
              disabled={bulkCuration.isPending || deletion.isPending}
              onClick={() =>
                setSelectedIds(
                  (current) => new Set([...current, ...visiblePhotos.map((photo) => photo.id)]),
                )
              }
            >
              Select page
            </button>
            <button
              className="photo-bulk-action focusable"
              type="button"
              disabled={selectedPhotos.length === 0 || bulkCuration.isPending || deletion.isPending}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear selection
            </button>
            <button
              className="photo-bulk-action focusable"
              disabled={hideablePhotos.length === 0 || bulkCuration.isPending || deletion.isPending}
              onClick={() => bulkCuration.mutate({ photos: hideablePhotos, action: 'hide' })}
              type="button"
            >
              <Icon name="eye-off" />
              Hide ({hideablePhotos.length})
            </button>
            <button
              className="photo-bulk-action focusable"
              disabled={
                restorablePhotos.length === 0 || bulkCuration.isPending || deletion.isPending
              }
              onClick={() => bulkCuration.mutate({ photos: restorablePhotos, action: 'unhide' })}
              type="button"
            >
              <Icon name="eye" />
              Restore ({restorablePhotos.length})
            </button>
            <button
              className="photo-bulk-action photo-bulk-action--danger focusable"
              disabled={
                deletablePhotos.length === 0 || deletion.isPending || bulkCuration.isPending
              }
              onClick={() =>
                setDeleteRequest({ photos: deletablePhotos, focusAfter: 'photo-selection-toggle' })
              }
              type="button"
            >
              <Icon name="trash" />
              Delete selected ({deletablePhotos.length})
            </button>
          </div>
        ) : null}
        {visiblePhotos.length === 0 ? (
          <div className="photo-curation__empty">
            <Icon name="image" />
            <p>{data.photos.length === 0 ? 'No photos yet.' : 'No photos match this filter.'}</p>
          </div>
        ) : (
          <div
            className={`photo-curation__grid${selectionMode ? ' photo-curation__grid--selection' : ''}`}
          >
            {visiblePhotos.map((photo, index) => (
              <PhotoCurationCard
                busy={curation.isPending || bulkCuration.isPending || deletion.isPending}
                key={photo.id}
                nextFocus={
                  visiblePhotos[index + 1]
                    ? primaryCurationFocusId(visiblePhotos[index + 1]!, selectionMode)
                    : 'photo-settings-view'
                }
                onAction={(action) => curation.mutate({ assetId: photo.id, action })}
                onDelete={() => {
                  const neighbour = visiblePhotos[index + 1] ?? visiblePhotos[index - 1];
                  setDeleteRequest({
                    photos: [photo],
                    focusAfter: neighbour
                      ? primaryCurationFocusId(neighbour)
                      : 'photo-selection-toggle',
                  });
                }}
                onToggleSelection={() => {
                  setSelectedIds((current) => {
                    const next = new Set(current);
                    if (next.has(photo.id)) next.delete(photo.id);
                    else next.add(photo.id);
                    return next;
                  });
                }}
                photo={photo}
                priorFocus={
                  visiblePhotos[index - 1]
                    ? primaryCurationFocusId(visiblePhotos[index - 1]!, selectionMode)
                    : 'photo-selection-toggle'
                }
                selected={selectedIds.has(photo.id)}
                selectionMode={selectionMode}
              />
            ))}
          </div>
        )}
        {pageCount > 1 ? (
          <nav className="photo-selection-pages" aria-label="Photo library pages">
            <p role="status">
              {currentPage * 48 + 1}–{Math.min((currentPage + 1) * 48, filteredPhotos.length)} of{' '}
              {filteredPhotos.length} photos
            </p>
            <div>
              {[
                { label: 'Previous photos', page: currentPage - 1 },
                { label: 'Next photos', page: currentPage + 1 },
              ].map(({ label, page }) => (
                <button
                  className="photo-selection-toggle focusable"
                  type="button"
                  key={label}
                  disabled={
                    page < 0 || page >= pageCount || bulkCuration.isPending || deletion.isPending
                  }
                  onClick={() => {
                    setPhotoPage(page);
                    const first = filteredPhotos[page * 48];
                    if (first)
                      requestAnimationFrame(() =>
                        focusById(primaryCurationFocusId(first, selectionMode)),
                      );
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </nav>
        ) : null}
      </section>
      {curation.isError ? <AdminError message={curation.error.message} /> : null}
      {bulkCuration.isError ? <AdminError message={bulkCuration.error.message} /> : null}
      {deletion.isError ? <AdminError message={deletion.error.message} /> : null}
      {curation.isSuccess ? (
        <p className="save-confirmation" role="status">
          {curationConfirmation(curation.data.audit.action)}
        </p>
      ) : null}
      {bulkCuration.isSuccess ? (
        <BulkPhotoResult
          action={bulkCuration.data.action}
          changed={bulkCuration.data.results.length}
          failures={bulkCuration.data.failures}
        />
      ) : null}
      {deletion.isSuccess ? (
        <BulkPhotoResult
          action="delete"
          changed={deletion.data.results.length}
          failures={deletion.data.failures}
        />
      ) : null}
      <div className="phase-note">
        <strong>Private Synology storage</strong>
        <p>Back up Hearth’s private data folder.</p>
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
      <PhotoDeleteDialog
        count={deleteRequest?.photos.length ?? 0}
        onCancel={() => setDeleteRequest(null)}
        onConfirm={() => {
          if (deleteRequest !== null && !deletion.isPending) deletion.mutate(deleteRequest);
        }}
        open={deleteRequest !== null}
        pending={deletion.isPending}
      />
    </AdminPage>
  );
}

function PhotoUploadStatus({
  items,
  paused,
  onPause,
  onResume,
  onRetry,
}: {
  items: QueuedPhoto[];
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
}) {
  if (items.length === 0) return null;
  const added = items.filter((item) => item.state === 'added').length;
  const duplicates = items.filter((item) => item.state === 'duplicate').length;
  const failed = items.filter((item) => item.state === 'failed');
  const pending = items.filter((item) =>
    ['queued', 'uploading', 'processing'].includes(item.state),
  );
  const completed = items.length - pending.length;
  return (
    <section className="photo-upload-status" aria-label="Photo uploads">
      <div className="photo-upload-status__header">
        <div role="status">
          <strong>
            {pending.length > 0
              ? `${completed} of ${items.length} photos finished${paused ? ' · paused' : ''}`
              : added > 0
                ? `${added} ${added === 1 ? 'photo' : 'photos'} added.`
                : 'No new photos added.'}
          </strong>
          <p>
            {duplicates > 0
              ? `${duplicates} ${duplicates === 1 ? 'duplicate' : 'duplicates'}. `
              : ''}
            {failed.length > 0
              ? `${failed.length} ${failed.length === 1 ? 'photo needs' : 'photos need'} another try.`
              : ''}
          </p>
        </div>
        {pending.length > 0 ? (
          <button
            type="button"
            className="photo-selection-toggle focusable"
            onClick={paused ? onResume : onPause}
          >
            {paused ? 'Continue uploading' : 'Pause queue'}
          </button>
        ) : null}
        {failed.some((item) => item.retryable) ? (
          <button type="button" className="photo-selection-toggle focusable" onClick={onRetry}>
            Retry failed photos
          </button>
        ) : null}
      </div>
      <progress aria-label="Photos finished" max={items.length} value={completed} />
      {pending.length > 0 || failed.length > 0 ? (
        <ul className="photo-upload-status__items">
          {[...pending, ...failed].map((item) => (
            <li key={item.requestId}>
              <span title={item.name}>{item.name}</span>
              <span>
                {item.state === 'queued'
                  ? 'Waiting'
                  : item.state === 'processing'
                    ? 'Preparing photo…'
                    : item.state === 'failed'
                      ? item.error
                      : `Uploading ${Math.round(item.fraction * 100)}%`}
              </span>
              {item.state === 'uploading' ? (
                <progress aria-label={`Uploading ${item.name}`} max={1} value={item.fraction} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {paused && pending.length > 0 ? (
        <p>Current uploads finish; remaining photos wait here.</p>
      ) : null}
    </section>
  );
}

function PhotoCurationCard({
  photo,
  busy,
  priorFocus,
  nextFocus,
  onAction,
  onDelete,
  selectionMode,
  selected,
  onToggleSelection,
}: {
  photo: PhotoCurationAsset;
  busy: boolean;
  priorFocus: string;
  nextFocus: string;
  onAction: (action: PhotoCurationAction) => void;
  onDelete: () => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelection: () => void;
}) {
  const favouriteFocus = `photo-curation-favourite-${photo.id}`;
  const hideFocus = `photo-curation-hide-${photo.id}`;
  const restoreFocus = `photo-curation-restore-${photo.id}`;
  const selectFocus = `photo-curation-select-${photo.id}`;
  const deleteFocus = `photo-curation-delete-${photo.id}`;
  const actionDown = photo.canDeletePermanently ? deleteFocus : nextFocus;
  if (selectionMode)
    return (
      <button
        aria-label={`${selected ? 'Deselect' : 'Select'} photo: ${photo.alt}`}
        aria-pressed={selected}
        className={`photo-selection-tile focusable${selected ? ' photo-selection-tile--selected' : ''}${photo.hidden ? ' photo-selection-tile--hidden' : ''}`}
        data-focus-id={selectFocus}
        disabled={busy}
        onClick={onToggleSelection}
        type="button"
      >
        <PhotoAssetImage alt="" className="photo-selection-tile__image" src={photo.thumbnailUrl} />
        <span aria-hidden="true" className="photo-selection-tile__check">
          <Icon name="check" />
        </span>
        {photo.hidden ? (
          <span aria-hidden="true" className="photo-selection-tile__hidden">
            <Icon name="eye-off" />
          </span>
        ) : null}
        {photo.source === 'synology-folder' ? (
          <span className="photo-selection-tile__source">NAS folder</span>
        ) : null}
        <span className="photo-selection-tile__label">{photo.alt}</span>
        <span className="sr-only">
          {photoSourceLabel(photo.source)}.{' '}
          {photo.hidden ? 'Hidden.' : photo.favourite ? 'Favourite.' : ''}
        </span>
      </button>
    );
  return (
    <article
      className={`photo-curation-card${photo.hidden ? ' photo-curation-card--hidden' : ''}${selected ? ' photo-curation-card--selected' : ''}`}
    >
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
        <span className="photo-curation-card__source">{photoSourceLabel(photo.source)}</span>
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
            data-focus-down={actionDown}
            data-focus-id={restoreFocus}
            data-focus-left={restoreFocus}
            data-focus-right={restoreFocus}
            data-focus-up={priorFocus}
            disabled={busy}
            onClick={() => onAction('unhide')}
            type="button"
          >
            <Icon name="eye" />
            <span className="photo-curation-action__label">Restore</span>
          </button>
        ) : (
          <>
            <button
              aria-label={`${photo.favourite ? 'Remove favourite from' : 'Favourite'} photo: ${photo.alt}`}
              aria-pressed={photo.favourite}
              className="photo-curation-action photo-curation-action--favourite focusable"
              data-focus-down={actionDown}
              data-focus-id={favouriteFocus}
              data-focus-left={favouriteFocus}
              data-focus-right={hideFocus}
              data-focus-up={priorFocus}
              disabled={busy}
              onClick={() => onAction(photo.favourite ? 'unfavourite' : 'favourite')}
              type="button"
            >
              <Icon name="star" />
              <span className="photo-curation-action__label">Favourite</span>
            </button>
            <button
              aria-label={`Hide photo: ${photo.alt}`}
              className="photo-curation-action photo-curation-action--hide focusable"
              data-focus-down={actionDown}
              data-focus-id={hideFocus}
              data-focus-left={favouriteFocus}
              data-focus-right={hideFocus}
              data-focus-up={priorFocus}
              disabled={busy}
              onClick={() => onAction('hide')}
              type="button"
            >
              <Icon name="eye-off" />
              <span className="photo-curation-action__label">Hide</span>
            </button>
          </>
        )}
        {!selectionMode && photo.canDeletePermanently ? (
          <button
            aria-label={`Delete photo: ${photo.alt}`}
            className="photo-curation-action photo-curation-action--delete focusable"
            data-focus-down={nextFocus}
            data-focus-id={deleteFocus}
            data-focus-left={deleteFocus}
            data-focus-right={deleteFocus}
            data-focus-up={photo.hidden ? restoreFocus : favouriteFocus}
            disabled={busy}
            onClick={onDelete}
            type="button"
          >
            <Icon name="trash" />
            <span className="photo-curation-action__label">Delete</span>
          </button>
        ) : null}
      </div>
    </article>
  );
}

function primaryCurationFocusId(photo: PhotoCurationAsset, selectionMode = false): string {
  if (selectionMode) return `photo-curation-select-${photo.id}`;
  return photo.hidden
    ? `photo-curation-restore-${photo.id}`
    : `photo-curation-favourite-${photo.id}`;
}

function BulkPhotoResult({
  action,
  changed,
  failures,
}: {
  action: 'hide' | 'unhide' | 'delete';
  changed: number;
  failures: string[];
}) {
  const verb = action === 'hide' ? 'hidden' : action === 'unhide' ? 'restored' : 'deleted';
  return (
    <div
      className={`photo-upload-result${failures.length > 0 ? ' photo-upload-result--partial' : ''}`}
      role="status"
    >
      <Icon name={failures.length > 0 ? 'warning' : 'check'} />
      <div>
        <strong>
          {changed === 0 ? 'No photos' : `${changed} ${changed === 1 ? 'photo' : 'photos'}`} {verb}.
        </strong>
        {failures.length > 0 ? (
          <p>
            {failures.length} {failures.length === 1 ? 'photo needs' : 'photos need'} another try.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PhotoDeleteDialog({
  open,
  count,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  count: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      if (document.activeElement instanceof HTMLElement) openerRef.current = document.activeElement;
      cancelRef.current?.focus();
      return;
    }
    openerRef.current?.focus();
    openerRef.current = null;
  }, [open]);
  if (!open) return null;
  return (
    <div
      aria-describedby="photo-delete-description"
      aria-labelledby="photo-delete-title"
      aria-modal="true"
      className="photo-delete-dialog"
      role="dialog"
    >
      <div className="photo-delete-dialog__panel">
        <span className="photo-delete-dialog__icon">
          <Icon name="trash" />
        </span>
        <h2 id="photo-delete-title">
          Delete {count} Hearth {count === 1 ? 'photo' : 'photos'}?
        </h2>
        <p id="photo-delete-description">
          This removes {count === 1 ? 'this photo' : 'these photos'} from Hearth, including stored
          originals and screen copies. It cannot be undone. NAS-folder originals are not affected.
        </p>
        <div className="photo-delete-dialog__actions">
          <button
            className="admin-secondary focusable"
            data-back-dismiss="true"
            data-focus-id="photo-delete-cancel"
            data-focus-right="photo-delete-confirm"
            disabled={pending}
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            Keep photos
          </button>
          <button
            className="admin-danger photo-delete-confirm focusable"
            data-focus-id="photo-delete-confirm"
            data-focus-left="photo-delete-cancel"
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            <Icon name="trash" />
            {pending ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

async function invalidatePhotoQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.photoSource }),
    queryClient.invalidateQueries({ queryKey: queryKeys.photos }),
    queryClient.invalidateQueries({ queryKey: queryKeys.today }),
    queryClient.invalidateQueries({ queryKey: queryKeys.activity }),
  ]);
}

function photoSourceLabel(source: PhotoCurationAsset['source']): string {
  if (source === 'hearth-upload') return 'Added in Hearth';
  if (source === 'synology-folder') return 'NAS folder';
  return 'Demo photo';
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
  if (action === 'photo.favourite') return 'Added to favourites.';
  if (action === 'photo.unfavourite') return 'Removed from favourites.';
  if (action === 'photo.hide') return 'Photo hidden.';
  return 'Photo restored.';
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
