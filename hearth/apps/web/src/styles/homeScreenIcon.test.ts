import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const iconPath = resolve(process.cwd(), 'public/apple-touch-icon.png');

describe('iPhone Home Screen icon', () => {
  it('declares a same-origin PNG Apple touch icon on the shared application document', () => {
    const page = new DOMParser().parseFromString(html, 'text/html');
    const icons = page.head.querySelectorAll('link[rel="apple-touch-icon"]');
    expect(icons).toHaveLength(1);
    expect(icons[0]?.getAttribute('sizes')).toBe('180x180');
    expect(icons[0]?.getAttribute('href')).toBe('/apple-touch-icon.png');
  });

  it('is a square opaque cream icon with the green fern visible', async () => {
    const metadata = await sharp(iconPath).metadata();
    expect(metadata).toMatchObject({ format: 'png', width: 180, height: 180, hasAlpha: false });
    const { data, info } = await sharp(iconPath).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);
    for (const pixel of [0, 179, 180 * 179, 180 * 180 - 1]) {
      expect([...data.subarray(pixel * 3, pixel * 3 + 3)]).toEqual([248, 246, 240]);
    }
    let greenPixels = 0;
    for (let offset = 0; offset < data.length; offset += 3) {
      if (data[offset + 1]! > data[offset]! + 20 && data[offset + 1]! > data[offset + 2]! + 10) {
        greenPixels += 1;
      }
    }
    expect(greenPixels).toBeGreaterThan(1500);
  });

  it('matches the deterministic composition of the original shared fern artwork', () => {
    const output = execFileSync(
      process.execPath,
      [resolve(process.cwd(), 'scripts/build-home-icon.mjs'), '--check'],
      { encoding: 'utf8' },
    );
    expect(output).toContain('Home Screen icon verified (180x180).');
  });

  it('preserves the favicon, external bootstrap, viewport and existing browser/session mode', () => {
    const page = new DOMParser().parseFromString(html, 'text/html');
    expect(page.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe(
      '/brand/hearth-mark.png',
    );
    expect(page.querySelector('meta[name="viewport"]')?.getAttribute('content')).toBe(
      'width=device-width, initial-scale=1.0, viewport-fit=cover',
    );
    expect(page.querySelector('script:not([type="module"])')?.getAttribute('src')).toBe(
      '/hearth-bootstrap.js',
    );
    expect(page.querySelector('meta[name="apple-mobile-web-app-capable"]')).toBeNull();
    expect(page.querySelector('link[rel="manifest"]')).toBeNull();
  });
});
