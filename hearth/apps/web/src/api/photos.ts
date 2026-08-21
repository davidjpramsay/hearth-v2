import {
  PhotoCurationCommandResultSchema,
  PhotoDeletionCommandResultSchema,
  PhotoGallerySchema,
  PhotoSourceIndexStatusSchema,
  PhotoSourceRefreshResultSchema,
  PhotoUploadResultSchema,
  type PhotoCurationAction,
  type PhotoCurationCommandResult,
  type PhotoDeletionCommandResult,
  type PhotoSourceIndexStatus,
  type PhotoSourceRefreshResult,
  type PhotoUploadResult,
} from '@hearth/shared';

import { demoAdminHeaders, householdApiBase, request } from './core';

export const photosApi = {
  getPhotos: () => request(`${householdApiBase()}/photos`, PhotoGallerySchema),
  getPhotoSource: (): Promise<PhotoSourceIndexStatus> =>
    request(`${householdApiBase()}/photo-source`, PhotoSourceIndexStatusSchema, {
      headers: demoAdminHeaders,
    }),
  refreshPhotoSource: (requestId: string): Promise<PhotoSourceRefreshResult> =>
    request(`${householdApiBase()}/photo-source/refreshes`, PhotoSourceRefreshResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId }),
    }),
  uploadPhoto: (file: File, requestId: string): Promise<PhotoUploadResult> => {
    const mimeType = photoMimeType(file);
    const capturedAt =
      Number.isFinite(file.lastModified) && file.lastModified > 0
        ? new Date(file.lastModified).toISOString()
        : null;
    return request(`${householdApiBase()}/photo-uploads`, PhotoUploadResultSchema, {
      method: 'POST',
      headers: {
        ...demoAdminHeaders,
        'Content-Type': mimeType,
        'X-Hearth-Request-Id': requestId,
        ...(capturedAt === null ? {} : { 'X-Hearth-Photo-Captured-At': capturedAt }),
      },
      body: file,
    });
  },
  updatePhotoCuration: (
    assetId: string,
    action: PhotoCurationAction,
    requestId: string,
  ): Promise<PhotoCurationCommandResult> =>
    request(
      `${householdApiBase()}/photo-assets/${assetId}/curation-actions`,
      PhotoCurationCommandResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId, action }),
      },
    ),
  deleteManagedPhoto: (assetId: string, requestId: string): Promise<PhotoDeletionCommandResult> =>
    request(
      `${householdApiBase()}/photo-assets/${assetId}/deletions`,
      PhotoDeletionCommandResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId }),
      },
    ),
};

const PHOTO_MIME_BY_EXTENSION: Record<string, string> = {
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
};

function photoMimeType(file: File): string {
  const normalized = file.type.trim().toLowerCase();
  if (normalized.startsWith('image/')) return normalized;
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  const inferred = PHOTO_MIME_BY_EXTENSION[extension];
  if (inferred === undefined) {
    throw new Error('Choose a JPEG, PNG, HEIC, HEIF, TIFF, AVIF or WebP photo.');
  }
  return inferred;
}
