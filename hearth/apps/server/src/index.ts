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
  FakeHomeAssistantConnectionVerifier,
  HomeAssistantConnectionService,
  RestHomeAssistantConnectionVerifier,
  type HomeAssistantCredentialStore,
} from './home-assistant-connection-repository.js';
import {
  ManagedCalendarProvider,
  createCalendarRuntime,
  readCalendarRuntimeConfig,
  removeCalendarRuntimeConfig,
  resolveCalendarRuntime,
  writeCalendarRuntimeConfig,
} from './integrations/calendar-runtime.js';
import { FakeHomeAssistantProvider } from './integrations/home-assistant-provider.js';
import {
  ManagedHomeAssistantProvider,
  createHomeAssistantProvider,
  removeHomeAssistantRuntimeConfig,
  resolveHomeAssistantProvider,
  writeHomeAssistantRuntimeConfig,
} from './integrations/home-assistant-runtime.js';
import { FakePhotoSourceProvider } from './integrations/photo-source.js';
import {
  EsvDailyVerseProvider,
  FakeDailyVerseProvider,
  UnconfiguredDailyVerseProvider,
} from './integrations/daily-verse-provider.js';
import {
  SynologyFolderPhotoSourceProvider,
  resolveSynologyPhotoSourceConfiguration,
} from './integrations/synology-photo-source.js';
import {
  ManagedWeatherProvider,
  resolveOpenMeteoWeatherConfiguration,
} from './integrations/weather-provider.js';
import { HomeService } from './home-repository.js';
import { PhotoService } from './photo-repository.js';
import { SqlitePlanningRepository } from './planning-repository.js';
import { PocketMoneyService } from './pocket-money-repository.js';
import { SqliteHearthRepository } from './sqlite-hearth-repository.js';
import { TodayContentService } from './today-content-repository.js';
import {
  FakeWeatherLocationVerifier,
  OpenMeteoWeatherLocationVerifier,
  WeatherLocationService,
  readStoredWeatherConfiguration,
} from './weather-location-repository.js';
import { DEMO_HOUSEHOLD_ID, DEMO_NOW } from './demo/seed.js';
import { FixedClock, SystemClock } from './runtime-context.js';
import {
  InMemorySystemOperations,
  SqliteSystemOperations,
  resolveSystemOperationsConfiguration,
  type SystemOperationsRepository,
} from './system-operations.js';

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
const homeAssistantConfigPath = process.env.HEARTH_HOME_ASSISTANT_CONFIG_PATH;
const homeAssistantRuntime = await resolveHomeAssistantProvider({
  demoMode,
  configPath: homeAssistantConfigPath,
});
const database = await openHearthDatabase(databasePath);
const esvApiKey = demoMode ? null : await readOptionalSecret(process.env.HEARTH_ESV_API_KEY_PATH);
const dailyVerseProvider = demoMode
  ? new FakeDailyVerseProvider()
  : esvApiKey === null
    ? new UnconfiguredDailyVerseProvider()
    : new EsvDailyVerseProvider(database, esvApiKey);
const clock = demoMode ? new FixedClock(DEMO_NOW) : new SystemClock();
const adminRepository = new SqliteAdminRepository(database, {
  seedDemo: demoMode,
  now: () => clock.now(),
});
const privateHouseholdId = () =>
  (
    database
      .prepare('SELECT id FROM households ORDER BY datetime(created_at), rowid LIMIT 1')
      .get() as { id: string } | undefined
  )?.id ?? null;
const runtimeHouseholdId = demoMode ? DEMO_HOUSEHOLD_ID : privateHouseholdId;
const systemOperationsConfiguration = resolveSystemOperationsConfiguration(process.env);
const managedCalendarProvider = new ManagedCalendarProvider();
if (calendarRuntime !== null) managedCalendarProvider.configure(calendarRuntime);
const managedHomeAssistantProvider = new ManagedHomeAssistantProvider();
if (homeAssistantRuntime !== null) managedHomeAssistantProvider.configure(homeAssistantRuntime);
const weatherFallback = demoMode ? null : resolveOpenMeteoWeatherConfiguration(process.env);
const storedWeatherConfiguration = demoMode
  ? null
  : readStoredWeatherConfiguration(database, privateHouseholdId());
