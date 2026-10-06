import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface UriParts {
  scheme?: string;
  host?: string;
  port?: string | number;
  path?: string;
  error?: string;
}
interface UriParser {
  parse(value: string): UriParts;
  serialize(value: UriParts): string;
  normalize(value: UriParts): string;
}

// Exercise both installed majors at their real dependency boundary, not a test-only copy.
const require = createRequire(import.meta.url);
const fastify = createRequire(require.resolve('fastify'));
describe('build/test source-map dependency', () => {
  it('uses the patched consumer and preserves ordinary source mappings', () => {
    const vitest = createRequire(require.resolve('vitest'));
    const vite = createRequire(vitest.resolve('vite'));
    const postcss = createRequire(vite.resolve('postcss'));
    const dependency = postcss('source-map-js/package.json') as { version: string };
    expect(dependency.version).toBe('1.2.2');
    const sourceMaps = postcss('source-map-js') as {
      SourceMapConsumer: new (map: {
        version: number;
        sources: string[];
        names: string[];
        mappings: string;
      }) => {
        originalPositionFor(position: { line: number; column: number }): {
          source: string;
          line: number;
          column: number;
        };
      };
    };
    const consumer = new sourceMaps.SourceMapConsumer({
      version: 3,
      sources: ['source.ts'],
      names: [],
      mappings: 'AAAA',
    });
    expect(consumer.originalPositionFor({ line: 1, column: 0 })).toMatchObject({
      source: 'source.ts',
      line: 1,
      column: 0,
    });
  });
});
for (const parent of ['@fastify/ajv-compiler', 'fast-json-stringify']) {
  const dependency = createRequire(fastify.resolve(parent));
  const uri = dependency('fast-uri') as UriParser;
  describe(`URI security regressions through ${parent}`, () => {
    it('rejects injected authority delimiters through serialization and normalization', () => {
      for (const port of ['@127.0.0.1:8124', '443/evil']) {
        const input = { scheme: 'https', host: 'trusted.example', port, path: '/app' };
        expect(() => uri.serialize(input)).toThrow();
        expect(() => uri.normalize(input)).toThrow();
      }
    });
    it('rejects malformed authority brackets and canonicalizes encoded host case', () => {
      const misleading = 'http://[@127.0.0.1/app';
      expect(uri.parse(misleading).host).toBe(new URL(misleading).hostname);
      expect(uri.parse('http://[example.com/app').error).toBeDefined();
      expect(uri.parse('//%41.com').host).toBe('a.com');
      expect(uri.parse('//%42.com').host).toBe('b.com');
    });
    it('preserves ordinary ports and valid IPv6 addresses', () => {
      expect(
        uri.serialize({ scheme: 'https', host: 'trusted.example', port: 8443, path: '/app' }),
      ).toBe('https://trusted.example:8443/app');
      expect(uri.parse('https://[::1]:8443/app').error).toBeUndefined();
    });
  });
}
