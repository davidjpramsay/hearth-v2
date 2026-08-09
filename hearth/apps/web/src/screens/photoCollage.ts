import type { PhotoAsset } from '@hearth/shared';

export const PHOTO_COLLAGE_ROTATION_MS = 45_000;
export const PHOTO_COLLAGE_SIZE = 5;

export type PhotoCollageMode = 'landscape' | 'portrait';
export type PhotoCollageSlot = 'feature' | 'support-1' | 'support-2' | 'support-3' | 'support-4';

export interface PhotoCollageItem {
  photo: PhotoAsset;
  slot: PhotoCollageSlot;
}

const SUPPORT_SLOTS: PhotoCollageSlot[] = ['support-1', 'support-2', 'support-3', 'support-4'];

export function photoCollageMode(photo: PhotoAsset): PhotoCollageMode {
  return photo.orientation === 'portrait' ? 'portrait' : 'landscape';
}

export function nextPhotoId(photos: PhotoAsset[], currentId: string | null): string | null {
  if (photos.length === 0) return null;
  const currentIndex = photos.findIndex((photo) => photo.id === currentId);
  return photos[(currentIndex + 1 + photos.length) % photos.length]?.id ?? photos[0]?.id ?? null;
}

export function arrangePhotoCollage(
  photos: PhotoAsset[],
  selectedId: string | null,
): PhotoCollageItem[] {
  if (photos.length === 0) return [];

  const selectedIndex = Math.max(
    photos.findIndex((photo) => photo.id === selectedId),
    0,
  );
  const ordered = [...photos.slice(selectedIndex), ...photos.slice(0, selectedIndex)];
  const featured = ordered[0];
  if (featured === undefined) return [];

  const orderedSupport = ordered.filter((photo) => photo.id !== featured.id);

  return [
    { photo: featured, slot: 'feature' },
    ...orderedSupport.slice(0, PHOTO_COLLAGE_SIZE - 1).map((photo, index) => ({
      photo,
      slot: SUPPORT_SLOTS[index] ?? 'support-4',
    })),
  ];
}
