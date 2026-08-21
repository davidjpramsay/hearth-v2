import { useEffect, useMemo, useState } from 'react';

import type { PhotoAsset, PhotoGallery, TodayPhotoSummary } from '@hearth/shared';

import { nextPhotoId } from '../screens/photoCollage';

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
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const currentAsset = useMemo(
    () => findCurrentAsset(gallery, selectedId, fallbackPhoto),
    [fallbackPhoto, gallery, selectedId],
  );
  const displayedPhoto = useMemo(
    () => toTodayPhoto(currentAsset) ?? fallbackPhoto,
    [currentAsset, fallbackPhoto],
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
    if (
      paused ||
      prefersReducedMotion ||
      !pageVisible ||
      fallbackPhoto === null ||
      gallery === undefined ||
      gallery.photos.length < 2
    ) {
      return;
    }

    const currentId = currentAsset?.id ?? gallery.featuredPhotoId ?? gallery.photos[0]?.id ?? null;
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      setSelectedId(nextPhotoId(gallery.photos, currentId));
    }, TODAY_PHOTO_ROTATION_MS);
    return () => window.clearTimeout(timer);
  }, [currentAsset?.id, fallbackPhoto, gallery, pageVisible, paused, prefersReducedMotion]);

  useEffect(() => {
    if (
      paused ||
      prefersReducedMotion ||
      fallbackPhoto === null ||
      gallery === undefined ||
      gallery.photos.length < 2
    ) {
      return;
    }
    const currentId = currentAsset?.id ?? gallery.featuredPhotoId ?? gallery.photos[0]?.id ?? null;
    const upcomingId = nextPhotoId(gallery.photos, currentId);
    const upcoming = gallery.photos.find((photo) => photo.id === upcomingId);
    if (upcoming === undefined) return;
    const preload = new Image();
    preload.decoding = 'async';
    preload.src = upcoming.displayUrl;
    return () => {
      preload.src = '';
    };
  }, [currentAsset?.id, fallbackPhoto, gallery, paused, prefersReducedMotion]);

  return displayedPhoto;
}

function findCurrentAsset(
  gallery: PhotoGallery | undefined,
  selectedId: string | null,
  fallbackPhoto: TodayPhotoSummary | null,
): PhotoAsset | null {
  if (gallery === undefined) return null;
  return (
    gallery.photos.find((photo) => photo.id === selectedId) ??
    gallery.photos.find((photo) => photo.displayUrl === fallbackPhoto?.url) ??
    null
  );
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
