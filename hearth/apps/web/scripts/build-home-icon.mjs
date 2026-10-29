import { readFile, writeFile } from 'node:fs/promises';

import sharp from 'sharp';

// Compose the existing fern, never redraw it or change the shared transparent mark.
// The operating system supplies the corner mask; keep each PNG square and opaque.
const source = await readFile(new URL('../public/brand/hearth-mark.png', import.meta.url));
const renditions = [
  { size: 180, path: '../public/apple-touch-icon.png' },
  { size: 192, path: '../public/hearth-icon-192.png' },
  { size: 512, path: '../public/hearth-icon-512.png' },
];
const background = [248, 246, 240];

for (const { size, path } of renditions) {
  const destination = new URL(path, import.meta.url);
  // Keep the original 180px icon pixel-identical and the same proportions elsewhere.
  const fernSize = Math.round((size * 140) / 180);
  const fernPng = await sharp(source)
    .trim()
    .resize(fernSize, fernSize, { fit: 'inside' })
    .png()
    .toBuffer();
  const { data: fern, info } = await sharp(fernPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = Buffer.alloc(size * size * 3);
  for (let offset = 0; offset < pixels.length; offset += 1) {
    pixels[offset] = background[offset % 3];
  }
  const left = Math.floor((size - info.width) / 2);
  const top = Math.floor((size - info.height) / 2);
  // Integer alpha blending avoids architecture-dependent floating-point truncation.
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const input = (y * info.width + x) * 4;
      const output = ((y + top) * size + x + left) * 3;
      const alpha = fern[input + 3];
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[output + channel] = Math.floor(
          (fern[input + channel] * alpha + background[channel] * (255 - alpha)) / 255,
        );
      }
    }
  }

  if (process.argv.includes('--check')) {
    const stored = await readFile(destination);
    const metadata = await sharp(stored).metadata();
    const actualPixels = await sharp(stored).raw().toBuffer();
    // Compare exact artwork, not PNG encoder/compression implementation details.
    if (
      metadata.format !== 'png' ||
      metadata.width !== size ||
      metadata.height !== size ||
      metadata.channels !== 3 ||
      metadata.hasAlpha ||
      metadata.depth !== 'uchar' ||
      !pixels.equals(actualPixels)
    ) {
      throw new Error('Home Screen icon differs from its canonical Hearth fern composition.');
    }
    process.stdout.write(`Home Screen icon verified (${size}x${size}).\n`);
  } else {
    const icon = await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
      .png()
      .toBuffer();
    await writeFile(destination, icon);
    process.stdout.write(`Home Screen icon generated (${size}x${size}).\n`);
  }
}
