import { useQueryClient } from '@tanstack/react-query';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { DemoScenario } from '@hearth/shared';

import { hearthApi } from '../api/client';
import { Icon } from '../components/Icon';
import { PhotoAssetImage } from '../components/PhotoAssetImage';
import { ScreenHeader } from '../components/ScreenHeader';
import { FailureState, LoadingState, StatusBanner } from '../components/Status';
import { focusById } from '../focus/focusGraph';
import { usePhotosQuery } from '../hooks/useHearthQueries';
import { useHouseholdClock } from '../hooks/useHouseholdClock';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  arrangePhotoCollage,
  nextPhotoId,
  PHOTO_COLLAGE_ROTATION_MS,
  photoCollageMode,
  type PhotoCollageItem,
  type PhotoCollageSlot,
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
  const [rotationPaused, setRotationPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === 'visible');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [compactLandscape, setCompactLandscape] = useState(
    () => window.matchMedia('(max-width: 900px) and (orientation: landscape)').matches,
  );
  const wasAmbient = useRef(false);
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
  const collageMode =
    collageItems[0] === undefined ? 'landscape' : photoCollageMode(collageItems[0].photo);
  const visibleCollageItems = compactLandscape ? collageItems.slice(0, 3) : collageItems;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px) and (orientation: landscape)');
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
    if (
      prefersReducedMotion ||
      rotationPaused ||
      !pageVisible ||
      gallery === undefined ||
      gallery.photos.length < 2
    )
      return;
    const timer = window.setTimeout(() => {
      setSelectedId((current) =>
        nextPhotoId(
          gallery.photos,
          current ?? gallery.featuredPhotoId ?? gallery.photos[0]?.id ?? null,
        ),
      );
    }, PHOTO_COLLAGE_ROTATION_MS);
    return () => window.clearTimeout(timer);
  }, [
    ambient,
    gallery,
    manualSelectionRevision,
    pageVisible,
    prefersReducedMotion,
    rotationPaused,
    selectedId,
  ]);

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
    setRotationPaused((paused) => !paused);
    setManualSelectionRevision((current) => current + 1);
  }

  if (gallery.photos.length === 0) {
    return (
      <section className="state-panel photos-empty" aria-labelledby="photos-empty-title">
        <Icon name="image" />
        <h1 id="photos-empty-title">No family photos selected</h1>
        <p>
          Choose one approved album in companion administration. Hearth will never scan every
          personal folder by default.
        </p>
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
        eyebrow="Family photos"
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
      {!online ? (
        <StatusBanner kind="offline">You’re offline · Showing saved family photos.</StatusBanner>
      ) : null}
      {gallery.freshness === 'stale' && online ? (
        <StatusBanner kind={scenario === 'unavailable' ? 'unavailable' : 'stale'}>
          {gallery.statusMessage}
        </StatusBanner>
      ) : null}
      <div className="photos-source-line" role="status">
        <Icon name={gallery.collection.source.status === 'ready' ? 'shield' : 'warning'} />
        <strong>{gallery.collection.name}</strong>
        <span>·</span>
        <span>{gallery.collection.source.message}</span>
        {!prefersReducedMotion && gallery.photos.length > 1 ? (
          <span className="photos-rotation-note">
            <Icon name="refresh" />
            <span>
              {rotationPaused ? 'Automatic rotation paused' : 'Automatic · every 30 seconds'}
            </span>
            {!rotationPaused ? (
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
            ) : null}
          </span>
        ) : null}
      </div>
      <div className="photos-layout">
        <div
          aria-label="Family photos. The featured photo and collage arrangement change about once every 30 seconds."
          className={`photos-grid photos-collage photos-collage--${collageMode} photos-collage--count-${visibleCollageItems.length}`}
        >
          {visibleCollageItems.map((item) => (
            <PhotoThumbnail
              item={item}
              items={visibleCollageItems}
              key={item.slot}
              onSelect={() => selectPhoto(item.photo.id)}
              selected={item.photo.id === selected?.id}
            />
          ))}
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
  item,
  items,
  onSelect,
  selected,
}: {
  item: PhotoCollageItem;
  items: PhotoCollageItem[];
  onSelect: () => void;
  selected: boolean;
}) {
  const { photo, slot } = item;
  const links = collageFocusLinks(slot, items);
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
      onClick={onSelect}
      type="button"
    >
      <PhotoAssetImage
        alt={featured ? photo.alt : ''}
        className={
          featured ? 'photo-thumbnail__image photos-hero__image' : 'photo-thumbnail__image'
        }
        key={`${photo.id}-${slot}`}
        loading={featured ? 'eager' : 'lazy'}
        src={featured ? photo.displayUrl : photo.thumbnailUrl}
      />
      <span className="sr-only">{photo.orientation} photo</span>
    </button>
  );
}

function collageFocusLinks(
  slot: PhotoCollageSlot,
  items: PhotoCollageItem[],
): { up: string; down: string; left: string; right: string } {
  const bySlot = new Map(items.map((item) => [item.slot, `photos-thumb-${item.photo.id}`]));
  const feature = bySlot.get('feature') ?? 'photos-start-ambient';
  const support1 = bySlot.get('support-1') ?? feature;
  const support2 = bySlot.get('support-2') ?? support1;
  const support3 = bySlot.get('support-3') ?? support2;
  const support4 = bySlot.get('support-4') ?? support3;

  const links = {
    feature: { up: 'photos-start-ambient', down: feature, left: 'nav-photos', right: support1 },
    'support-1': {
      up: 'photos-start-ambient',
      down: support3,
      left: feature,
      right: support2,
    },
    'support-2': {
      up: 'photos-start-ambient',
      down: support4,
      left: support1,
      right: support2,
    },
    'support-3': { up: support1, down: support3, left: feature, right: support4 },
    'support-4': { up: support2, down: support4, left: support3, right: support4 },
  } satisfies Record<PhotoCollageSlot, { up: string; down: string; left: string; right: string }>;
  return links[slot];
}
