import type { CSSProperties } from 'react';

import type { TodaySummary } from '@hearth/shared';

type TodayPhotoData = NonNullable<TodaySummary['photo']>;

const FALLBACK_RATIO = {
  landscape: 3 / 2,
  portrait: 2 / 3,
  square: 1,
} as const;

export function TodayPhoto({ photo }: { photo: TodayPhotoData }) {
  const ratio =
    photo.width === undefined || photo.height === undefined
      ? FALLBACK_RATIO[photo.orientation]
      : photo.width / photo.height;
  return (
    <figure
      className={`today-photo today-photo--${photo.orientation}`}
      data-photo-orientation={photo.orientation}
      data-photo-ratio={ratio.toFixed(4)}
      data-photo-url={photo.url}
      style={{ '--today-photo-ratio': ratio } as CSSProperties}
    >
      <img
        alt={photo.alt}
        className="today-photo__image"
        decoding="async"
        draggable="false"
        height={photo.height}
        src={photo.url}
        width={photo.width}
      />
    </figure>
  );
}
