import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const resources = new URL('../app/src/main/res/', import.meta.url);
const read = (path) => readFile(new URL(path, resources), 'utf8');
const attribute = (xml, name) => xml.match(new RegExp(`android:${name}="([^"]+)"`))?.[1];
const pixels = (xml, name) => Number.parseFloat(attribute(xml, name) ?? '0') * 2;

// Raster renditions use the same native resources and original mark, not a second logo.
export async function launcherSvg(name) {
  const xml = await read(`drawable/${name}.xml`);
  const fern = await read('drawable/tv_launcher_fern.xml');
  const mark = await readFile(new URL('drawable-nodpi/hearth_mark.png', resources));
  const wordmark = await read('drawable/tv_wordmark.xml');
  const items = [...xml.matchAll(/<item\b([^>]*)(?:\/>|>([\s\S]*?)<\/item>)/g)];
  const width = pixels(items[0][1], 'width');
  const height = pixels(items[0][1], 'height');
  const background = attribute(items[0][2], 'color');
  const glyphs = wordmark.match(/android:pathData="([^"]+)"/)[1];
  const group = wordmark.match(/<group\b([^>]+)>/)[1];
  const transform = `translate(${attribute(group, 'translateX')} ${attribute(group, 'translateY')}) scale(${attribute(group, 'scaleX')} ${attribute(group, 'scaleY')})`;
  const layers = items.slice(1).map((item) => {
    const x = pixels(item[1], 'left');
    const y = pixels(item[1], 'top');
    const w = pixels(item[1], 'width');
    const h = pixels(item[1], 'height');
    if (attribute(item[1], 'drawable') === '@drawable/tv_launcher_fern') {
      return `<image x="${x}" y="${y}" width="${w}" height="${h}" href="data:image/png;base64,${mark.toString('base64')}" filter="url(#fern-tint)"/>`;
    }
    if (attribute(item[1], 'drawable') !== '@drawable/tv_wordmark') {
      throw new Error('Unexpected launcher layer');
    }
    return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 320 180"><g transform="${transform}"><path fill="${attribute(wordmark, 'fillColor')}" d="${glyphs}"/></g></svg>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><filter id="fern-tint" color-interpolation-filters="sRGB"><feFlood flood-color="${attribute(fern, 'tint')}"/><feComposite in2="SourceAlpha" operator="in"/></filter></defs><rect width="${width}" height="${height}" fill="${background}"/>${layers.join('')}</svg>`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const name of ['tv_banner', 'tv_icon']) {
    const rendered = sharp(Buffer.from(await launcherSvg(name)));
    const output = fileURLToPath(new URL(`drawable-xhdpi/${name}.png`, resources));
    if (process.argv.includes('--check')) {
      const expected = await rendered.ensureAlpha().raw().toBuffer();
      const committed = await sharp(output).ensureAlpha().raw().toBuffer();
      if (!expected.equals(committed)) throw new Error(`${name} bitmap is out of date`);
    } else {
      await rendered.png().toFile(output);
    }
  }
}
