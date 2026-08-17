import { readFile, writeFile } from 'node:fs/promises';

import type { Page, PageScreenshotOptions } from '@playwright/test';
import sharp from 'sharp';

const MAX_RASTER_NOISE_RATIO = 0.000_05;
const MAX_CHANNEL_NOISE = 2;

export async function captureEvidence(page: Page, options: PageScreenshotOptions): Promise<Buffer> {
  await waitForVisualAssets(page);
  const { path, ...captureOptions } = options;
  const candidate = await page.screenshot(captureOptions);
  if (path === undefined) return candidate;

  const existing = await readExisting(path);
  if (existing === null || (await materiallyDifferent(existing, candidate))) {
    await writeFile(path, candidate);
  }
  return candidate;
}

async function readExisting(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function materiallyDifferent(existing: Buffer, candidate: Buffer): Promise<boolean> {
  const [reference, next] = await Promise.all([decode(existing), decode(candidate)]);
  if (
    reference.info.width !== next.info.width ||
    reference.info.height !== next.info.height ||
    reference.info.channels !== next.info.channels
  ) {
    return true;
  }

  const pixels = reference.info.width * reference.info.height;
  const changedPixelLimit = Math.max(1, Math.floor(pixels * MAX_RASTER_NOISE_RATIO));
  const channels = reference.info.channels;
  let changedPixels = 0;
  for (let offset = 0; offset < reference.data.length; offset += channels) {
    for (let channel = 0; channel < channels; channel += 1) {
      const referenceChannel = reference.data[offset + channel];
      const nextChannel = next.data[offset + channel];
      if (
        referenceChannel !== undefined &&
        nextChannel !== undefined &&
        Math.abs(referenceChannel - nextChannel) > MAX_CHANNEL_NOISE
      ) {
        changedPixels += 1;
        break;
      }
    }
    if (changedPixels > changedPixelLimit) return true;
  }
  return false;
}

async function decode(input: Buffer) {
  return sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function waitForVisualAssets(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const styleId = 'hearth-stable-evidence-style';
    if (document.getElementById(styleId) === null) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        *, *::before, *::after {
          caret-color: transparent !important;
          transition: none !important;
        }
        .photos-rotation-progress__fill {
          animation: none !important;
          transform: scaleX(0.5) !important;
        }
      `;
      document.head.append(style);
    }
    await document.fonts.ready;
    const pendingImages = [...document.images].filter(
      (image) => image.currentSrc !== '' && !image.complete,
    );
    await Promise.all(
      pendingImages.map(
        (image) =>
          new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          }),
      ),
    );
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}
