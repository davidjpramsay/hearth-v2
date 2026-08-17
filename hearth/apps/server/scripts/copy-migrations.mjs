import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = new URL('../src/migrations/', import.meta.url);
const target = new URL('../dist/migrations/', import.meta.url);
const migrations = readdirSync(source).filter((name) => name.endsWith('.sql'));

if (migrations.length === 0) throw new Error('No SQL migrations were found for the server build.');

mkdirSync(target, { recursive: true });
for (const migration of migrations) {
  copyFileSync(new URL(migration, source), new URL(migration, target));
}

console.log(`Copied ${migrations.length} SQL migrations to ${fileURLToPath(target)}.`);
