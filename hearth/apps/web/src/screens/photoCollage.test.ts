import type { PhotoAsset } from '@hearth/shared';
import { describe, expect, it } from 'vitest';

import {
  arrangePhotoCollage,
  nextPhotoId,
  photoCollageFeatureSide,
  photoCollageMode,
} from './photoCollage';

function photo(id: string, orientation: PhotoAsset['orientation']): PhotoAsset {
  return {
    id,
    thumbnailUrl: `/photos/${id}-thumb.jpg`,
    displayUrl: `/photos/${id}.jpg`,
    alt: `${id} family photo`,
    width: orientation === 'portrait' ? 800 : 1200,
    height: orientation === 'portrait' ? 1200 : 800,
    orientation,
    capturedAt: null,
    favourite: true,
  };
}

const photos = [
  photo('landscape-1', 'landscape'),
  photo('landscape-2', 'landscape'),
  photo('portrait-1', 'portrait'),
  photo('landscape-3', 'landscape'),
  photo('landscape-4', 'landscape'),
];

describe('photo collage arrangement', () => {
  it('makes a selected landscape the wide feature while keeping the portrait in a useful support tile', () => {
    const arranged = arrangePhotoCollage(photos, 'landscape-2');
    expect(arranged.map(({ photo: item, slot }) => [item.id, slot])).toEqual([
      ['landscape-2', 'feature'],
      ['portrait-1', 'support-1'],
      ['landscape-3', 'support-2'],
      ['landscape-4', 'support-3'],
      ['landscape-1', 'support-4'],
    ]);
    expect(photoCollageMode(arranged[0]!.photo)).toBe('landscape');
  });

  it('uses a selected portrait as the tall feature and limits the calm collage to five photos', () => {
    const arranged = arrangePhotoCollage(
      [...photos, photo('portrait-2', 'portrait')],
      'portrait-1',
    );
    expect(arranged[0]?.photo.id).toBe('portrait-1');
    expect(photoCollageMode(arranged[0]!.photo)).toBe('portrait');
    expect(arranged[1]!.photo.orientation).toBe('landscape');
    expect(arranged).toHaveLength(5);
  });

  it('uses the selected landscape as the large anchor when no portrait exists', () => {
    const allLandscape = photos.filter((item) => item.orientation === 'landscape');
    const arranged = arrangePhotoCollage(allLandscape, 'landscape-3');

    expect(arranged[0]?.photo.id).toBe('landscape-3');
    expect(photoCollageMode(arranged[0]!.photo)).toBe('landscape');
    expect(arranged.map(({ photo: item }) => item.id)).toEqual([
      'landscape-3',
      'landscape-4',
      'landscape-1',
      'landscape-2',
    ]);
  });

  it('rotates deterministically through every photo and wraps to the start', () => {
    expect(nextPhotoId(photos, 'landscape-1')).toBe('landscape-2');
    expect(nextPhotoId(photos, 'landscape-4')).toBe('landscape-1');
    expect(nextPhotoId(photos, null)).toBe('landscape-1');
    expect(nextPhotoId([], null)).toBeNull();
  });

  it('alternates the television feature side without mirroring sparse collages', () => {
    expect(photoCollageFeatureSide(photos, 'landscape-2', 'landscape-2')).toBe('start');
    expect(photoCollageFeatureSide(photos, 'portrait-1', 'landscape-2')).toBe('end');
    expect(photoCollageFeatureSide(photos, 'landscape-3', 'landscape-2')).toBe('start');
    expect(photoCollageFeatureSide(photos.slice(0, 4), 'portrait-1', 'landscape-2')).toBe('start');
    expect(photoCollageFeatureSide(photos, 'missing', 'landscape-2')).toBe('start');
  });
});
