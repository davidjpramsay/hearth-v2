import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { DemoScenario, PhotoAsset } from '@hearth/shared';

import { hearthApi } from '../api/client';
import { Icon } from '../components/Icon';
import { PhotoAssetImage } from '../components/PhotoAssetImage';
import { ScreenHeader } from '../components/ScreenHeader';
import { FailureState, LoadingState, StatusBanner } from '../components/Status';
import { focusById } from '../focus/focusGraph';
import { usePhotosQuery } from '../hooks/useHearthQueries';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

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
  const [ambient, setAmbient] = useState(false);
  const wasAmbient = useRef(false);

  const gallery = query.data;
  const selected =
    gallery?.photos.find((photo) => photo.id === selectedId) ??
    gallery?.photos.find((photo) => photo.id === gallery.featuredPhotoId) ??
    gallery?.photos[0] ??
    null;

  useEffect(() => {
    if (!ambient || gallery === undefined || gallery.photos.length < 2) return;
    const timer = window.setInterval(() => {
      setSelectedId((current) => {
        const index = gallery.photos.findIndex((photo) => photo.id === current);
        return (
          gallery.photos[(index + 1 + gallery.photos.length) % gallery.photos.length]?.id ?? null
        );
      });
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [ambient, gallery]);

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
        meta={`${gallery.collection.photoCount} favourites · ${gallery.collection.source.label}`}
        actions={
          <button
            className="photos-ambient-action focusable"
            data-focus-down={`photos-thumb-${selected?.id ?? gallery.photos[0]?.id}`}
            data-focus-id="photos-start-ambient"
            data-focus-left="nav-photos"
            onClick={() => setAmbient(true)}
            type="button"
          >
            <Icon name="image" />
            Start ambient
          </button>
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
      </div>
      <div className="photos-layout">
        <figure className={`photos-hero photos-hero--${selected?.orientation ?? 'landscape'}`}>
          {selected === null ? null : (
            <PhotoAssetImage
              alt={selected.alt}
              className="photos-hero__image"
              key={selected.id}
              loading="eager"
              src={selected.displayUrl}
            />
          )}
        </figure>
        <div className="photos-grid" aria-label="Family favourites">
          {gallery.photos.map((photo, index, photos) => (
            <PhotoThumbnail
              index={index}
              key={photo.id}
              onSelect={() => setSelectedId(photo.id)}
              photo={photo}
              photos={photos}
              selected={photo.id === selected?.id}
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
            <strong>7:42</strong>
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

function PhotoThumbnail({
  index,
  onSelect,
  photo,
  photos,
  selected,
}: {
  index: number;
  onSelect: () => void;
  photo: PhotoAsset;
  photos: PhotoAsset[];
  selected: boolean;
}) {
  const column = index % 2;
  const up = index < 2 ? undefined : photos[index - 2];
  const down = photos[index + 2];
  const horizontal = photos[column === 0 ? index + 1 : index - 1];
  return (
    <button
      aria-label={`Show photo: ${photo.alt}`}
      aria-pressed={selected}
      className={`photo-thumbnail photo-thumbnail--${photo.orientation} focusable${selected ? ' photo-thumbnail--selected' : ''}`}
      data-focus-down={`photos-thumb-${down?.id ?? photo.id}`}
      data-focus-id={`photos-thumb-${photo.id}`}
      data-focus-left={column === 0 ? 'nav-photos' : `photos-thumb-${horizontal?.id ?? photo.id}`}
      data-focus-right={`photos-thumb-${column === 0 ? (horizontal?.id ?? photo.id) : photo.id}`}
      data-focus-up={up === undefined ? 'photos-start-ambient' : `photos-thumb-${up.id}`}
      onClick={onSelect}
      style={
        photo.orientation === 'portrait'
          ? { aspectRatio: `${photo.width} / ${photo.height}` }
          : undefined
      }
      type="button"
    >
      <PhotoAssetImage alt="" className="photo-thumbnail__image" src={photo.thumbnailUrl} />
      <span className="sr-only">{photo.orientation} photo</span>
    </button>
  );
}
