import type { PhotoAsset, PhotoGallery } from '@hearth/shared';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shufflePhotoPlayback } from './photoPlayback';
import { usePhotoPlayback } from './usePhotoPlayback';
import { TODAY_PHOTO_ROTATION_MS, useTodayPhotoRotation } from './useTodayPhotoRotation';

const photos: PhotoAsset[] = Array.from({ length: 8 }, (_, index) => ({
  id: `photo_test_${index}`,
  alt: `Fictional photo ${index}`,
  favourite: index < 2,
  thumbnailUrl: `/demo/photo-${index}.jpg`,
  displayUrl: `/demo/photo-${index}.jpg`,
  capturedAt: null,
  width: 1200,
  height: 800,
  orientation: 'landscape',
}));
const ids = (items: PhotoAsset[]) => items.map((photo) => photo.id);
const gallery: PhotoGallery = {
  householdId: 'household_test',
  freshness: 'current',
  statusMessage: null,
  featuredPhotoId: photos[0]!.id,
  photos,
  collection: {
    id: 'collection_test',
    name: 'Fictional photos',
    photoCount: photos.length,
    updatedAt: null,
    source: { kind: 'demo', label: 'Demo', status: 'ready', message: null },
  },
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('shuffled family photo playback', () => {
  it('preserves every asset once and favourite flags without mutating management order', () => {
    const before = ids(photos);
    const shuffled = shufflePhotoPlayback(photos, 1234);
    expect(ids(shuffled).sort()).toEqual([...before].sort());
    expect(new Set(ids(shuffled)).size).toBe(photos.length);
    expect(shuffled.filter((photo) => photo.favourite)).toHaveLength(2);
    expect(ids(photos)).toEqual(before);
    expect(ids(shuffled)).not.toEqual(before);
  });
  it('is deterministic for preloading, varies by seed, and avoids immediate cycle repeats', () => {
    expect(ids(shufflePhotoPlayback(photos, 123))).toEqual(ids(shufflePhotoPlayback(photos, 123)));
    expect(ids(shufflePhotoPlayback(photos, 123))).not.toEqual(
      ids(shufflePhotoPlayback(photos, 456)),
    );
    const first = shufflePhotoPlayback(photos, 123)[0]!;
    expect(shufflePhotoPlayback(photos, 123, first.id)[0]?.id).not.toBe(first.id);
    expect(shufflePhotoPlayback([], 123)).toEqual([]);
    expect(shufflePhotoPlayback([photos[0]!], 123, photos[0]!.id)).toEqual([photos[0]]);
  });
  it('preloads without consuming the cycle and keeps timers stable across unrelated rerenders', () => {
    const { result, rerender } = renderHook(() => usePhotoPlayback(photos));
    const before = result.current;
    const first = before.orderedPhotos[0]!.id;
    const upcoming = before.peekNextId(first);
    expect(before.peekNextId(first)).toBe(upcoming);
    rerender();
    expect(result.current.orderedPhotos).toBe(before.orderedPhotos);
    expect(result.current.advance).toBe(before.advance);
    expect(result.current.peekNextId).toBe(before.peekNextId);
    expect(result.current.advance(first)).toBe(upcoming);
  });
  it('visits the whole cycle before reshuffling, then preloads the actual next cycle photo', () => {
    const { result } = renderHook(() => usePhotoPlayback(photos));
    let current = result.current.orderedPhotos[0]!.id;
    const seen = [current];
    for (let index = 1; index < photos.length; index += 1) {
      act(() => {
        current = result.current.advance(current)!;
      });
      seen.push(current);
    }
    expect(new Set(seen).size).toBe(photos.length);
    const next = result.current.peekNextId(current);
    expect(next).not.toBe(current);
    act(() => {
      current = result.current.advance(current)!;
    });
    expect(current).toBe(next);
    expect(result.current.orderedPhotos[0]?.id).toBe(next);
  });
  it('responds to removals without carrying removed assets into a new gallery', () => {
    const { result, rerender } = renderHook(({ items }) => usePhotoPlayback(items), {
      initialProps: { items: photos },
    });
    const remaining = photos.slice(3);
    rerender({ items: remaining });
    expect(ids(result.current.orderedPhotos).sort()).toEqual(ids(remaining).sort());
    expect(remaining.some((photo) => photo.id === result.current.peekNextId('removed'))).toBe(true);
  });
  it('Today rotates after five minutes even while its clock/metadata rerenders each minute', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ data }) =>
        useTodayPhotoRotation({
          gallery: data,
          fallbackPhoto: null,
          paused: false,
        }),
      { initialProps: { data: gallery } },
    );
    const first = result.current?.url;
    for (let minute = 1; minute < 5; minute += 1) {
      act(() => vi.advanceTimersByTime(60_000));
      rerender({ data: { ...gallery, statusMessage: `Updated minute ${minute}` } });
      expect(result.current?.url).toBe(first);
    }
    act(() => vi.advanceTimersByTime(TODAY_PHOTO_ROTATION_MS - 4 * 60_000));
    expect(result.current?.url).not.toBe(first);
  });
  it('Today respects pause and never restores an empty gallery from its stale fallback', () => {
    vi.useFakeTimers();
    const fallback = { alt: 'Old photo', orientation: 'landscape' as const, url: '/old.jpg' };
    const { result, rerender } = renderHook(
      ({ data }) =>
        useTodayPhotoRotation({
          gallery: data,
          fallbackPhoto: fallback,
          paused: true,
        }),
      { initialProps: { data: gallery } },
    );
    const first = result.current?.url;
    act(() => vi.advanceTimersByTime(TODAY_PHOTO_ROTATION_MS * 2));
    expect(result.current?.url).toBe(first);
    rerender({ data: { ...gallery, photos: [] } });
    expect(result.current).toBeNull();
  });
});
