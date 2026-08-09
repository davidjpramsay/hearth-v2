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
import { openHearthDatabase } from './database.js';
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
const householdId = demoMode
  ? DEMO_HOUSEHOLD_ID
  : ((
      database.prepare('SELECT id FROM households ORDER BY created_at LIMIT 1').get() as
        { id: string } | undefined
    )?.id ?? null);
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
  householdId === null ? undefined : database,
  { householdId: householdId ?? 'household_unconfigured', clock },
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

const server = buildServer({
  demoMode,
  runtime: { mode: runtimeMode, householdId, clock },
  adminRepository,
  planningRepository,
  repository,
  homeRepository,
  photoRepository,
  pocketMoneyRepository,
  calendarConnectionRepository,
});

try {
  await server.listen({ host, port });
} catch (error) {
  server.log.error(error);
  process.exitCode = 1;
}

function parseRuntimeMode(value: string): RuntimeMode {
  if (value === 'demo' || value === 'test' || value === 'private') return value;
  throw new Error('HEARTH_MODE must be demo, test or private.');
}
