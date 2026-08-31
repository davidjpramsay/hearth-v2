import { useQueryClient } from '@tanstack/react-query';
import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import './PhotosScreen.css';

import type { DemoScenario } from '@hearth/shared';

import { demoApi as hearthApi } from '../api/demo';
import { Icon } from '../components/Icon';
import { PhotoAssetImage } from '../components/PhotoAssetImage';
import { ScreenHeader } from '../components/ScreenHeader';
import { FailureState, LoadingState, StatusBanner } from '../components/Status';
import { focusById } from '../focus/focusGraph';
import { usePhotoRotationPreference } from '../hooks/usePhotoRotationPreference';
import { usePhotosQuery } from '../hooks/usePhotoQueries';
import { useHouseholdClock } from '../hooks/useHouseholdClock';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { COMPANION_LANDSCAPE_QUERY } from '../layout/viewportQueries';
import {
  arrangePhotoCollage,
  buildPhotoMosaic,
  fitPhotoMosaicInBox,
  nextPhotoId,
  PHOTO_COLLAGE_ROTATION_MS,
  photoCollageFeatureSide,
  type PhotoCollageItem,
  type PhotoMosaicRect,
} from './photoCollage';

export function PhotosScreen({
  scenario,
  preparing,
}: {
  scenario: DemoScenario | 'offline';
  preparing: boolean;
}) {
  const query = usePhotosQuery(!preparing);
  const online = useOnlineStatus(scenario === 'offline');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualSelectionRevision, setManualSelectionRevision] = useState(0);
  const [ambient, setAmbient] = useState(false);
  const { rotationPaused, togglePhotoRotation } = usePhotoRotationPreference();
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === 'visible');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [compactLandscape, setCompactLandscape] = useState(
    () => window.matchMedia(COMPANION_LANDSCAPE_QUERY).matches,
  );
  const wasAmbient = useRef(false);
  const pendingAutomaticFocusId = useRef<string | null>(null);
  const [collageRef, collageSize] = useElementSize<HTMLDivElement>(
    !preparing && query.data !== undefined,
  );
  const householdTime = useHouseholdClock();

  const gallery = query.data;
  const favouriteCount = gallery?.photos.reduce(
    (count, photo) => count + Number(photo.favourite),
    0,
  );
  const selected =
    gallery?.photos.find((photo) => photo.id === selectedId) ??
    gallery?.photos.find((photo) => photo.id === gallery.featuredPhotoId) ??
    gallery?.photos[0] ??
    null;
  const collageItems = arrangePhotoCollage(gallery?.photos ?? [], selected?.id ?? null);
  const collageFeatureSide = photoCollageFeatureSide(
    gallery?.photos ?? [],
    collageItems[0]?.photo.id ?? null,
    gallery?.featuredPhotoId ?? gallery?.photos[0]?.id ?? null,
  );
  const visibleCollageItems = compactLandscape ? collageItems.slice(0, 3) : collageItems;
  const visiblePortraitCount = visibleCollageItems.filter(
    ({ photo }) => photo.orientation === 'portrait',
  ).length;
  const mosaic = useMemo(
    () => buildPhotoMosaic(visibleCollageItems, collageFeatureSide),
    [collageFeatureSide, visibleCollageItems],
  );
  const fittedMosaic =
    mosaic === null
      ? { height: 0, rects: {}, width: 0 }
      : fitPhotoMosaicInBox(mosaic.root, collageSize.width, collageSize.height, collageSize.gap);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const media = window.matchMedia(COMPANION_LANDSCAPE_QUERY);
    const onChange = (event: MediaQueryListEvent) => setCompactLandscape(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (gallery === undefined || selected === null || gallery.photos.length < 2) return;
    const upcomingId = nextPhotoId(gallery.photos, selected.id);
    const upcoming = gallery.photos.find((photo) => photo.id === upcomingId);
    if (upcoming === undefined) return;
    const preload = new Image();
    preload.decoding = 'async';
    preload.src = upcoming.displayUrl;
    return () => {
      preload.src = '';
    };
  }, [gallery, selected]);

  useEffect(() => {
    if (
      prefersReducedMotion ||
      rotationPaused ||
      !pageVisible ||
      gallery === undefined ||
      gallery.photos.length < 2
    )
      return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      const upcomingId = nextPhotoId(
        gallery.photos,
        selectedId ?? gallery.featuredPhotoId ?? gallery.photos[0]?.id ?? null,
      );
      const activeElement = document.activeElement;
      pendingAutomaticFocusId.current =
        activeElement instanceof HTMLElement && collageRef.current?.contains(activeElement)
          ? (activeElement.dataset.focusId ?? `photos-thumb-${upcomingId}`)
          : null;
      setSelectedId(upcomingId);
    }, PHOTO_COLLAGE_ROTATION_MS);
    return () => window.clearTimeout(timer);
  }, [
    ambient,
    collageRef,
    gallery,
    manualSelectionRevision,
    pageVisible,
    prefersReducedMotion,
    rotationPaused,
    selectedId,
  ]);

  useLayoutEffect(() => {
    const requestedFocusId = pendingAutomaticFocusId.current;
    if (requestedFocusId === null) return;
    pendingAutomaticFocusId.current = null;
    if (!focusById(requestedFocusId, { scroll: false }) && selected !== null) {
      focusById(`photos-thumb-${selected.id}`, { scroll: false });
    }
  }, [selected]);

  useEffect(() => {
    if (!ambient) return;
    requestAnimationFrame(() => focusById('photos-exit-ambient'));
    const leaveAmbient = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      setAmbient(false);
    };
    window.addEventListener('keydown', leaveAmbient, true);
    return () => window.removeEventListener('keydown', leaveAmbient, true);
  }, [ambient]);

  useEffect(() => {
    if (wasAmbient.current && !ambient) {
      requestAnimationFrame(() => focusById('photos-start-ambient'));
    }
    wasAmbient.current = ambient;
  }, [ambient]);

  if (preparing || query.isPending) return <LoadingState />;
  if (gallery === undefined) return <FailureState onRetry={() => void query.refetch()} />;

  async function restoreDemo() {
    await hearthApi.resetDemo();
    await queryClient.invalidateQueries();
    navigate('/photos', { replace: true });
  }

  function selectPhoto(photoId: string) {
    setSelectedId(photoId);
    setManualSelectionRevision((current) => current + 1);
    requestAnimationFrame(() => focusById(`photos-thumb-${photoId}`));
  }

  function toggleRotation() {
    togglePhotoRotation();
    setManualSelectionRevision((current) => current + 1);
  }

  if (gallery.photos.length === 0) {
    return (
      <section className="state-panel photos-empty" aria-labelledby="photos-empty-title">
        <Icon name="image" />
        <h1 id="photos-empty-title">No family photos selected</h1>
        <p>Add photos in More → Manage photos.</p>
        {scenario === 'empty' ? (
          <button
            className="primary-action focusable"
            data-focus-id="photos-empty-restore"
            data-focus-left="nav-photos"
            onClick={() => void restoreDemo()}
            type="button"
          >
            Show demo photos
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <div className="screen photos-screen">
      <ScreenHeader
        title="Photos"
        meta={galleryMeta(
          gallery.collection.photoCount,
          favouriteCount ?? 0,
          gallery.collection.source.label,
        )}
        actions={
          <div className="photos-header-actions">
            {!prefersReducedMotion && gallery.photos.length > 1 ? (
              <button
                aria-label={
                  rotationPaused
                    ? 'Resume automatic photo rotation'
                    : 'Pause automatic photo rotation'
                }
                aria-pressed={rotationPaused}
                className="photos-rotation-action focusable"
                data-focus-down={`photos-thumb-${selected?.id ?? gallery.photos[0]?.id}`}
                data-focus-id="photos-toggle-rotation"
                data-focus-left="nav-photos"
                data-focus-right="photos-start-ambient"
                onClick={toggleRotation}
                type="button"
              >
                <Icon name={rotationPaused ? 'play' : 'pause'} />
                {rotationPaused ? 'Resume' : 'Pause'}
              </button>
            ) : null}
            <button
              className="photos-ambient-action focusable"
              data-focus-down={`photos-thumb-${selected?.id ?? gallery.photos[0]?.id}`}
              data-focus-id="photos-start-ambient"
              data-focus-left={
                !prefersReducedMotion && gallery.photos.length > 1
                  ? 'photos-toggle-rotation'
                  : 'nav-photos'
              }
              onClick={() => setAmbient(true)}
              type="button"
            >
              <Icon name="image" />
              Start ambient
            </button>
          </div>
        }
      />
      {!online ? <StatusBanner kind="offline">Offline · Showing saved photos.</StatusBanner> : null}
      {gallery.freshness === 'stale' && online ? (
        <StatusBanner kind={scenario === 'unavailable' ? 'unavailable' : 'stale'}>
          {gallery.statusMessage}
        </StatusBanner>
      ) : null}
      {!prefersReducedMotion && gallery.photos.length > 1 ? (
        <div className="photos-source-line">
          <span
            aria-label={`${gallery.collection.name}. ${gallery.collection.source.message} ${
              rotationPaused
                ? 'Automatic photo rotation paused.'
                : 'Photos change automatically every 45 seconds.'
            }`}
            className={`photos-rotation-note${rotationPaused ? ' photos-rotation-note--paused' : ''}`}
            role="status"
          >
            <Icon name="refresh" />
            <span
              aria-hidden="true"
              className="photos-rotation-progress"
              key={`${selected?.id ?? 'first'}-${manualSelectionRevision}`}
            >
              <span
                className="photos-rotation-progress__fill"
                style={
                  {
                    '--photo-rotation-duration': `${PHOTO_COLLAGE_ROTATION_MS}ms`,
                  } as CSSProperties
                }
              />
            </span>
          </span>
        </div>
      ) : null}
      <div className="photos-layout">
        <div
          aria-label="Family photos. The featured photo and collage arrangement change about once every 45 seconds."
          className={`photos-grid photos-collage photos-collage--${selected?.orientation ?? 'landscape'} photos-collage--feature-${collageFeatureSide} photos-collage--count-${visibleCollageItems.length} photos-collage--portrait-count-${visiblePortraitCount}`}
          ref={collageRef}
        >
          {mosaic === null ? null : (
            <PhotoMosaic
              focusRects={fittedMosaic.rects}
              items={visibleCollageItems}
              onSelect={selectPhoto}
              rootBox={fittedMosaic}
              selectedId={selected?.id ?? null}
            />
          )}
        </div>
      </div>
      {ambient && selected !== null ? (
        <div
          aria-label="Ambient family photo. Press any remote button to return."
          aria-modal="true"
          className="photo-ambient"
          role="dialog"
        >
          <PhotoAssetImage
            alt={selected.alt}
            className="photo-ambient__image"
            fetchPriority="high"
            loading="eager"
            src={selected.displayUrl}
          />
          <div className="photo-ambient__overlay">
            <strong>{householdTime}</strong>
            <span>Press any button to return</span>
          </div>
          <button
            aria-label="Exit ambient photos"
            className="photo-ambient__tap-target"
            data-back-dismiss="true"
            data-focus-id="photos-exit-ambient"
            onClick={() => setAmbient(false)}
            type="button"
          />
        </div>
      ) : null}
    </div>
  );
}

function galleryMeta(photoCount: number, favouriteCount: number, sourceLabel: string): string {
  const favourites = `${favouriteCount} ${favouriteCount === 1 ? 'favourite' : 'favourites'}`;
  if (favouriteCount === photoCount) return `${favourites} · ${sourceLabel}`;
  return `${favourites} · ${photoCount} in rotation · ${sourceLabel}`;
}

function PhotoThumbnail({
  focusRects,
  item,
  items,
  onSelect,
  rect,
  selected,
}: {
  focusRects: Readonly<Record<string, PhotoMosaicRect>>;
  item: PhotoCollageItem;
  items: PhotoCollageItem[];
  onSelect: () => void;
  rect: PhotoMosaicRect | undefined;
  selected: boolean;
}) {
  const { photo, slot } = item;
  const links = collageFocusLinks(photo.id, items, focusRects);
  const featured = slot === 'feature';
  return (
    <button
      aria-label={`Show photo: ${photo.alt}`}
      aria-pressed={selected}
      className={`photo-thumbnail photo-thumbnail--${photo.orientation} photo-collage__tile photo-collage__tile--${slot} focusable${featured ? ` photos-hero photos-hero--${photo.orientation}` : ''}${selected ? ' photo-thumbnail--selected' : ''}`}
      data-focus-entry={featured ? 'true' : undefined}
      data-focus-down={links.down}
      data-focus-id={`photos-thumb-${photo.id}`}
      data-focus-left={links.left}
      data-focus-right={links.right}
      data-focus-up={links.up}
      data-photo-id={photo.id}
      data-photo-orientation={photo.orientation}
      data-photo-ratio={(photo.width / photo.height).toFixed(4)}
      onClick={onSelect}
      style={
        {
          '--photo-native-ratio': photo.width / photo.height,
          '--photo-mosaic-height': `${(rect?.height ?? 0) * 100}%`,
          '--photo-mosaic-left': `${(rect?.x ?? 0) * 100}%`,
          '--photo-mosaic-top': `${(rect?.y ?? 0) * 100}%`,
          '--photo-mosaic-width': `${(rect?.width ?? 0) * 100}%`,
        } as CSSProperties
      }
      type="button"
    >
      <PhotoAssetImage
        alt={featured ? photo.alt : ''}
        className={
          featured ? 'photo-thumbnail__image photos-hero__image' : 'photo-thumbnail__image'
        }
        fetchPriority={featured ? 'high' : 'low'}
        height={photo.height}
        key={`${photo.id}-${slot}`}
        loading={featured ? 'eager' : 'lazy'}
        src={featured ? photo.displayUrl : photo.thumbnailUrl}
        width={photo.width}
      />
      <span className="sr-only">{photo.orientation} photo</span>
    </button>
  );
}

function collageFocusLinks(
  photoId: string,
  items: PhotoCollageItem[],
  rects: Readonly<Record<string, PhotoMosaicRect>>,
): { up: string; down: string; left: string; right: string } {
  const current = rects[photoId];
  const currentId = `photos-thumb-${photoId}`;
  if (current === undefined) {
    return { down: currentId, left: 'nav-photos', right: currentId, up: 'photos-start-ambient' };
  }
  const center = placementCenter(current);
  const candidates = items
    .filter((candidate) => candidate.photo.id !== photoId)
    .map((candidate, index) => ({
      center: placementCenter(rects[candidate.photo.id]),
      focusId: `photos-thumb-${candidate.photo.id}`,
      index,
      placement: rects[candidate.photo.id],
    }))
    .filter((candidate) => candidate.placement !== undefined)
    .map((candidate) => ({
      ...candidate,
      center: placementCenter(candidate.placement),
    }));

  function nearest(direction: 'up' | 'down' | 'left' | 'right'): string | null {
    const vertical = direction === 'up' || direction === 'down';
    return (
      candidates
        .filter((candidate) => {
          if (direction === 'up') {
            return candidate.center.y < center.y - 0.01;
          }
          if (direction === 'down') {
            return candidate.center.y > center.y + 0.01;
          }
          if (direction === 'left') {
            return candidate.center.x < center.x - 0.01;
          }
          return candidate.center.x > center.x + 0.01;
        })
        .map((candidate) => {
          const primary = vertical
            ? Math.abs(candidate.center.y - center.y)
            : Math.abs(candidate.center.x - center.x);
          const secondary = vertical
            ? Math.abs(candidate.center.x - center.x)
            : Math.abs(candidate.center.y - center.y);
          return { ...candidate, score: primary + secondary * 0.45 };
        })
        .sort((a, b) => a.score - b.score || a.index - b.index)[0]?.focusId ?? null
    );
  }

  return {
    up: current.height >= 0.8 ? 'photos-start-ambient' : (nearest('up') ?? 'photos-start-ambient'),
    down: nearest('down') ?? currentId,
    left: nearest('left') ?? 'nav-photos',
    right: nearest('right') ?? currentId,
  };
}

function placementCenter(placement: PhotoMosaicRect | undefined): { x: number; y: number } {
  if (placement === undefined) return { x: 0, y: 0 };
  return {
    x: placement.x + placement.width / 2,
    y: placement.y + placement.height / 2,
  };
}

function PhotoMosaic({
  focusRects,
  items,
  onSelect,
  rootBox,
  selectedId,
}: {
  focusRects: Readonly<Record<string, PhotoMosaicRect>>;
  items: PhotoCollageItem[];
  onSelect: (photoId: string) => void;
  rootBox: { height: number; width: number };
  selectedId: string | null;
}) {
  return (
    <div
      className="photo-mosaic-node photo-mosaic-node--root"
      style={{
        height: rootBox.height > 0 ? rootBox.height : undefined,
        width: rootBox.width > 0 ? rootBox.width : undefined,
      }}
    >
      {items.map((item) => (
        <PhotoThumbnail
          focusRects={focusRects}
          item={item}
          items={items}
          key={item.photo.id}
          onSelect={() => onSelect(item.photo.id)}
          rect={focusRects[item.photo.id]}
          selected={item.photo.id === selectedId}
        />
      ))}
    </div>
  );
}

function useElementSize<T extends HTMLElement>(
  active: boolean,
): [RefObject<T | null>, { gap: number; height: number; width: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ gap: 0, height: 0, width: 0 });

  useLayoutEffect(() => {
    if (!active) return;
    const element = ref.current;
    if (element === null) return;
    const update = () => {
      const height = element.clientHeight;
      const width = element.clientWidth;
      const gap = Number.parseFloat(
        window.getComputedStyle(element).getPropertyValue('--photo-collage-gap'),
      );
      const safeGap = Number.isFinite(gap) ? gap : 0;
      setSize((current) =>
        current.gap === safeGap && current.height === height && current.width === width
          ? current
          : { gap: safeGap, height, width },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [active]);

  return [ref, size];
}
