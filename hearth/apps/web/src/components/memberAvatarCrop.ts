export interface CropPosition {
  x: number;
  y: number;
}

export interface CropState {
  position: CropPosition;
  zoom: number;
}

export interface CropPoint {
  x: number;
  y: number;
}

export interface CropPreviewSize {
  height: number;
  width: number;
}

interface CropImageSize {
  naturalHeight: number;
  naturalWidth: number;
}

interface CropWindow {
  size: number;
  sourceX: number;
  sourceY: number;
}

export const MIN_CROP_ZOOM = 1;
export const MAX_CROP_ZOOM = 2.5;

export function normalizeCropState(state: CropState): CropState {
  return {
    position: {
      x: clamp(state.position.x, 0, 100),
      y: clamp(state.position.y, 0, 100),
    },
    zoom: clamp(state.zoom, MIN_CROP_ZOOM, MAX_CROP_ZOOM),
  };
}

export function panCropByPreviewDelta(
  image: CropImageSize,
  state: CropState,
  delta: CropPoint,
  preview: CropPreviewSize,
): CropState {
  const normalized = normalizeCropState(state);
  const window = cropWindow(image, normalized);
  const sourceX = window.sourceX - (delta.x / preview.width) * window.size;
  const sourceY = window.sourceY - (delta.y / preview.height) * window.size;
  return stateForSource(image, normalized.zoom, sourceX, sourceY);
}

export function zoomAndPanCrop(
  image: CropImageSize,
  state: CropState,
  nextZoom: number,
  anchor: CropPoint,
  target: CropPoint,
  preview: CropPreviewSize,
): CropState {
  const normalized = normalizeCropState(state);
  const startWindow = cropWindow(image, normalized);
  const anchorRatioX = clamp(anchor.x / preview.width, 0, 1);
  const anchorRatioY = clamp(anchor.y / preview.height, 0, 1);
  const targetRatioX = clamp(target.x / preview.width, 0, 1);
  const targetRatioY = clamp(target.y / preview.height, 0, 1);
  const imageAnchorX = startWindow.sourceX + anchorRatioX * startWindow.size;
  const imageAnchorY = startWindow.sourceY + anchorRatioY * startWindow.size;
  const zoom = clamp(nextZoom, MIN_CROP_ZOOM, MAX_CROP_ZOOM);
  const nextSize = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
  return stateForSource(
    image,
    zoom,
    imageAnchorX - targetRatioX * nextSize,
    imageAnchorY - targetRatioY * nextSize,
  );
}

export function drawSquareCrop(
  canvas: HTMLCanvasElement,
  image: Pick<HTMLImageElement, 'naturalHeight' | 'naturalWidth'> & CanvasImageSource,
  zoom: number,
  position: CropPosition,
): void {
  const context = canvas.getContext('2d');
  if (context === null) return;
  const window = cropWindow(image, normalizeCropState({ position, zoom }));
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    window.sourceX,
    window.sourceY,
    window.size,
    window.size,
    0,
    0,
    canvas.width,
    canvas.height,
  );
}

function cropWindow(image: CropImageSize, state: CropState): CropWindow {
  const size = Math.min(image.naturalWidth, image.naturalHeight) / state.zoom;
  return {
    size,
    sourceX: ((image.naturalWidth - size) * state.position.x) / 100,
    sourceY: ((image.naturalHeight - size) * state.position.y) / 100,
  };
}

function stateForSource(
  image: CropImageSize,
  zoom: number,
  sourceX: number,
  sourceY: number,
): CropState {
  const size = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
  const maxSourceX = image.naturalWidth - size;
  const maxSourceY = image.naturalHeight - size;
  return normalizeCropState({
    position: {
      x: maxSourceX === 0 ? 50 : (sourceX / maxSourceX) * 100,
      y: maxSourceY === 0 ? 50 : (sourceY / maxSourceY) * 100,
    },
    zoom,
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
