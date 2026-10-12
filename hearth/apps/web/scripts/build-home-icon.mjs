import { readFile, writeFile } from 'node:fs/promises';

import sharp from 'sharp';

// Compose the existing fern, never redraw it or change the shared transparent mark.
// iOS supplies the Home Screen corner mask; keep this PNG square and fully opaque.
const source = new URL('../public/brand/hearth-mark.png', import.meta.url);
const destination = new URL('../public/apple-touch-icon.png', import.meta.url);
const fernPng = await sharp(await readFile(source))
  .trim()
  .resize(140, 140, { fit: 'inside' })
  .png()
  .toBuffer();
const { data: fern, info } = await sharp(fernPng)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const size = 180;
const background = [248, 246, 240];
const pixels = Buffer.alloc(size * size * 3);
for (let offset = 0; offset < pixels.length; offset += 1) {
  pixels[offset] = background[offset % 3];
}
const left = Math.floor((size - info.width) / 2);
const top = Math.floor((size - info.height) / 2);
// Integer alpha blending avoids architecture-dependent floating-point truncation.
// Keep the existing fern size, centre placement and warm-cream background.
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
const icon = await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
  .png()
  .toBuffer();

if (process.argv.includes('--check')) {
  const stored = await readFile(destination);
  const metadata = await sharp(stored).metadata();
  const actualPixels = await sharp(stored).raw().toBuffer();
  // Compare the exact artwork, not PNG encoder/compression implementation details.
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
  process.stdout.write('Home Screen icon verified (180x180).\n');
} else {
  await writeFile(destination, icon);
  process.stdout.write('Home Screen icon generated (180x180).\n');
}
