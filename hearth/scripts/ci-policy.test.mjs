import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import config from '../playwright.ci.config.ts';

const workflow = readFileSync(
  new URL('../../.github/workflows/verify.yml', import.meta.url),
  'utf8',
);

test('browser sharding keeps one worker and rejects accidentally focused tests', () => {
  assert.equal(config.fullyParallel, true);
  assert.equal(config.workers, 1);
  assert.equal(config.retries, 0);
  assert.equal(config.forbidOnly, true);
  assert.equal(config.maxFailures, 1);
});

test('built browser checks cannot attach to a development or private server', () => {
  assert.equal(config.webServer.length, 2);
  assert.ok(config.webServer.every((server) => server.reuseExistingServer === false));
  assert.equal(config.webServer[0].command, 'pnpm --filter @hearth/server start');
  assert.equal(config.webServer[0].env.HEARTH_MODE, 'demo');
  assert.equal(config.webServer[0].env.HEARTH_DATABASE_PATH, ':memory:');
  assert.equal(config.webServer[1].command, 'pnpm --filter @hearth/web preview');
});

test('publishing waits for code, every browser shard, Android and container builds', () => {
  const publish = workflow.split('\n  publish-synology-images:')[1];
  assert.ok(publish, 'Keep the separately permissioned publisher');
  assert.match(publish, /needs: \[web-and-server, browser, android-tv, synology-images\]/);
  assert.match(
    publish,
    /github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/,
  );
  assert.doesNotMatch(workflow, /continue-on-error:|pull_request_target:/);
  assert.match(workflow, /shard: \[1, 2, 3, 4\]/);
  assert.match(workflow, /pnpm test:e2e:built --shard=\$\{\{ matrix\.shard \}\}\/4/);
});

test('every external workflow action is pinned to an immutable commit', () => {
  const setup = readFileSync(
    new URL('../../.github/actions/setup-hearth/action.yml', import.meta.url),
    'utf8',
  );
  for (const match of `${workflow}\n${setup}`.matchAll(/uses:\s+([^\s#]+)/g)) {
    if (match[1].startsWith('./')) continue;
    assert.match(match[1], /^[\w-]+\/[\w/-]+@[a-f0-9]{40}$/);
  }
});
