// Provisioning-workstation helper: private files only, no anonymous HTTP endpoint.
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import QRCode from 'qrcode';
import {
  assertPrivateStaging,
  privateHearthOrigin,
  readPrivateSetupProof,
} from './private-first-phone.mjs';

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
  const origin = privateHearthOrigin(values.get('--origin'));
  const keyPath = resolve(values.get('--key-file'));
  const outputPath = resolve(values.get('--output'));
  if (extname(outputPath).toLowerCase() !== '.png') throw new Error('PNG required');
  await assertPrivateStaging(outputPath);
  const secret = await readPrivateSetupProof(keyPath);
  const image = await QRCode.toBuffer(`${origin}/#setup-phone=${secret}`, {
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
