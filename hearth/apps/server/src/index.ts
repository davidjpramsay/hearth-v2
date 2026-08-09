import { readFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { RuntimeMode } from '@hearth/shared';

import { SqliteAdminRepository } from './admin-repository.js';
import { buildServer } from './app.js';
import {
  CalendarConnectionService,
  CalDavCalendarConnectionVerifier,
  FakeCalendarConnectionVerifier,
  type CalendarCredentialStore,
} from './calendar-connection-repository.js';
import { CompanionAuthService, type CompanionAuthConfiguration } from './companion-auth.js';
import { LATEST_MIGRATION_VERSION, openHearthDatabase } from './database.js';
import {
  ManagedCalendarProvider,
  createCalendarRuntime,
  removeCalendarRuntimeConfig,
  resolveCalendarRuntime,
  writeCalendarRuntimeConfig,
} from './integrations/calendar-runtime.js';
import {
  FakeHomeAssistantProvider,
  UnconfiguredHomeAssistantProvider,
} from './integrations/home-assistant-provider.js';
import {
  FakePhotoSourceProvider,
  UnconfiguredPhotoSourceProvider,
} from './integrations/photo-source.js';
import { HomeService } from './home-repository.js';
import { PhotoService } from './photo-repository.js';
import { SqlitePlanningRepository } from './planning-repository.js';
import { PocketMoneyService } from './pocket-money-repository.js';
import { SqliteHearthRepository } from './sqlite-hearth-repository.js';
import { DEMO_HOUSEHOLD_ID, DEMO_NOW } from './demo/seed.js';
import { FixedClock, SystemClock } from './runtime-context.js';

const host = process.env.HEARTH_HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.HEARTH_PORT ?? '4310', 10);
const runtimeMode = parseRuntimeMode(process.env.HEARTH_MODE ?? 'demo');
const trustProxyHops = parseTrustProxyHops(process.env.HEARTH_TRUST_PROXY_HOPS);
const demoMode = runtimeMode !== 'private';
const databasePath =
  process.env.HEARTH_DATABASE_PATH ??
  fileURLToPath(
    new URL(
      runtimeMode === 'private'
        ? '../../../data/hearth-private.sqlite'
        : '../../../data/hearth-demo.sqlite',
      import.meta.url,
    ),
  );
const calendarConfigPath = process.env.HEARTH_CALENDAR_CONFIG_PATH;
const calendarRuntime = await resolveCalendarRuntime({ demoMode, configPath: calendarConfigPath });
const database = await openHearthDatabase(databasePath);
const adminRepository = new SqliteAdminRepository(database, { seedDemo: demoMode });
const privateHouseholdId = () =>
  (
    database.prepare('SELECT id FROM households ORDER BY created_at LIMIT 1').get() as
      { id: string } | undefined
  )?.id ?? null;
const runtimeHouseholdId = demoMode ? DEMO_HOUSEHOLD_ID : privateHouseholdId;
const clock = demoMode ? new FixedClock(DEMO_NOW) : new SystemClock();
const managedCalendarProvider = new ManagedCalendarProvider();
if (calendarRuntime !== null) managedCalendarProvider.configure(calendarRuntime);
const repository = new SqliteHearthRepository(
  database,
  demoMode
    ? {}
    : {
        calendarProvider: managedCalendarProvider,
        ownerForCalendarExternalId: managedCalendarProvider.ownerForCalendarExternalId,
        seedDemo: false,
        clock,
      },
);
const planningRepository = new SqlitePlanningRepository(database, { seedDemo: demoMode, clock });
const homeRepository = new HomeService(
  demoMode ? new FakeHomeAssistantProvider() : new UnconfiguredHomeAssistantProvider(),
  database,
  { householdId: runtimeHouseholdId, clock },
);
const photoRepository = new PhotoService(
  demoMode ? new FakePhotoSourceProvider() : new UnconfiguredPhotoSourceProvider(),
);
const pocketMoneyRepository = new PocketMoneyService(repository, adminRepository, database, {
  seedDemo: demoMode,
});
const calendarCredentialStore: CalendarCredentialStore | undefined = demoMode
  ? undefined
  : {
      save: async (config) => {
        if (calendarConfigPath === undefined) {
          throw new Error('HEARTH_CALENDAR_CONFIG_PATH is not configured.');
        }
        await writeCalendarRuntimeConfig(calendarConfigPath, config);
        managedCalendarProvider.configure(createCalendarRuntime(config));
      },
      remove: async () => {
        if (calendarConfigPath === undefined) return;
        await removeCalendarRuntimeConfig(calendarConfigPath);
        managedCalendarProvider.disconnect();
      },
    };
