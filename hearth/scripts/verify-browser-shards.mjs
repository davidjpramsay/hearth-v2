import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));

function listTests(extraArgs = []) {
  const report = JSON.parse(
    execFileSync(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--config',
        'playwright.ci.config.ts',
        '--list',
        '--reporter=json',
        ...extraArgs,
      ],
      { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    ),
  );
  assert.deepEqual(report.errors, []);
  function collect(suite) {
    return [
      ...(suite.specs ?? []).flatMap((spec) =>
        spec.tests.map((entry) => ({
          id: `${spec.id}:${entry.projectName}`,
          title: spec.title,
        })),
      ),
      ...(suite.suites ?? []).flatMap(collect),
    ];
  }
  return collect(report);
}

const all = listTests();
assert.ok(all.length > 0);
const allIds = new Set(all.map((entry) => entry.id));
assert.equal(allIds.size, all.length, 'Test identities must be unique');
assert.equal(
  all.filter((entry) => entry.title.startsWith('Today composition ')).length,
  384,
  'Keep every photo/module/viewport combination',
);
const covered = new Set();
for (let shard = 1; shard <= 4; shard += 1) {
  const entries = listTests([`--shard=${shard}/4`]);
  assert.ok(entries.length > 0, `Shard ${shard} must not be empty`);
  for (const entry of entries) {
    assert.ok(allIds.has(entry.id), 'Shard must contain only known tests');
    assert.ok(!covered.has(entry.id), 'No test may run in two shards');
    covered.add(entry.id);
  }
  console.log(`Shard ${shard}/4: ${entries.length} tests`);
}
assert.deepEqual(covered, allIds, 'Shards must cover every test exactly once');
console.log(`Verified complete, non-overlapping coverage of ${all.length} browser tests.`);
