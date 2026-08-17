import { useQuery } from '@tanstack/react-query';

import { photosApi } from '../api/photos';
import { queryKeys } from '../api/queryKeys';

export function usePhotosQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.photos,
    queryFn: photosApi.getPhotos,
    enabled,
    retry: false,
  });
}

export function usePhotoSourceQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.photoSource,
    queryFn: photosApi.getPhotoSource,
    enabled,
    retry: false,
  });
}
