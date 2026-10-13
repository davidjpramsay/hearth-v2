import { useEffect, useMemo, useState } from 'react';

import type { PhotoAsset, PhotoGallery, TodayPhotoSummary } from '@hearth/shared';

import { usePhotoPlayback } from './usePhotoPlayback';

export const TODAY_PHOTO_ROTATION_MS = 5 * 60_000;

export function useTodayPhotoRotation({
  fallbackPhoto,
  gallery,
  paused,
}: {
  fallbackPhoto: TodayPhotoSummary | null;
  gallery: PhotoGallery | undefined;
  paused: boolean;
}): TodayPhotoSummary | null {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { orderedPhotos, advance, peekNextId } = usePhotoPlayback(gallery?.photos);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const currentAsset = useMemo(
    () => findCurrentAsset(orderedPhotos, selectedId),
    [orderedPhotos, selectedId],
  );
  const displayedPhoto = useMemo(
    () => toTodayPhoto(currentAsset) ?? (gallery === undefined ? fallbackPhoto : null),
    [currentAsset, fallbackPhoto, gallery],
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (paused || prefersReducedMotion || !pageVisible || orderedPhotos.length < 2) {
      return;
    }

    const currentId = currentAsset?.id ?? null;
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      setSelectedId(advance(currentId));
    }, TODAY_PHOTO_ROTATION_MS);
    return () => window.clearTimeout(timer);
  }, [advance, currentAsset?.id, orderedPhotos.length, pageVisible, paused, prefersReducedMotion]);

  useEffect(() => {
    if (paused || prefersReducedMotion || !pageVisible || orderedPhotos.length < 2) {
      return;
    }
    const currentId = currentAsset?.id ?? orderedPhotos[0]?.id ?? null;
    const upcomingId = peekNextId(currentId);
    const upcoming = orderedPhotos.find((photo) => photo.id === upcomingId);
    if (upcoming === undefined) return;
    const preload = new Image();
    preload.decoding = 'async';
    preload.src = upcoming.displayUrl;
    return () => {
      preload.src = '';
    };
  }, [peekNextId, currentAsset?.id, orderedPhotos, pageVisible, paused, prefersReducedMotion]);

  return displayedPhoto;
}

function findCurrentAsset(photos: PhotoAsset[], selectedId: string | null): PhotoAsset | null {
  return photos.find((photo) => photo.id === selectedId) ?? photos[0] ?? null;
}

function toTodayPhoto(photo: PhotoAsset | null): TodayPhotoSummary | null {
  if (photo === null) return null;
  return {
    alt: photo.alt,
    height: photo.height,
    orientation: photo.orientation,
    url: photo.displayUrl,
    width: photo.width,
  };
}
