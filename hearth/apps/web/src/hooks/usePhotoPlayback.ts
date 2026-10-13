import { useCallback, useMemo, useState } from 'react';
import type { PhotoAsset } from '@hearth/shared';
import { shufflePhotoPlayback } from './photoPlayback';

const newSeed = () => Math.floor(Math.random() * 0x1_0000_0000);
const EMPTY_PHOTOS: PhotoAsset[] = [];

export function usePhotoPlayback(photos: PhotoAsset[] = EMPTY_PHOTOS) {
  const [cycle, setCycle] = useState(() => ({
    seed: newSeed(),
    nextSeed: newSeed(),
    previousId: null as string | null,
  }));
  const orderedPhotos = useMemo(
    () => shufflePhotoPlayback(photos, cycle.seed, cycle.previousId),
    [photos, cycle.seed, cycle.previousId],
  );
  const next = useCallback(
    (currentId: string | null, advance: boolean) => {
      if (orderedPhotos.length === 0) return null;
      const index = orderedPhotos.findIndex((photo) => photo.id === currentId);
      if (index < orderedPhotos.length - 1) return orderedPhotos[index + 1]?.id ?? null;
      const following = shufflePhotoPlayback(photos, cycle.nextSeed, currentId);
      if (advance) setCycle({ seed: cycle.nextSeed, nextSeed: newSeed(), previousId: currentId });
      return following[0]?.id ?? null;
    },
    [orderedPhotos, photos, cycle.nextSeed],
  );
  const peekNextId = useCallback((id: string | null) => next(id, false), [next]);
  const advance = useCallback((id: string | null) => next(id, true), [next]);
  return { orderedPhotos, peekNextId, advance };
}
