import type { TodaySummary } from '@hearth/shared';

type TodayPhotoData = NonNullable<TodaySummary['photo']>;

export function TodayPhoto({ photo }: { photo: TodayPhotoData }) {
  return (
    <figure className="today-photo">
      <img
        alt={photo.alt}
        className="today-photo__image"
        decoding="async"
        draggable="false"
        src={photo.url}
      />
    </figure>
  );
}