const weatherProvider = new ManagedWeatherProvider();
const initialWeatherConfiguration = storedWeatherConfiguration ?? weatherFallback;
if (initialWeatherConfiguration !== null) weatherProvider.configure(initialWeatherConfiguration);
const repository = new SqliteHearthRepository(
  database,
  demoMode
    ? {}
    : {
        calendarProvider: managedCalendarProvider,
        ownerForCalendarExternalId: managedCalendarProvider.ownerForCalendarExternalId,
        weatherProvider,
        seedDemo: false,
        clock,
      },
);
const planningRepository = new SqlitePlanningRepository(database, { seedDemo: demoMode, clock });
const todayContentRepository = new TodayContentService(database, { seedDemo: demoMode, clock });
const weatherLocationRepository = new WeatherLocationService(
  adminRepository,
  demoMode ? new FakeWeatherLocationVerifier() : new OpenMeteoWeatherLocationVerifier(),
  {
    database,
    now: () => clock.now(),
    onSaved: (configuration) => weatherProvider.configure(configuration),
    ...(weatherFallback === null ? {} : { fallback: weatherFallback }),
  },
);
const homeRepository = new HomeService(
  demoMode ? new FakeHomeAssistantProvider() : managedHomeAssistantProvider,
  database,
  { householdId: runtimeHouseholdId, clock },
);
const photoConfiguration = demoMode ? null : resolveSynologyPhotoSourceConfiguration(process.env);
const photoProvider = demoMode
  ? new FakePhotoSourceProvider()
  : new SynologyFolderPhotoSourceProvider(database, photoConfiguration!, clock);
const photoRepository = new PhotoService(photoProvider, {
  adminRepository,
  database,
  clock,
});
const pocketMoneyRepository = new PocketMoneyService(repository, adminRepository, database, {
  seedDemo: demoMode,
  clock,
});
const systemOperations: SystemOperationsRepository = demoMode
  ? new InMemorySystemOperations(adminRepository, {
      version: systemOperationsConfiguration.version,
      mode: runtimeMode,
      clock,
      retentionCount: systemOperationsConfiguration.retentionCount,
    })
  : new SqliteSystemOperations(adminRepository, {
      database,
      mode: runtimeMode,
      clock,
      ...systemOperationsConfiguration,
    });
const calendarCredentialStore: CalendarCredentialStore | undefined = demoMode
  ? undefined
  : {
      load: async () => {
        if (calendarConfigPath === undefined) {
          throw new Error('HEARTH_CALENDAR_CONFIG_PATH is not configured.');
        }
        return readCalendarRuntimeConfig(calendarConfigPath);
      },
      save: async (config) => {
        if (calendarConfigPath === undefined) {
          throw new Error('HEARTH_CALENDAR_CONFIG_PATH is not configured.');
        }
        await writeCalendarRuntimeConfig(calendarConfigPath, config);
        managedCalendarProvider.configure(createCalendarRuntime(config));
      },
      updateMappings: async (calendars, householdTimezone) => {
        if (calendarConfigPath === undefined) {
          throw new Error('HEARTH_CALENDAR_CONFIG_PATH is not configured.');
        }
        const current = await readCalendarRuntimeConfig(calendarConfigPath);
        const updated = { ...current, calendars, householdTimezone };
        await writeCalendarRuntimeConfig(calendarConfigPath, updated);
        managedCalendarProvider.configure(createCalendarRuntime(updated));
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
const homeAssistantCredentialStore: HomeAssistantCredentialStore | undefined = demoMode
  ? undefined
  : {
      save: async (config) => {
        if (homeAssistantConfigPath === undefined) {
          throw new Error('HEARTH_HOME_ASSISTANT_CONFIG_PATH is not configured.');
        }
        await writeHomeAssistantRuntimeConfig(homeAssistantConfigPath, config);
        managedHomeAssistantProvider.configure(createHomeAssistantProvider(config));
      },
      remove: async () => {
        if (homeAssistantConfigPath === undefined) return;
        await removeHomeAssistantRuntimeConfig(homeAssistantConfigPath);
        managedHomeAssistantProvider.disconnect();
      },
    };
const homeAssistantConnectionRepository = new HomeAssistantConnectionService(
  adminRepository,
  demoMode ? new FakeHomeAssistantConnectionVerifier() : new RestHomeAssistantConnectionVerifier(),
  {
    database,
    now: () => clock.now(),
    ...(homeAssistantCredentialStore === undefined
      ? {}
      : { credentialStore: homeAssistantCredentialStore }),
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
  todayContentRepository,
  dailyVerseProvider,
  weatherLocationRepository,
  repository,
  homeRepository,
  photoRepository,
  pocketMoneyRepository,
  calendarConnectionRepository,
  homeAssistantConnectionRepository,
  systemOperations,
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
  if (systemOperations instanceof SqliteSystemOperations) {
    systemOperations.startScheduler(privateHouseholdId);
  }
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

async function readOptionalSecret(path: string | undefined): Promise<string | null> {
  if (path === undefined || path.trim() === '') return null;
  try {
    const value = (await readFile(path, 'utf8')).trim();
    return value === '' ? null : value;
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}
