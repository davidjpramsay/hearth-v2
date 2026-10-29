import { mkdtemp, writeFile, mkdir, readFile, stat, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
const root = await mkdtemp(join(tmpdir(), 'hearth-fresh-private-'));
const secret = randomBytes(32).toString('hex');
await mkdir(join(root, 'secrets'), { mode: 0o700 });
await mkdir(join(root, 'data'), { mode: 0o700 });
const key = join(root, 'secrets/first-use-code');
await writeFile(key, secret, { mode: 0o600 });
const reserved = createServer();
await new Promise((resolve) => reserved.listen(0, '127.0.0.1', resolve));
const port = reserved.address().port;
await new Promise((resolve) => reserved.close(resolve));
const origin = 'https://hearth.fixture.test';
const app = fileURLToPath(new URL('../../../apps/server', import.meta.url));
const child = spawn(process.execPath, ['dist/index.js'], {
  cwd: app,
  env: {
    PATH: process.env.PATH,
    HEARTH_MODE: 'private',
    HEARTH_HOST: '127.0.0.1',
    HEARTH_PORT: String(port),
    HEARTH_VERSION: 'setup-fixture',
    HEARTH_DATABASE_PATH: join(root, 'data/hearth.sqlite'),
    HEARTH_AUTH_ORIGIN: origin,
    HEARTH_AUTH_RP_ID: 'hearth.fixture.test',
    HEARTH_FIRST_USE_CODE_PATH: key,
    HEARTH_CALENDAR_CONFIG_PATH: join(root, 'secrets/calendar.json'),
    HEARTH_HOME_ASSISTANT_CONFIG_PATH: join(root, 'secrets/home-assistant.json'),
    HEARTH_ESV_API_KEY_PATH: join(root, 'secrets/esv-api-key'),
    HEARTH_PHOTO_UPLOAD_DIR: join(root, 'data/uploads'),
    HEARTH_PHOTO_DERIVATIVE_DIR: join(root, 'data/derivatives'),
    HEARTH_BACKUP_DIR: join(root, 'data/backups'),
    HEARTH_BACKUP_INTERVAL_HOURS: '24',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stderr.resume();
child.stdout.resume();
const local = `http://127.0.0.1:${port}/api/v1`;
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const r = await fetch(local + '/readiness');
      if (r.ok) break;
    } catch {
      // The isolated server has not finished starting yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(child.exitCode, null, 'Fresh fixture backend stopped before readiness.');
  const runtime = await (await fetch(local + '/runtime')).json();
  assert.equal(runtime.requiresSetup, true);
  assert.equal(runtime.household, null);
  const { createInstallationCard } = await import(app + '/dist/installation-card.js');
  const card = join(root, 'data/first-phone.png');
  await createInstallationCard(origin, key, card);
  assert.equal((await stat(card)).mode & 0o777, 0o600);
  assert.equal((await readFile(card)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const claim = await fetch(local + '/auth/phones/owner-claims', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      'User-Agent': 'HearthCompanionTest',
    },
    body: JSON.stringify({
      ownerKey: secret,
      phoneName: 'Fixture phone',
      householdName: 'Fresh fixture home',
      adultName: 'Fixture adult',
      timezone: 'Australia/Perth',
    }),
  });
  assert.equal(claim.status, 200, 'Owner claim rejected');
  const cookie = claim.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  assert.ok(cookie);
  const session = await claim.json();
  assert.equal(session.authenticated, true);
  let keyRemains = true;
  try {
    await access(key);
  } catch {
    keyRemains = false;
  }
  assert.equal(keyRemains, false);
  const headers = { Cookie: cookie, 'User-Agent': 'HearthCompanionTest' };
  const household = local + '/households/' + session.householdId;
  const admin = await fetch(household + '/admin', { headers });
  assert.equal(
    admin.status,
    200,
    'Admin rejected; cookies: ' +
      claim.headers
        .getSetCookie()
        .map((value) => value.split('=')[0])
        .join(',') +
      '; error: ' +
      (admin.ok ? 'none' : (await admin.json()).error.code),
  );
  const data = await admin.json();
  assert.equal(data.household.members.length, 1);
  assert.equal(data.pairedDevices.length, 0);
  const ha = await fetch(household + '/home-assistant-connection', { headers });
  assert.equal(ha.status, 200);
  assert.equal(await ha.json(), null);
  const today = await fetch(household + '/today?date=' + runtime.localDate, { headers });
  assert.equal(today.status, 200);
  console.log('PASS: fresh private SQLite backend boots without HA or external credentials.');
  console.log(
    'PASS: local protected PNG created; first owner claims a new household and consumes setup proof.',
  );
  console.log(
    'PASS: authenticated admin and Today work, with one fixture adult, no paired screens and HA unconfigured.',
  );
  console.log(
    'Evidence is isolated local HTTP backend/QR proof, not trusted-HTTPS, Docker, physical phone or TV commissioning.',
  );
} finally {
  if (child.exitCode === null) {
    const stopped = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await stopped;
  }
  await rm(root, { recursive: true, force: true });
}
