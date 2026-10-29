import { mkdtemp, mkdir, readFile, stat, chmod, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createInstallationCard } from './installation-card.js';

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'hearth-card-'));
  folders.push(folder);
  const secret = join(folder, 'first-use-code');
  const card = join(folder, 'first-phone.png');
  await writeFile(secret, 'a'.repeat(64), { mode: 0o600 });
  return { folder, secret, card };
}
it('creates a private local PNG and never overwrites an existing card', async () => {
  const f = await fixture();
  await createInstallationCard('https://hearth.example.test', f.secret, f.card);
  expect((await readFile(f.card)).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect((await stat(f.card)).mode & 0o777).toBe(0o600);
  const accepted = await readFile(f.card);
  await writeFile(f.secret, 'b'.repeat(64), { mode: 0o600 });
  await expect(
    createInstallationCard('https://hearth.example.test', f.secret, f.card),
  ).rejects.toThrow();
  expect(await readFile(f.card)).toEqual(accepted);
});
it('rejects exposed inputs, symlinks, insecure URLs and credential URLs', async () => {
  const f = await fixture();
  await chmod(f.secret, 0o644);
  await expect(
    createInstallationCard('https://hearth.example.test', f.secret, f.card),
  ).rejects.toThrow();
  await chmod(f.secret, 0o600);
  const alias = join(f.folder, 'alias');
  await symlink(f.secret, alias);
  await expect(
    createInstallationCard('https://hearth.example.test', alias, f.card),
  ).rejects.toThrow();
  for (const origin of [
    'http://hearth.local',
    'https://user:secret@hearth.local',
    'https://hearth.local/path',
  ])
    await expect(createInstallationCard(origin, f.secret, f.card)).rejects.toThrow();
  const publicFolder = join(f.folder, 'public');
  await mkdir(publicFolder, { mode: 0o755 });
  await expect(
    createInstallationCard('https://hearth.local', f.secret, join(publicFolder, 'card.png')),
  ).rejects.toThrow();
});