const calendarConnectionRepository = new CalendarConnectionService(
  adminRepository,
  demoMode ? new FakeCalendarConnectionVerifier() : new CalDavCalendarConnectionVerifier(),
  {
    database,
    ...(calendarCredentialStore === undefined ? {} : { credentialStore: calendarCredentialStore }),
  },
);
const companionAuthConfiguration = demoMode ? null : resolveCompanionAuthConfiguration();
const companionAuth =
  companionAuthConfiguration === null
    ? undefined
    : new CompanionAuthService(database, companionAuthConfiguration);

const server = buildServer({
  demoMode,
  runtime: { mode: runtimeMode, householdId: runtimeHouseholdId, clock },
  adminRepository,
  planningRepository,
  repository,
  homeRepository,
  photoRepository,
  pocketMoneyRepository,
  calendarConnectionRepository,
  ...(companionAuth === undefined ? {} : { companionAuth }),
  ...(trustProxyHops === undefined ? {} : { trustProxyHops }),
  readiness: () => {
    database.prepare('SELECT 1').get();
    const migration = database
      .prepare('SELECT MAX(version) AS version FROM schema_migrations')
      .get() as { version: number | null };
    if (migration.version !== LATEST_MIGRATION_VERSION) {
      throw new Error('Database migrations are incomplete.');
    }
  },
});

let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.log.info({ signal }, 'Stopping Hearth cleanly.');
    void server.close().catch((error: unknown) => {
      server.log.error(error, 'Hearth did not stop cleanly.');
      process.exitCode = 1;
    });
  });
}

try {
  await server.listen({ host, port });
} catch (error) {
  server.log.error(error);
  if (database.open) database.close();
  process.exitCode = 1;
}

function parseRuntimeMode(value: string): RuntimeMode {
  if (value === 'demo' || value === 'test' || value === 'private') return value;
  throw new Error('HEARTH_MODE must be demo, test or private.');
}

function parseTrustProxyHops(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 1 || hops > 5) {
    throw new Error('HEARTH_TRUST_PROXY_HOPS must be an integer from 1 to 5.');
  }
  return hops;
}

function resolveCompanionAuthConfiguration(): CompanionAuthConfiguration | null {
  const rpId = process.env.HEARTH_AUTH_RP_ID;
  const origin = process.env.HEARTH_AUTH_ORIGIN;
  const firstUseCodePath = process.env.HEARTH_FIRST_USE_CODE_PATH;
  if (rpId === undefined && origin === undefined && firstUseCodePath === undefined) return null;
  if (rpId === undefined || origin === undefined || firstUseCodePath === undefined) {
    throw new Error(
      'HEARTH_AUTH_RP_ID, HEARTH_AUTH_ORIGIN and HEARTH_FIRST_USE_CODE_PATH must be configured together.',
    );
  }
  if (!/^[a-z0-9.-]+$/i.test(rpId) || rpId.includes('..')) {
    throw new Error('HEARTH_AUTH_RP_ID must be a valid private hostname.');
  }
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error('HEARTH_AUTH_ORIGIN must be a valid HTTPS origin.');
  }
  if (
    parsedOrigin.protocol !== 'https:' ||
    parsedOrigin.hostname !== rpId ||
    parsedOrigin.pathname !== '/' ||
    parsedOrigin.search !== '' ||
    parsedOrigin.hash !== ''
  ) {
    throw new Error(
      'HEARTH_AUTH_ORIGIN must be an HTTPS origin whose hostname exactly matches HEARTH_AUTH_RP_ID.',
    );
  }
  return {
    mode: 'private',
    rpId,
    origin: parsedOrigin.origin,
    secureCookie: true,
    readFirstUseCode: () => readFile(firstUseCodePath, 'utf8'),
    consumeFirstUseCode: async () => {
      try {
        await unlink(firstUseCodePath);
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
    },
  };
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
