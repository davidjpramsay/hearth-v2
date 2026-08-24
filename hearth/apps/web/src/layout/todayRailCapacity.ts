import { useSyncExternalStore } from 'react';

export type TodayPhotoOrientation = 'landscape' | 'none' | 'portrait' | 'square';
export type TodayViewportClass = 'companion' | 'compact-tv' | 'full-tv';
export type TodayRailCapacity = 3 | 4 | 5;

const COMPANION_QUERY = '(max-width: 900px)';
const FULL_TV_QUERY = '(min-width: 901px) and (min-height: 900px)';

export function getTodayRailCapacity({
  photoOrientation,
  viewportClass,
}: {
  photoOrientation: TodayPhotoOrientation;
  viewportClass: TodayViewportClass;
}): TodayRailCapacity {
  if (viewportClass === 'companion') return 3;
  if (photoOrientation === 'landscape') return viewportClass === 'full-tv' ? 4 : 3;
  if (photoOrientation === 'square' && viewportClass === 'compact-tv') return 3;
  return 5;
}

export function useTodayViewportClass(): TodayViewportClass {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function subscribe(listener: () => void): () => void {
  const mediaQueries = [window.matchMedia(COMPANION_QUERY), window.matchMedia(FULL_TV_QUERY)];
  mediaQueries.forEach((mediaQuery) => mediaQuery.addEventListener('change', listener));
  return () => {
    mediaQueries.forEach((mediaQuery) => mediaQuery.removeEventListener('change', listener));
  };
}

function getSnapshot(): TodayViewportClass {
  if (window.matchMedia(COMPANION_QUERY).matches) return 'companion';
  return window.matchMedia(FULL_TV_QUERY).matches ? 'full-tv' : 'compact-tv';
}

function getServerSnapshot(): TodayViewportClass {
  return 'compact-tv';
}
