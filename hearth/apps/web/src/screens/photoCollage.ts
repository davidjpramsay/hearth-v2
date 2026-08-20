import type { PhotoAsset } from '@hearth/shared';

export const PHOTO_COLLAGE_ROTATION_MS = 45_000;
export const PHOTO_COLLAGE_SIZE = 5;

export type PhotoCollageMode = 'landscape' | 'portrait';
export type PhotoCollageFeatureSide = 'start' | 'end';
export type PhotoCollageSlot = 'feature' | 'support-1' | 'support-2' | 'support-3' | 'support-4';

export interface PhotoCollagePlacement {
  column: number;
  columnSpan: number;
  columns: number;
  row: number;
  rowSpan: number;
  rows: number;
}

export interface PhotoCollageItem {
  photo: PhotoAsset;
  placement: PhotoCollagePlacement;
  slot: PhotoCollageSlot;
}

type Placement = Omit<PhotoCollagePlacement, 'columns' | 'rows'>;

const SUPPORT_SLOTS: PhotoCollageSlot[] = ['support-1', 'support-2', 'support-3', 'support-4'];
const ROWS = 4;

export function photoCollageMode(photo: PhotoAsset): PhotoCollageMode {
  return photo.orientation === 'portrait' ? 'portrait' : 'landscape';
}

export function photoCollageFeatureSide(
  photos: PhotoAsset[],
  featuredId: string | null,
  rotationStartId: string | null,
): PhotoCollageFeatureSide {
  if (photos.length < PHOTO_COLLAGE_SIZE) return 'start';
  const featuredIndex = photos.findIndex((photo) => photo.id === featuredId);
  const startIndex = photos.findIndex((photo) => photo.id === rotationStartId);
  if (featuredIndex < 0 || startIndex < 0) return 'start';
  const rotationIndex = (featuredIndex - startIndex + photos.length) % photos.length;
  return rotationIndex % 2 === 1 ? 'end' : 'start';
}

export function nextPhotoId(photos: PhotoAsset[], currentId: string | null): string | null {
  if (photos.length === 0) return null;
  const currentIndex = photos.findIndex((photo) => photo.id === currentId);
  return photos[(currentIndex + 1 + photos.length) % photos.length]?.id ?? photos[0]?.id ?? null;
}

export function arrangePhotoCollage(
  photos: PhotoAsset[],
  selectedId: string | null,
): PhotoCollageItem[] {
  if (photos.length === 0) return [];

  const selectedIndex = Math.max(
    photos.findIndex((photo) => photo.id === selectedId),
    0,
  );
  const ordered = [...photos.slice(selectedIndex), ...photos.slice(0, selectedIndex)];
  const visible = selectBalancedPhotos(ordered);
  const placements = placementPlan(visible);

  return visible.map((photo, index) => ({
    photo,
    placement: placements[index] ?? fullPlacement(),
    slot: index === 0 ? 'feature' : (SUPPORT_SLOTS[index - 1] ?? 'support-4'),
  }));
}

export function mirroredPlacement(
  placement: PhotoCollagePlacement,
  featureSide: PhotoCollageFeatureSide,
): PhotoCollagePlacement {
  if (featureSide === 'start') return placement;
  return {
    ...placement,
    column: placement.columns - placement.column - placement.columnSpan + 2,
  };
}

function selectBalancedPhotos(ordered: PhotoAsset[]): PhotoAsset[] {
  const selected = ordered[0];
  if (selected === undefined) return [];

  const portraits = ordered.filter((photo) => photo.orientation === 'portrait');
  const wide = ordered.filter((photo) => photo.orientation !== 'portrait');
  if (wide.length === 0) return portraits.slice(0, Math.min(4, portraits.length));

  const portraitTarget = 2;
  const chosen: PhotoAsset[] = [selected];
  addUnique(chosen, portraits, portraitTarget - Number(selected.orientation === 'portrait'));
  addUnique(chosen, wide, PHOTO_COLLAGE_SIZE - chosen.length);

  // Do not fill remaining cells with extra portraits. Two honest portrait rails
  // plus wide bands are preferable to squeezing every available file into view.
  return chosen;
}

function addUnique(target: PhotoAsset[], source: PhotoAsset[], count: number): void {
  for (const photo of source) {
    if (count <= 0) return;
    if (target.some((candidate) => candidate.id === photo.id)) continue;
    target.push(photo);
    count -= 1;
  }
}

