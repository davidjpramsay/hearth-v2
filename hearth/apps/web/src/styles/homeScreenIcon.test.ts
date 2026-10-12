import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const iconPath = resolve(process.cwd(), 'public/apple-touch-icon.png');
const buildScript = resolve(process.cwd(), 'scripts/build-home-icon.mjs');

function checkCandidate(candidate: Buffer): string {
  const directory = mkdtempSync(join(tmpdir(), 'hearth-home-icon-'));
  try {
    mkdirSync(join(directory, 'scripts'));
    mkdirSync(join(directory, 'public/brand'), { recursive: true });
    symlinkSync(
      resolve(process.cwd(), '../../node_modules'),
      join(directory, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    copyFileSync(buildScript, join(directory, 'scripts/build-home-icon.mjs'));
    copyFileSync(
      resolve(process.cwd(), 'public/brand/hearth-mark.png'),
      join(directory, 'public/brand/hearth-mark.png'),
    );
    writeFileSync(join(directory, 'public/apple-touch-icon.png'), candidate);
    return execFileSync(
      process.execPath,
      [join(directory, 'scripts/build-home-icon.mjs'), '--check'],
      {
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

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

  it('matches the portable exact-pixel composition of the original shared fern artwork', () => {
    const output = execFileSync(process.execPath, [buildScript, '--check'], { encoding: 'utf8' });
    expect(output).toContain('Home Screen icon verified (180x180).');
  });

  it('accepts identical pixels encoded with different lossless PNG compression', async () => {
    const original = readFileSync(iconPath);
    const reencoded = await sharp(original)
      .png({ compressionLevel: 0, adaptiveFiltering: false })
      .toBuffer();
    expect(reencoded.equals(original)).toBe(false);
    expect(checkCandidate(reencoded)).toContain('Home Screen icon verified (180x180).');
  });

  it('rejects even a one-channel one-level pixel change', async () => {
    const { data, info } = await sharp(iconPath).raw().toBuffer({ resolveWithObject: true });
    const offset = (90 * info.width + 90) * info.channels;
    data[offset] = data[offset] === 255 ? 254 : data[offset]! + 1;
    const changed = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 3 },
    })
      .png()
      .toBuffer();
    expect(() => checkCandidate(changed)).toThrow(
      'Home Screen icon differs from its canonical Hearth fern composition.',
    );
  });

  it.each(['dimensions', 'alpha', 'format'] as const)(
    'rejects an icon with the wrong %s',
    async (variant) => {
      const image = sharp(iconPath);
      const invalid = await (
        variant === 'dimensions'
          ? image.resize(179, 180, { fit: 'fill' }).png()
          : variant === 'alpha'
            ? image.ensureAlpha().png()
            : image.webp({ lossless: true })
      ).toBuffer();
      expect(() => checkCandidate(invalid)).toThrow(
        'Home Screen icon differs from its canonical Hearth fern composition.',
      );
    },
  );

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
