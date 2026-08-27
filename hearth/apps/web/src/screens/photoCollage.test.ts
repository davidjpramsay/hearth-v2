import type { PhotoAsset } from '@hearth/shared';
import { describe, expect, it } from 'vitest';

import {
  arrangePhotoCollage,
  buildPhotoMosaic,
  fitMosaicInBox,
  fitPhotoMosaicInBox,
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

  it('uses real portrait rails and wide landscape bands for a mixed five-photo collage', () => {
    const arranged = arrangePhotoCollage(
      [...photos, photo('portrait-2', 'portrait')],
      'portrait-1',
    );
    expect(arranged[0]?.photo.id).toBe('portrait-1');
    expect(photoCollageMode(arranged[0]!.photo)).toBe('portrait');
    expect(arranged).toHaveLength(5);
    expect(arranged.filter((item) => item.photo.orientation === 'portrait')).toHaveLength(2);
    for (const item of arranged) {
      if (item.photo.orientation === 'portrait') {
        expect(item.placement.rowSpan).toBe(4);
        expect(item.placement.columnSpan / item.placement.columns).toBeLessThanOrEqual(0.25);
      } else {
        expect(item.placement.rowSpan).toBe(2);
      }
    }
  });

  it('keeps five portrait-heavy photos available for a ratio-driven mosaic', () => {
    const portraitHeavy = [
      photo('portrait-1', 'portrait'),
      photo('portrait-2', 'portrait'),
      photo('portrait-3', 'portrait'),
      photo('portrait-4', 'portrait'),
      photo('landscape-1', 'landscape'),
    ];

    const selectedPortrait = arrangePhotoCollage(portraitHeavy, 'portrait-1');
    expect(selectedPortrait).toHaveLength(5);
    expect(selectedPortrait.filter((item) => item.photo.orientation === 'portrait')).toHaveLength(
      4,
    );
    expect(selectedPortrait[0]?.photo.id).toBe('portrait-1');

    const selectedLandscape = arrangePhotoCollage(portraitHeavy, 'landscape-1');
    expect(selectedLandscape).toHaveLength(5);
    expect(selectedLandscape[0]?.photo.id).toBe('landscape-1');
    expect(selectedLandscape.filter((item) => item.photo.orientation === 'portrait')).toHaveLength(
      4,
    );
  });

  it('uses five true-ratio portrait tiles when every available photo is portrait', () => {
    const allPortrait = Array.from({ length: 6 }, (_, index) =>
      photo(`portrait-${index + 1}`, 'portrait'),
    );
    const arranged = arrangePhotoCollage(allPortrait, 'portrait-5');

    expect(arranged).toHaveLength(5);
    expect(arranged[0]?.photo.id).toBe('portrait-5');
    const mosaic = buildPhotoMosaic(arranged, 'start');
    expect(mosaic).not.toBeNull();
    expect(Object.keys(mosaic!.rects)).toHaveLength(5);
  });

  it('preserves every native image ratio in the generated mosaic geometry', () => {
    const arranged = arrangePhotoCollage(
      [...photos, photo('portrait-2', 'portrait')],
      'portrait-1',
    );
    const mosaic = buildPhotoMosaic(arranged, 'start');
    expect(mosaic).not.toBeNull();

    for (const item of arranged) {
      const rect = mosaic!.rects[item.photo.id];
      expect(rect).toBeDefined();
      const renderedRatio = (rect!.width * mosaic!.root.ratio) / rect!.height;
      expect(renderedRatio).toBeCloseTo(item.photo.width / item.photo.height, 6);
    }
  });

  it('fits a mosaic into the available stage without changing its ratio', () => {
    expect(fitMosaicInBox(2, 1000, 400)).toEqual({ height: 400, width: 800 });
    expect(fitMosaicInBox(2, 600, 400)).toEqual({ height: 300, width: 600 });
  });

  it('accounts for real gutters while preserving every rendered photo ratio', () => {
    const arranged = arrangePhotoCollage(
      [...photos, photo('portrait-2', 'portrait')],
      'portrait-1',
    );
    const mosaic = buildPhotoMosaic(arranged, 'start');
    expect(mosaic).not.toBeNull();

    const fitted = fitPhotoMosaicInBox(mosaic!.root, 1800, 690, 12);
    expect(fitted.width).toBeLessThanOrEqual(1800);
    expect(fitted.height).toBeLessThanOrEqual(690);

    for (const item of arranged) {
      const rect = fitted.rects[item.photo.id];
      expect(rect).toBeDefined();
      const renderedRatio = (rect!.width * fitted.width) / (rect!.height * fitted.height);
      expect(renderedRatio).toBeCloseTo(item.photo.width / item.photo.height, 6);
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.y).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(1.000_001);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(1.000_001);
    }

    expect(Math.max(...Object.values(fitted.rects).map((rect) => rect.height))).toBeCloseTo(1, 6);
    expect(
      Math.max(...Object.values(fitted.rects).map((rect) => rect.y + rect.height)),
    ).toBeCloseTo(1, 6);
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
