// Operator/local-display helper. It is not an appliance autostart or deployed network service.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createFirstPhoneScreen } from './first-phone-screen.mjs';

const args = process.argv.slice(2);
const values = new Map();
let screen;
try {
  for (let index = 0; index < args.length; index += 2) {
    if (
      !['--key-file', '--origin'].includes(args[index]) ||
      !args[index + 1] ||
      values.has(args[index])
    )
      throw new Error('Invalid arguments');
    values.set(args[index], args[index + 1]);
  }
  if (values.size !== 2) throw new Error('Missing arguments');
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : null;
  if (!opener) throw new Error('Local renderer unavailable');
  screen = await createFirstPhoneScreen({
    keyFile: values.get('--key-file'),
    origin: values.get('--origin'),
  });
  await promisify(execFile)(opener, [screen.url]);
  console.log('Private local setup screen opened. Keep it private. Press Control-C to close it.');
  const stop = async () => {
    await screen.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch {
  if (screen) await screen.close();
  // Never echo a proof, private URL/path, TLS error or subprocess output.
  console.error(
    'Could not open the private setup screen. Check the trusted HTTPS server, protected first-use file and local browser.',
  );
  process.exitCode = 1;
}
