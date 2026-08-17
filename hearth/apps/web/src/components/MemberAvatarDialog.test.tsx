import { describe, expect, it, vi } from 'vitest';

import {
  drawSquareCrop,
  normalizeCropState,
  panCropByPreviewDelta,
  zoomAndPanCrop,
} from './memberAvatarCrop';

describe('member avatar crop', () => {
  it('centres a landscape photo without stretching it', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const drawImage = vi.fn();
    Object.defineProperty(canvas, 'getContext', {
      value: () => ({ clearRect: vi.fn(), drawImage }),
    });
    const image = { naturalWidth: 1200, naturalHeight: 800 } as HTMLImageElement;

    drawSquareCrop(canvas, image, 1, { x: 50, y: 50 });

    expect(drawImage).toHaveBeenCalledWith(image, 200, 0, 800, 800, 0, 0, 512, 512);
  });

  it('positions a zoomed portrait photo within a square crop', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const drawImage = vi.fn();
    Object.defineProperty(canvas, 'getContext', {
      value: () => ({ clearRect: vi.fn(), drawImage }),
    });
    const image = { naturalWidth: 800, naturalHeight: 1200 } as HTMLImageElement;

    drawSquareCrop(canvas, image, 2, { x: 25, y: 75 });

    expect(drawImage).toHaveBeenCalledWith(image, 100, 600, 400, 400, 0, 0, 512, 512);
  });

  it('moves the image with a direct drag and keeps the crop inside its bounds', () => {
    const image = { naturalWidth: 1200, naturalHeight: 800 };
    const moved = panCropByPreviewDelta(
      image,
      { position: { x: 50, y: 50 }, zoom: 1 },
      { x: 64, y: -500 },
      { height: 320, width: 320 },
    );

    expect(moved).toEqual({ position: { x: 10, y: 50 }, zoom: 1 });
  });

  it('pinch-zooms around the gesture centre without changing the subject position', () => {
    const image = { naturalWidth: 800, naturalHeight: 1200 };
    const zoomed = zoomAndPanCrop(
      image,
      { position: { x: 50, y: 50 }, zoom: 1 },
      2,
      { x: 160, y: 160 },
      { x: 160, y: 160 },
      { height: 320, width: 320 },
    );

    expect(zoomed).toEqual({ position: { x: 50, y: 50 }, zoom: 2 });
  });

  it('combines pinch zoom and centroid movement as one natural gesture', () => {
    const image = { naturalWidth: 800, naturalHeight: 1200 };
    const zoomed = zoomAndPanCrop(
      image,
      { position: { x: 50, y: 50 }, zoom: 1 },
      2,
      { x: 160, y: 160 },
      { x: 200, y: 160 },
      { height: 320, width: 320 },
    );

    expect(zoomed).toEqual({ position: { x: 37.5, y: 50 }, zoom: 2 });
  });

  it('clamps wheel, keyboard and gesture adjustments to safe crop limits', () => {
    expect(normalizeCropState({ position: { x: -20, y: 140 }, zoom: 8 })).toEqual({
      position: { x: 0, y: 100 },
      zoom: 2.5,
    });
  });
});
