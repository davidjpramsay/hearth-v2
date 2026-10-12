import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const runtimeTokens = new Set([
  '--chore-column-count',
  '--event-height',
  '--event-left',
  '--event-foreground-dark',
  '--event-top',
  '--event-width',
  '--member-colour',
  '--photo-collage-columns',
  '--photo-collage-rows',
  '--photo-mosaic-height',
  '--photo-mosaic-left',
  '--photo-mosaic-top',
  '--photo-mosaic-width',
  '--photo-native-ratio',
  '--photo-rotation-duration',
  '--today-photo-ratio',
  '--today-preview-photo-ratio',
]);

describe('design tokens', () => {
  it('keeps the settings Back control readable in automatic as well as explicit dark mode', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');
    const rule = css.match(/\.admin-back\s*\{([^}]+)\}/)?.[1];
    expect(rule).toContain('color: var(--ink)');
    expect(rule).toContain('background: var(--input-surface)');
    expect(rule).toContain('border: 1px solid var(--hairline)');
  });

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
