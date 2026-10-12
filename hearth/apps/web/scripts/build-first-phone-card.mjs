// Provisioning-workstation helper: private files only, no anonymous HTTP endpoint.
import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import QRCode from 'qrcode';

const args = process.argv.slice(2);
const values = new Map();
for (let index = 0; index < args.length; index += 2) {
  if (
    !['--key-file', '--origin', '--output'].includes(args[index]) ||
    !args[index + 1] ||
    values.has(args[index])
  ) {
    console.error(
      'Usage: build-first-phone-card.mjs --key-file PRIVATE_FILE --origin TRUSTED_HTTPS_ORIGIN --output PRIVATE_PNG',
    );
    process.exit(1);
  }
  values.set(args[index], args[index + 1]);
}
try {
  if (values.size !== 3) throw new Error('Missing arguments');
  const origin = new URL(values.get('--origin'));
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/'
  )
    throw new Error('Invalid origin');
  const keyPath = resolve(values.get('--key-file'));
  const outputPath = resolve(values.get('--output'));
  if (extname(outputPath).toLowerCase() !== '.png') throw new Error('PNG required');
  const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  for (const path of [keyPath, outputPath]) {
    const parent = await realpath(dirname(path));
    const location = relative(workspace, parent);
    if (!location.startsWith('..') || location === '..')
      throw new Error('Private data cannot enter the workspace');
    const folder = await stat(parent);
    if ((folder.mode & 0o022) !== 0) throw new Error('Use a private non-writable staging folder');
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
  const input = await open(keyPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let secret;
  try {
    const info = await input.stat();
    if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o077) !== 0 || info.size > 512)
      throw new Error('Private regular input required');
    secret = (await input.readFile('utf8')).trim();
  } finally {
    await input.close();
  }
  if (!/^(?:[a-f0-9]{64}|[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])$/.test(secret))
    throw new Error('Invalid setup proof');
  const image = await QRCode.toBuffer(`${origin.origin}/#setup-phone=${secret}`, {
    type: 'png',
    width: 512,
    margin: 4,
    errorCorrectionLevel: 'M',
  });
  const output = await open(
    outputPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await output.writeFile(image);
  } finally {
    await output.close();
  }
  console.log('Private setup card created. Keep it private; it is for first setup only.');
} catch {
  // Never print a secret, URL, library error or private file contents.
  console.error(
    'Could not create the private setup card. Check the trusted origin, private input permissions and unused private PNG output.',
  );
  process.exitCode = 1;
}
