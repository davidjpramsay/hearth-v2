import { restoreHearthBackup, verifyHearthDatabaseFile } from './system-operations.js';

const [command, source, destination] = process.argv.slice(2);

try {
  if (command === 'verify' && source !== undefined && destination === undefined) {
    const result = await verifyHearthDatabaseFile(source);
    process.stdout.write(
      `Backup verified: migration ${result.migrationVersion}, ${result.sizeBytes} bytes.\n`,
    );
  } else if (command === 'restore' && source !== undefined && destination !== undefined) {
    const result = await restoreHearthBackup(source, destination);
    process.stdout.write(
      `Backup restored to a new test database: migration ${result.migrationVersion}, ${result.sizeBytes} bytes.\n`,
    );
  } else {
    process.stderr.write(
      'Usage: recovery-cli verify <absolute-backup-path> | restore <absolute-backup-path> <new-absolute-destination>\n',
    );
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Hearth recovery check failed.'}\n`,
  );
  process.exitCode = 1;
}
