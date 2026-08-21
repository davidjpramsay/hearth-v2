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

export interface PhotoMosaicRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export type PhotoMosaicNode =
  | {
      item: PhotoCollageItem;
      kind: 'photo';
      ratio: number;
    }
  | {
      children: PhotoMosaicNode[];
      kind: 'column' | 'row';
      ratio: number;
    };

export interface PhotoMosaicLayout {
  rects: Readonly<Record<string, PhotoMosaicRect>>;
  root: PhotoMosaicNode;
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
  return ordered.slice(0, PHOTO_COLLAGE_SIZE);
}

export function buildPhotoMosaic(
  items: PhotoCollageItem[],
  featureSide: PhotoCollageFeatureSide,
  targetRatio = 2.55,
): PhotoMosaicLayout | null {
  const feature = items[0];
  if (feature === undefined) return null;

  const featureNode = photoNode(feature);
  const supportItems = items.slice(1);
  const supportColumns = bestSupportColumns(supportItems, featureNode.ratio, targetRatio);
  const children = [featureNode, ...supportColumns];
  if (featureSide === 'end') children.reverse();
  const root = rowNode(children);
  return { root, rects: mosaicRects(root) };
}

export function fitMosaicInBox(
  ratio: number,
  boxWidth: number,
  boxHeight: number,
): { height: number; width: number } {
  if (ratio <= 0 || boxWidth <= 0 || boxHeight <= 0) return { height: 0, width: 0 };
  const boxRatio = boxWidth / boxHeight;
  return boxRatio > ratio
    ? { height: boxHeight, width: boxHeight * ratio }
    : { height: boxWidth / ratio, width: boxWidth };
}

function bestSupportColumns(
  items: PhotoCollageItem[],
  featureRatio: number,
  targetRatio: number,
): PhotoMosaicNode[] {
  if (items.length === 0) return [];

  let best: { columns: PhotoMosaicNode[]; score: number } | null = null;
  const maxColumns = Math.min(items.length, 3);
  for (let columnCount = 1; columnCount <= maxColumns; columnCount += 1) {
    for (const groups of columnAssignments(items, columnCount)) {
      const columns = groups.map((group) => columnNode(group.map(photoNode)));
      const rootRatio = featureRatio + columns.reduce((sum, column) => sum + column.ratio, 0);
      const smallestColumn = Math.min(...columns.map((column) => column.ratio));
      const score =
        Math.abs(Math.log(rootRatio / targetRatio)) +
        Math.max(0, 0.34 - smallestColumn) * 0.75 +
        Math.abs(columnCount - 2) * 0.015;
      if (best === null || score < best.score) best = { columns, score };
    }
  }
  return best?.columns ?? [columnNode(items.map(photoNode))];
}

function columnAssignments(items: PhotoCollageItem[], columnCount: number): PhotoCollageItem[][][] {
  if (columnCount === 1) return [[items]];
  const results: PhotoCollageItem[][][] = [];
  const assignments = Array.from({ length: items.length }, () => 0);

  function visit(index: number) {
    if (index === items.length) {
      const groups = Array.from({ length: columnCount }, () => [] as PhotoCollageItem[]);
      assignments.forEach((column, itemIndex) => {
        const item = items[itemIndex];
        if (item !== undefined) groups[column]?.push(item);
      });
      if (groups.every((group) => group.length > 0)) results.push(groups);
      return;
    }
    for (let column = 0; column < columnCount; column += 1) {
      assignments[index] = column;
      visit(index + 1);
    }
  }

  visit(0);
  return results;
}

function photoNode(item: PhotoCollageItem): PhotoMosaicNode {
  return { item, kind: 'photo', ratio: photoRatio(item.photo) };
}

function rowNode(children: PhotoMosaicNode[]): PhotoMosaicNode {
  return {
    children,
    kind: 'row',
    ratio: children.reduce((sum, child) => sum + child.ratio, 0),
  };
}

function columnNode(children: PhotoMosaicNode[]): PhotoMosaicNode {
  const inverseRatio = children.reduce((sum, child) => sum + 1 / child.ratio, 0);
  return { children, kind: 'column', ratio: 1 / inverseRatio };
}

function photoRatio(photo: PhotoAsset): number {
  return photo.width / photo.height;
}

function mosaicRects(root: PhotoMosaicNode): Readonly<Record<string, PhotoMosaicRect>> {
  const rects: Record<string, PhotoMosaicRect> = {};
  visitNode(root, { height: 1, width: root.ratio, x: 0, y: 0 }, rects);
  for (const rect of Object.values(rects)) {
    rect.x /= root.ratio;
    rect.width /= root.ratio;
  }
  return rects;
}

function visitNode(
  node: PhotoMosaicNode,
  rect: PhotoMosaicRect,
  rects: Record<string, PhotoMosaicRect>,
): void {
  if (node.kind === 'photo') {
    rects[node.item.photo.id] = { ...rect };
    return;
  }

  if (node.kind === 'row') {
    let x = rect.x;
    for (const child of node.children) {
      const width = rect.height * child.ratio;
      visitNode(child, { height: rect.height, width, x, y: rect.y }, rects);
      x += width;
    }
    return;
  }

  let y = rect.y;
  for (const child of node.children) {
    const height = rect.width / child.ratio;
    visitNode(child, { height, width: rect.width, x: rect.x, y }, rects);
    y += height;
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
