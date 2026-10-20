import { useSyncExternalStore } from 'react';

import { COMPANION_QUERY } from './viewportQueries';

export type TodayPhotoOrientation = 'landscape' | 'none' | 'portrait' | 'square';
export type TodayViewportClass = 'companion' | 'short-tv' | 'compact-tv' | 'full-tv';
export type TodayRailCapacity = 1 | 2 | 3 | 4 | 5;

const FULL_TV_QUERY = '(min-width: 1200px) and (min-height: 900px)';
const SHORT_TV_QUERY = '(min-width: 1200px) and (max-height: 719px)';

export function getTodayRailCapacity({
  photoOrientation,
  summaryCount = 0,
  hasVerse = false,
  viewportClass,
}: {
  photoOrientation: TodayPhotoOrientation;
  summaryCount?: number;
  hasVerse?: boolean;
  viewportClass: TodayViewportClass;
}): TodayRailCapacity {
  if (viewportClass === 'companion') return 3;
  if (viewportClass === 'short-tv')
    return summaryCount >= 5 || (hasVerse && summaryCount >= 4) ? 1 : 2;
  if (hasVerse && summaryCount >= 2) return viewportClass === 'compact-tv' ? 3 : 4;
  if (summaryCount >= 5 && viewportClass === 'compact-tv') return 3;
  if (summaryCount >= 5 && photoOrientation === 'portrait') return 4;
  if (photoOrientation === 'landscape') return viewportClass === 'full-tv' ? 4 : 3;
  if (photoOrientation === 'square' && viewportClass === 'compact-tv') return 3;
  return 5;
}

export function useTodayViewportClass(): TodayViewportClass {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function subscribe(listener: () => void): () => void {
  const mediaQueries = [COMPANION_QUERY, FULL_TV_QUERY, SHORT_TV_QUERY].map((query) =>
    window.matchMedia(query),
  );
  mediaQueries.forEach((mediaQuery) => mediaQuery.addEventListener('change', listener));
  return () => {
    mediaQueries.forEach((mediaQuery) => mediaQuery.removeEventListener('change', listener));
  };
}

function getSnapshot(): TodayViewportClass {
  if (window.matchMedia(COMPANION_QUERY).matches) return 'companion';
  if (window.matchMedia(SHORT_TV_QUERY).matches) return 'short-tv';
  return window.matchMedia(FULL_TV_QUERY).matches ? 'full-tv' : 'compact-tv';
}

function getServerSnapshot(): TodayViewportClass {
  return 'compact-tv';
}
