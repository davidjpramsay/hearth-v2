import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  PhotoCurationAsset,
  PhotoDeletionCommandResult,
  PhotoSourceIndexStatus,
} from '@hearth/shared';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { photosApi } from '../api/photos';
import { clearHearthClient, configureHearthClient } from '../api/core';
import { queryKeys } from '../api/queryKeys';
import { PhotosSettingsScreen } from './PhotosSettingsScreen';

vi.mock('../api/photos', () => ({
  photosApi: {
    getPhotoSource: vi.fn(),
    deleteManagedPhoto: vi.fn(),
  },
}));

const upload: PhotoCurationAsset = {
  id: 'photo_upload',
  thumbnailUrl: '/assets/upload-thumb.jpg',
  displayUrl: '/assets/upload.jpg',
  alt: 'Test picnic photo',
  width: 1200,
  height: 800,
  orientation: 'landscape',
  capturedAt: null,
  favourite: false,
  hidden: false,
  source: 'hearth-upload',
  canDeletePermanently: true,
};
const hiddenUpload: PhotoCurationAsset = {
  ...upload,
  id: 'photo_hidden_upload',
  alt: 'Test hidden photo',
  hidden: true,
};
const imported: PhotoCurationAsset = {
  ...upload,
  id: 'photo_imported',
  alt: 'Test imported photo',
  source: 'synology-folder',
  canDeletePermanently: false,
};
let photos: PhotoCurationAsset[];

function sourceStatus(): PhotoSourceIndexStatus {
  const visible = photos.filter((photo) => !photo.hidden).length;
  const importedCount = photos.filter((photo) => photo.source === 'synology-folder').length;
  return {
    householdId: 'household_test',
    collection: {
      id: 'collection_test',
      name: 'Test family photos',
      photoCount: visible,
      updatedAt: null,
      source: { kind: 'hearth-managed', label: 'Hearth photos', status: 'ready', message: null },
    },
    scanInProgress: false,
    indexedFileCount: photos.length,
    visiblePhotoCount: visible,
    hiddenPhotoCount: photos.length - visible,
    unsupportedFileCount: 0,
    corruptFileCount: 0,
    managedPhotoCount: photos.length - importedCount,
    importedPhotoCount: importedCount,
    upload: { enabled: true, maxFileBytes: 25 * 1024 * 1024, acceptedFormats: ['JPEG', 'PNG'] },
    folderImport: {
      configured: true,
      status: 'ready',
      lastCheckedAt: null,
      importedPhotoCount: importedCount,
      message: 'Approved folder import.',
    },
    photos: [...photos],
  };
}

function deleteResult(assetId: string): PhotoDeletionCommandResult {
  photos = photos.filter((photo) => photo.id !== assetId);
  return {
    deletedAssetId: assetId,
    status: sourceStatus(),
    replayed: false,
    audit: {
      id: 'audit_test',
      actorType: 'member',
      actorId: 'member_adult',
      source: 'companion',
      action: 'photo.delete',
      targetId: assetId,
      occurredAt: '2026-10-12T00:00:00.000Z',
      result: 'succeeded',
    },
  };
}

async function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <MemoryRouter initialEntries={['/admin/photos']}>
      <QueryClientProvider client={client}>
        <PhotosSettingsScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Family photos' });
  return client;
}

beforeEach(() => {
  configureHearthClient({
    mode: 'demo',
    generatedAt: '2026-10-12T00:00:00.000Z',
    household: {
      id: 'household_test',
      name: 'Test family',
      timezone: 'Australia/Perth',
      locale: 'en-AU',
    },
    timezone: 'Australia/Perth',
    locale: 'en-AU',
    localDate: '2026-10-12',
    weekStart: '2026-10-12',
    currentMonth: '2026-10',
    requiresSetup: false,
  });
  photos = [upload, hiddenUpload, imported];
  vi.mocked(photosApi.getPhotoSource).mockImplementation(async () => sourceStatus());
  vi.mocked(photosApi.deleteManagedPhoto).mockImplementation(async (assetId) =>
    deleteResult(assetId),
  );
});
afterEach(() => {
  cleanup();
  clearHearthClient();
  vi.resetAllMocks();
});

