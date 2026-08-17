import {
  PhotoCurationCommandResultSchema,
  PhotoGallerySchema,
  PhotoSourceIndexStatusSchema,
  PhotoSourceRefreshResultSchema,
  type PhotoCurationAction,
  type PhotoCurationCommandResult,
  type PhotoSourceIndexStatus,
  type PhotoSourceRefreshResult,
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
};
