import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

const folders: string[] = [];
const secret = 'a'.repeat(64);
const script = resolve(process.cwd(), 'scripts/build-first-phone-card.mjs');
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'hearth-private-card-test-'));
  folders.push(folder);
  const input = join(folder, 'fixture-key');
  const output = join(folder, 'fixture-card.png');
  writeFileSync(input, secret, { mode: 0o600 });
  return { folder, input, output };
}
function run(input: string, output: string, origin = 'https://hearth.example.test') {
  return spawnSync(
    process.execPath,
    [script, '--key-file', input, '--origin', origin, '--output', output],
    { encoding: 'utf8' },
  );
}
describe('private first-phone QR generator', () => {
  it('creates an owner-only PNG without printing the private proof or URL', async () => {
    const f = fixture();
    const result = run(f.input, f.output);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Private setup card created');
    expect(result.stdout + result.stderr).not.toContain(secret);
    expect(result.stdout + result.stderr).not.toContain('#setup-phone=');
    expect(statSync(f.output).mode & 0o077).toBe(0);
    const metadata = await sharp(f.output).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBeGreaterThanOrEqual(480);
    expect(metadata.width).toBeLessThanOrEqual(512);
    expect(metadata.height).toBe(metadata.width);
  });
  it('never overwrites an existing artifact', () => {
    const f = fixture();
    writeFileSync(f.output, 'keep fixture', { mode: 0o600 });
    expect(run(f.input, f.output).status).toBe(1);
    expect(readFileSync(f.output, 'utf8')).toBe('keep fixture');
  });
  it.each([
    'http://hearth.example.test',
    'https://user:password@hearth.example.test',
    'https://hearth.example.test/path',
    'https://hearth.example.test/?key=bad',
  ])('rejects unsafe origin %s', (origin) => {
    const f = fixture();
    const result = run(f.input, f.output, origin);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(secret);
  });
  it('rejects readable or symlinked input', () => {
    const f = fixture();
    chmodSync(f.input, 0o644);
    expect(run(f.input, f.output).status).toBe(1);
    chmodSync(f.input, 0o600);
    const link = join(f.folder, 'linked-key');
    symlinkSync(f.input, link);
    expect(run(link, f.output).status).toBe(1);
  });
  it('refuses output inside this checkout', () => {
    const f = fixture();
    const result = run(f.input, resolve(process.cwd(), 'public/fixture-private-card.png'));
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(secret);
  });
});
