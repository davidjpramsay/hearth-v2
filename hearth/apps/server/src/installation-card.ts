import { constants } from 'node:fs';
import { open, lstat, link, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import QRCode from 'qrcode';

// Local container command only. Never imported by the HTTP application.
export async function createInstallationCard(originValue: string, keyPath: string, output: string) {
  const origin = new URL(originValue);
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new Error('Invalid origin');
  for (const path of [dirname(keyPath), dirname(output)]) {
    const parent = await lstat(path);
    if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077) !== 0)
      throw new Error('Private directory required');
  }
  const key = await open(keyPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let proof: string;
  try {
    const info = await key.stat();
    if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o077) !== 0 || info.size > 128)
      throw new Error('Invalid key');
    proof = (await key.readFile('utf8')).trim();
    if (!/^[a-f0-9]{64}$/.test(proof)) throw new Error('Invalid key');
  } finally {
    await key.close();
  }
  const png = await QRCode.toBuffer(`${origin.origin}/#setup-phone=${proof}`, {
    type: 'png',
    width: 640,
    margin: 4,
    errorCorrectionLevel: 'M',
  });
  const temporary = `${output}.${randomUUID()}.partial`;
  const file = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(png);
    await file.sync();
    // Publish only a complete image, atomically and without replacing an existing card.
    await link(temporary, output);
  } finally {
    await file.close();
    await unlink(temporary);
  }
}
