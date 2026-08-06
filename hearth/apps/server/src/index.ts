import { fileURLToPath } from 'node:url';

import { SqliteAdminRepository } from './admin-repository.js';
import { buildServer } from './app.js';
import { openHearthDatabase } from './database.js';
import { resolveCalendarRuntime } from './integrations/calendar-runtime.js';
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
import { SqliteHearthRepository } from './sqlite-hearth-repository.js';

const host = process.env.HEARTH_HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.HEARTH_PORT ?? '4310', 10);
const demoMode = (process.env.HEARTH_MODE ?? 'demo') === 'demo';
const databasePath =
  process.env.HEARTH_DATABASE_PATH ??
  fileURLToPath(new URL('../../../data/hearth-demo.sqlite', import.meta.url));
const calendarConfigPath = process.env.HEARTH_CALENDAR_CONFIG_PATH;
const calendarRuntime = await resolveCalendarRuntime({ demoMode, configPath: calendarConfigPath });
const database = await openHearthDatabase(databasePath);
const adminRepository = new SqliteAdminRepository(database);
const repository = new SqliteHearthRepository(
  database,
  calendarRuntime === null
    ? {}
    : {
        calendarProvider: calendarRuntime.provider,
        ownerForCalendarExternalId: calendarRuntime.ownerForCalendarExternalId,
      },
);
const planningRepository = new SqlitePlanningRepository(database);
const homeRepository = new HomeService(
  demoMode ? new FakeHomeAssistantProvider() : new UnconfiguredHomeAssistantProvider(),
  database,
);
const photoRepository = new PhotoService(
  demoMode ? new FakePhotoSourceProvider() : new UnconfiguredPhotoSourceProvider(),
);

const server = buildServer({
  demoMode,
  adminRepository,
  planningRepository,
  repository,
  homeRepository,
  photoRepository,
});

try {
  await server.listen({ host, port });
} catch (error) {
  server.log.error(error);
  process.exitCode = 1;
}
