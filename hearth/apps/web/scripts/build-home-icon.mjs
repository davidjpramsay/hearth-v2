import { readFile, writeFile } from 'node:fs/promises';

import sharp from 'sharp';

// Compose the existing fern, never redraw it or change the shared transparent mark.
// iOS supplies the Home Screen corner mask; keep this PNG square and fully opaque.
const source = new URL('../public/brand/hearth-mark.png', import.meta.url);
const destination = new URL('../public/apple-touch-icon.png', import.meta.url);
const fern = await sharp(await readFile(source))
  .trim()
  .resize(140, 140, { fit: 'inside' })
  .png()
  .toBuffer();
const icon = await sharp({
  create: { width: 180, height: 180, channels: 3, background: '#f8f6f0' },
})
  .composite([{ input: fern, gravity: 'centre' }])
  .removeAlpha()
  .png()
  .toBuffer();

if (process.argv.includes('--check')) {
  if (!icon.equals(await readFile(destination))) {
    throw new Error('Home Screen icon differs from its canonical Hearth fern composition.');
  }
  process.stdout.write('Home Screen icon verified (180x180).\n');
} else {
  await writeFile(destination, icon);
  process.stdout.write('Home Screen icon generated (180x180).\n');
}
