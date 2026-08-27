import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { PhotoCurationAction, PhotoCurationAsset, PhotoUploadResult } from '@hearth/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmDeletion, setConfirmDeletion] = useState(false);
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
    mutationFn: async (photos: PhotoCurationAsset[]) => {
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
    onSuccess: async ({ results }) => {
      const latest = results.at(-1);
      if (latest !== undefined) queryClient.setQueryData(queryKeys.photoSource, latest.status);
      setConfirmDeletion(false);
      setSelectedIds(new Set());
      setSelectionMode(false);
      pendingCurationFocus.current = 'photo-selection-toggle';
      await invalidatePhotoQueries(queryClient);
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
      (curation.isSuccess || deletion.isSuccess) &&
      pendingCurationFocus.current !== null &&
      focusById(pendingCurationFocus.current)
    ) {
      pendingCurationFocus.current = null;
    }
  }, [curation.isSuccess, deletion.isSuccess, source.data]);
  if (source.isPending) return <AdminLoading />;
  if (source.isError) return <AdminError message={source.error.message} />;

  const data = source.data;
  const status = data.collection.source.status;
  const canScan = data.folderImport.configured;
  const selectedPhotos = data.photos.filter((photo) => selectedIds.has(photo.id));
  const hideablePhotos = selectedPhotos.filter((photo) => !photo.hidden);
  const restorablePhotos = selectedPhotos.filter((photo) => photo.hidden);
  const deletablePhotos = selectedPhotos.filter((photo) => photo.canDeletePermanently);
  const importedSelections = selectedPhotos.length - deletablePhotos.length;
  const firstCurationFocus = data.photos[0]
    ? primaryCurationFocusId(data.photos[0], selectionMode)
    : 'photo-settings-view';
  const lastCurationFocus = data.photos.at(-1)
    ? primaryCurationFocusId(data.photos.at(-1)!, selectionMode)
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
        <p className="photo-source-guide__formats">JPEG, PNG, HEIC · 25 MB max</p>
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
        <article className="connection-row photo-source-detail">
          <span className="admin-setting-row__icon">
            <Icon name="shield" />
          </span>
          <div>
            <strong>Synology folder import</strong>
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
              data-focus-up={canScan ? 'photo-source-refresh' : 'photo-upload-select'}
              onClick={() => {
                setSelectionMode((current) => !current);
                setSelectedIds(new Set());
              }}
              type="button"
            >
              <Icon name="check" />
              {selectionMode ? 'Done selecting' : 'Select photos'}
            </button>
          </div>
        </header>
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
              disabled={hideablePhotos.length === 0 || bulkCuration.isPending}
              onClick={() => bulkCuration.mutate({ photos: hideablePhotos, action: 'hide' })}
              type="button"
            >
              <Icon name="eye-off" />
              Hide ({hideablePhotos.length})
            </button>
            <button
              className="photo-bulk-action focusable"
              disabled={restorablePhotos.length === 0 || bulkCuration.isPending}
              onClick={() => bulkCuration.mutate({ photos: restorablePhotos, action: 'unhide' })}
              type="button"
            >
              <Icon name="eye" />
              Restore ({restorablePhotos.length})
            </button>
            <button
              className="photo-bulk-action photo-bulk-action--danger focusable"
              disabled={deletablePhotos.length === 0 || deletion.isPending}
              onClick={() => setConfirmDeletion(true)}
              type="button"
            >
              <Icon name="trash" />
              Delete uploads ({deletablePhotos.length})
            </button>
          </div>
        ) : null}
        {data.photos.length === 0 ? (
          <div className="photo-curation__empty">
            <Icon name="image" />
            <p>No photos yet.</p>
          </div>
        ) : (
          <div className="photo-curation__grid">
            {data.photos.map((photo, index) => (
              <PhotoCurationCard
                busy={curation.isPending || bulkCuration.isPending || deletion.isPending}
                key={photo.id}
                nextFocus={
                  data.photos[index + 1]
                    ? primaryCurationFocusId(data.photos[index + 1]!, selectionMode)
                    : 'photo-settings-view'
                }
                onAction={(action) => curation.mutate({ assetId: photo.id, action })}
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
                  data.photos[index - 1]
                    ? primaryCurationFocusId(data.photos[index - 1]!, selectionMode)
                    : 'photo-selection-toggle'
                }
                selected={selectedIds.has(photo.id)}
                selectionMode={selectionMode}
              />
            ))}
          </div>
        )}
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
        count={deletablePhotos.length}
        onCancel={() => setConfirmDeletion(false)}
        onConfirm={() => deletion.mutate(deletablePhotos)}
        open={confirmDeletion}
        pending={deletion.isPending}
      />
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
        {duplicates > 0 || result.failures.length > 0 ? (
          <p>
            {duplicates > 0
              ? `${duplicates} ${duplicates === 1 ? 'duplicate' : 'duplicates'}. `
              : ''}
            {result.failures.length > 0
              ? `${result.failures.length} ${result.failures.length === 1 ? 'photo needs' : 'photos need'} another try.`
              : ''}
          </p>
        ) : null}
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
  selectionMode,
  selected,
  onToggleSelection,
}: {
  photo: PhotoCurationAsset;
  busy: boolean;
  priorFocus: string;
  nextFocus: string;
  onAction: (action: PhotoCurationAction) => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelection: () => void;
}) {
  const favouriteFocus = `photo-curation-favourite-${photo.id}`;
  const hideFocus = `photo-curation-hide-${photo.id}`;
  const restoreFocus = `photo-curation-restore-${photo.id}`;
  const selectFocus = `photo-curation-select-${photo.id}`;
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
        {selectionMode ? (
          <button
            aria-label={`${selected ? 'Deselect' : 'Select'} photo: ${photo.alt}`}
            aria-pressed={selected}
            className="photo-curation-action photo-curation-action--select focusable"
            data-focus-down={nextFocus}
            data-focus-id={selectFocus}
            data-focus-left={selectFocus}
            data-focus-right={selectFocus}
            data-focus-up={priorFocus}
            disabled={busy}
            onClick={onToggleSelection}
            type="button"
          >
            <Icon name="check" />
            {selected ? 'Selected' : 'Select'}
          </button>
        ) : photo.hidden ? (
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
          {changed} {changed === 1 ? 'photo' : 'photos'} {verb}.
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
        <p>
          This removes the private managed {count === 1 ? 'original' : 'originals'} and television
          copies. It cannot be undone. Photos imported from the NAS folder are not affected.
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
            className="admin-primary-action photo-delete-confirm focusable"
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