describe('photo removal', () => {
  it('offers direct deletion for visible and hidden Hearth uploads, never NAS imports', async () => {
    await renderScreen();
    expect(screen.getByRole('button', { name: `Delete photo: ${upload.alt}` })).toBeVisible();
    expect(screen.getByRole('button', { name: `Delete photo: ${hiddenUpload.alt}` })).toBeVisible();
    expect(screen.queryByRole('button', { name: `Delete photo: ${imported.alt}` })).toBeNull();
    expect(screen.getByRole('button', { name: `Hide photo: ${imported.alt}` })).toBeEnabled();
    expect(screen.getByRole('button', { name: `Hide photo: ${upload.alt}` })).toHaveAttribute(
      'data-focus-down',
      `photo-curation-delete-${upload.id}`,
    );
    expect(
      screen.getByRole('button', { name: `Restore photo: ${hiddenUpload.alt}` }),
    ).toHaveAttribute('data-focus-down', `photo-curation-delete-${hiddenUpload.id}`);
  });

  it('focuses the safe choice and cancels without deleting, returning to the opener', async () => {
    const user = userEvent.setup();
    await renderScreen();
    const opener = screen.getByRole('button', { name: `Delete photo: ${upload.alt}` });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Delete 1 Hearth photo?' });
    expect(dialog).toHaveAccessibleDescription(/cannot be undone/);
    expect(within(dialog).getByRole('button', { name: 'Keep photos' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Keep photos' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
    expect(photosApi.deleteManagedPhoto).not.toHaveBeenCalled();
  });

  it('confirms exactly one photo and refreshes the active library and dependent views', async () => {
    const user = userEvent.setup();
    const client = await renderScreen();
    const invalidation = vi.spyOn(client, 'invalidateQueries');
    await user.click(screen.getByRole('button', { name: `Delete photo: ${upload.alt}` }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await screen.findByText('1 photo deleted.');
    expect(photosApi.deleteManagedPhoto).toHaveBeenCalledExactlyOnceWith(
      upload.id,
      expect.stringMatching(/^request_photo_delete_/),
    );
    expect(screen.queryByRole('button', { name: `Delete photo: ${upload.alt}` })).toBeNull();
    expect(screen.getByRole('img', { name: hiddenUpload.alt })).toBeVisible();
    expect(screen.getByRole('img', { name: imported.alt })).toBeVisible();
    for (const queryKey of [
      queryKeys.photoSource,
      queryKeys.photos,
      queryKeys.today,
      queryKeys.activity,
    ]) {
      expect(invalidation).toHaveBeenCalledWith({ queryKey });
    }
  });

  it('keeps the exact confirmation target when the source refreshes while the dialog is open', async () => {
    const user = userEvent.setup();
    const client = await renderScreen();
    await user.click(screen.getByRole('button', { name: `Delete photo: ${upload.alt}` }));
    photos = [imported, hiddenUpload, upload];
    client.setQueryData(queryKeys.photoSource, sourceStatus());
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await screen.findByText('1 photo deleted.');
    expect(photosApi.deleteManagedPhoto).toHaveBeenCalledExactlyOnceWith(
      upload.id,
      expect.any(String),
    );
  });

  it('bulk deletes only managed selections, leaving the selected NAS original intact', async () => {
    const user = userEvent.setup();
    await renderScreen();
    await user.click(screen.getByRole('button', { name: 'Select photos' }));
    for (const photo of photos) {
      await user.click(screen.getByRole('button', { name: `Select photo: ${photo.alt}` }));
    }
    expect(
      screen.getByText('1 from the NAS folder can be hidden but not deleted here.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Delete selected (2)' }));
    expect(screen.getByRole('dialog', { name: 'Delete 2 Hearth photos?' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await screen.findByText('2 photos deleted.');
    expect(vi.mocked(photosApi.deleteManagedPhoto).mock.calls.map(([id]) => id)).toEqual([
      upload.id,
      hiddenUpload.id,
    ]);
    expect(screen.getByRole('img', { name: imported.alt })).toBeVisible();
  });

  it('restores the selection control if a refresh removed the intended neighbouring card', async () => {
    const user = userEvent.setup();
    const client = await renderScreen();
    await user.click(screen.getByRole('button', { name: `Delete photo: ${upload.alt}` }));
    photos = [upload, imported];
    client.setQueryData(queryKeys.photoSource, sourceStatus());
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await screen.findByText('1 photo deleted.');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Select photos' })).toHaveFocus(),
    );
  });

  it('disables confirmation during deletion and does not issue duplicate commands', async () => {
    const user = userEvent.setup();
    let finish!: (result: PhotoDeletionCommandResult) => void;
    vi.mocked(photosApi.deleteManagedPhoto).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await renderScreen();
    await user.click(screen.getByRole('button', { name: `Delete photo: ${upload.alt}` }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    const pending = await screen.findByRole('button', { name: 'Deleting…' });
    expect(pending).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep photos' })).toBeDisabled();
    await user.click(pending);
    expect(photosApi.deleteManagedPhoto).toHaveBeenCalledOnce();
    finish(deleteResult(upload.id));
    await screen.findByText('1 photo deleted.');
  });

  it('keeps a failed deletion visible and permits a newly confirmed retry', async () => {
    const user = userEvent.setup();
    vi.mocked(photosApi.deleteManagedPhoto).mockRejectedValueOnce(
      new Error('Storage unavailable.'),
    );
    await renderScreen();
    await user.click(screen.getByRole('button', { name: `Delete photo: ${upload.alt}` }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await screen.findByText('No photos deleted.');
    expect(screen.getByText('1 photo needs another try.')).toBeVisible();
    expect(screen.getByRole('img', { name: upload.alt })).toBeVisible();
    await user.click(screen.getByRole('button', { name: `Delete photo: ${upload.alt}` }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await screen.findByText('1 photo deleted.');
  });

  it('reports partial bulk success and retains the photo whose deletion failed', async () => {
    const user = userEvent.setup();
    vi.mocked(photosApi.deleteManagedPhoto).mockRejectedValueOnce(
      new Error('Storage unavailable.'),
    );
    await renderScreen();
    await user.click(screen.getByRole('button', { name: 'Select photos' }));
    for (const photo of [upload, hiddenUpload]) {
      await user.click(screen.getByRole('button', { name: `Select photo: ${photo.alt}` }));
    }
    await user.click(screen.getByRole('button', { name: 'Delete selected (2)' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await screen.findByText('1 photo deleted.');
    expect(screen.getByText('1 photo needs another try.')).toBeVisible();
    expect(screen.getByRole('img', { name: upload.alt })).toBeVisible();
    expect(screen.queryByRole('img', { name: hiddenUpload.alt })).toBeNull();
  });

  it('returns to a usable empty collection after removing the last Hearth photo', async () => {
    const user = userEvent.setup();
    photos = [upload];
    await renderScreen();
    await user.click(screen.getByRole('button', { name: `Delete photo: ${upload.alt}` }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await screen.findByText('No photos yet.');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'Select photos' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Choose photos' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'View family photos' })).toBeVisible();
  });
});
