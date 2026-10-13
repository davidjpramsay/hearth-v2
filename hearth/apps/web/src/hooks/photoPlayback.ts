import type { PhotoAsset } from '@hearth/shared';

// Display variety only, never a security random source. A seed keeps renders/preloads stable.
export function shufflePhotoPlayback(
  photos: readonly PhotoAsset[],
  seed: number,
  previousId: string | null = null,
): PhotoAsset[] {
  let value = seed >>> 0;
  const random = () => {
    value = (Math.imul(1664525, value) + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
  const shuffle = (items: PhotoAsset[]) => {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [items[index], items[other]] = [items[other]!, items[index]!];
    }
    return items;
  };
  // Management keeps favourites first; display playback gives every visible photo a turn.
  const result = shuffle([...photos]);
  if (result.length > 1 && result[0]?.id === previousId) {
    const different = result.findIndex((photo) => photo.id !== previousId);
    if (different > 0) [result[0], result[different]] = [result[different]!, result[0]!];
  }
  return result;
}
