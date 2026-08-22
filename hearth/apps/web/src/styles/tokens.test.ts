import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const runtimeTokens = new Set([
  '--chore-column-count',
  '--event-height',
  '--event-foreground-dark',
  '--event-top',
  '--member-colour',
  '--photo-collage-columns',
  '--photo-collage-rows',
  '--photo-mosaic-grow',
  '--photo-native-ratio',
  '--photo-rotation-duration',
  '--today-photo-ratio',
  '--today-preview-photo-ratio',
]);

describe('design tokens', () => {
  it('defines every non-runtime custom property used by the stylesheets', () => {
    const sourceRoot = resolve(process.cwd(), 'src');
    const stylesheets = collectCssFiles(sourceRoot).map((path) => readFileSync(path, 'utf8'));
    const defined = new Set(
      stylesheets.flatMap((css) =>
        [...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]!),
      ),
    );
    const used = new Set(
      stylesheets.flatMap((css) =>
        [...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((match) => match[1]!),
      ),
    );

    expect(
      [...used].filter((token) => !defined.has(token) && !runtimeTokens.has(token)).sort(),
    ).toEqual([]);
  });
});

function collectCssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectCssFiles(path);
    return extname(entry.name) === '.css' ? [path] : [];
  });
}
