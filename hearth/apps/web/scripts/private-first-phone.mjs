import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export function privateHearthOrigin(value) {
  const origin = new URL(value);
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/'
  )
    throw new Error('Trusted HTTPS origin required');
  return origin.origin;
}

export async function assertPrivateStaging(path) {
  const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const parent = await realpath(dirname(resolve(path)));
  const location = relative(workspace, parent);
  if (!location.startsWith(`..${sep}`)) throw new Error('Private data cannot enter the workspace');
  const folder = await stat(parent);
  if ((folder.mode & 0o022) !== 0) throw new Error('Private staging required');
  let inGit = false;
  try {
    inGit =
      execFileSync('git', ['-C', parent, 'rev-parse', '--is-inside-work-tree'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() === 'true';
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Git required to validate private staging');
  }
  if (inGit) throw new Error('Private data cannot enter a checkout');
}

export async function readPrivateSetupProof(path) {
  await assertPrivateStaging(path);
  const input = await open(resolve(path), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await input.stat();
    if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o077) !== 0 || info.size > 512)
      throw new Error('Private regular input required');
    const secret = (await input.readFile('utf8')).trim();
    if (!/^(?:[a-f0-9]{64}|[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])$/.test(secret))
      throw new Error('Invalid setup proof');
    return secret;
  } finally {
    await input.close();
  }
}