function placementPlan(photos: PhotoAsset[]): PhotoCollagePlacement[] {
  const portraitCount = photos.filter((photo) => photo.orientation === 'portrait').length;
  const portraitPlacements: Placement[] = [];
  const widePlacements: Placement[] = [];
  let columns = 12;

  if (photos.length === 1) {
    if (portraitCount === 1) {
      portraitPlacements.push({ column: 5, columnSpan: 4, row: 1, rowSpan: 4 });
    } else {
      widePlacements.push({ column: 1, columnSpan: 12, row: 1, rowSpan: 4 });
    }
  } else if (photos.length === 2) {
    if (portraitCount === 2) {
      portraitPlacements.push(
        { column: 2, columnSpan: 4, row: 1, rowSpan: 4 },
        { column: 8, columnSpan: 4, row: 1, rowSpan: 4 },
      );
    } else if (portraitCount === 1) {
      portraitPlacements.push({ column: 1, columnSpan: 4, row: 1, rowSpan: 4 });
      widePlacements.push({ column: 5, columnSpan: 8, row: 1, rowSpan: 4 });
    } else {
      widePlacements.push(
        { column: 1, columnSpan: 6, row: 1, rowSpan: 4 },
        { column: 7, columnSpan: 6, row: 1, rowSpan: 4 },
      );
    }
  } else if (photos.length === 3) {
    if (portraitCount === 3) {
      portraitPlacements.push(
        { column: 1, columnSpan: 4, row: 1, rowSpan: 4 },
        { column: 5, columnSpan: 4, row: 1, rowSpan: 4 },
        { column: 9, columnSpan: 4, row: 1, rowSpan: 4 },
      );
    } else if (portraitCount === 2) {
      columns = 16;
      portraitPlacements.push(
        { column: 1, columnSpan: 4, row: 1, rowSpan: 4 },
        { column: 13, columnSpan: 4, row: 1, rowSpan: 4 },
      );
      widePlacements.push({ column: 5, columnSpan: 8, row: 1, rowSpan: 4 });
    } else if (portraitCount === 1) {
      columns = 16;
      portraitPlacements.push({ column: 1, columnSpan: 4, row: 1, rowSpan: 4 });
      widePlacements.push(
        { column: 5, columnSpan: 12, row: 1, rowSpan: 2 },
        { column: 5, columnSpan: 12, row: 3, rowSpan: 2 },
      );
    } else {
      widePlacements.push(
        { column: 1, columnSpan: 8, row: 1, rowSpan: 4 },
        { column: 9, columnSpan: 4, row: 1, rowSpan: 2 },
        { column: 9, columnSpan: 4, row: 3, rowSpan: 2 },
      );
    }
  } else if (photos.length === 4) {
    if (portraitCount === 4) {
      portraitPlacements.push(
        { column: 1, columnSpan: 3, row: 1, rowSpan: 4 },
        { column: 4, columnSpan: 3, row: 1, rowSpan: 4 },
        { column: 7, columnSpan: 3, row: 1, rowSpan: 4 },
        { column: 10, columnSpan: 3, row: 1, rowSpan: 4 },
      );
    } else if (portraitCount === 2) {
      columns = 16;
      portraitPlacements.push(
        { column: 1, columnSpan: 4, row: 1, rowSpan: 4 },
        { column: 13, columnSpan: 4, row: 1, rowSpan: 4 },
      );
      widePlacements.push(
        { column: 5, columnSpan: 8, row: 1, rowSpan: 2 },
        { column: 5, columnSpan: 8, row: 3, rowSpan: 2 },
      );
    } else if (portraitCount === 1) {
      columns = 16;
      portraitPlacements.push({ column: 1, columnSpan: 4, row: 1, rowSpan: 4 });
      widePlacements.push(
        { column: 5, columnSpan: 12, row: 1, rowSpan: 2 },
        { column: 5, columnSpan: 6, row: 3, rowSpan: 2 },
        { column: 11, columnSpan: 6, row: 3, rowSpan: 2 },
      );
    } else {
      widePlacements.push(
        { column: 1, columnSpan: 6, row: 1, rowSpan: 2 },
        { column: 7, columnSpan: 6, row: 1, rowSpan: 2 },
        { column: 1, columnSpan: 6, row: 3, rowSpan: 2 },
        { column: 7, columnSpan: 6, row: 3, rowSpan: 2 },
      );
    }
  } else if (portraitCount === 2) {
    columns = 16;
    portraitPlacements.push(
      { column: 1, columnSpan: 4, row: 1, rowSpan: 4 },
      { column: 13, columnSpan: 4, row: 1, rowSpan: 4 },
    );
    widePlacements.push(
      { column: 5, columnSpan: 8, row: 1, rowSpan: 2 },
      { column: 5, columnSpan: 4, row: 3, rowSpan: 2 },
      { column: 9, columnSpan: 4, row: 3, rowSpan: 2 },
    );
  } else if (portraitCount === 1) {
    columns = 16;
    portraitPlacements.push({ column: 1, columnSpan: 4, row: 1, rowSpan: 4 });
    widePlacements.push(
      { column: 5, columnSpan: 6, row: 1, rowSpan: 2 },
      { column: 11, columnSpan: 6, row: 1, rowSpan: 2 },
      { column: 5, columnSpan: 6, row: 3, rowSpan: 2 },
      { column: 11, columnSpan: 6, row: 3, rowSpan: 2 },
    );
  } else {
    widePlacements.push(
      { column: 1, columnSpan: 6, row: 1, rowSpan: 4 },
      { column: 7, columnSpan: 3, row: 1, rowSpan: 2 },
      { column: 10, columnSpan: 3, row: 1, rowSpan: 2 },
      { column: 7, columnSpan: 3, row: 3, rowSpan: 2 },
      { column: 10, columnSpan: 3, row: 3, rowSpan: 2 },
    );
  }

  const portraitQueue = [...portraitPlacements];
  const wideQueue = [...widePlacements];
  return photos.map((photo) => {
    const placement = photo.orientation === 'portrait' ? portraitQueue.shift() : wideQueue.shift();
    return {
      ...(placement ?? fullPlacement()),
      columns,
      rows: ROWS,
    };
  });
}

function fullPlacement(): PhotoCollagePlacement {
  return { column: 1, columnSpan: 12, columns: 12, row: 1, rowSpan: 4, rows: ROWS };
}
