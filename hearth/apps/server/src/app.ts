import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { z } from 'zod';

import {
  HomeDomainError,
  PlanningDomainError,
  buildAssistDaySummary,
  resolveAssistChore,
  resolveHouseholdListTarget,
} from '@hearth/core';

import {
  AddListItemRequestSchema,
  AdditionalPasskeyOptionsRequestSchema,
  ActivityFeedSchema,
  AdminOverviewSchema,
  AdultAccessSummarySchema,
  ApiErrorSchema,
  AssistAddListItemRequestSchema,
  AssistChoreCompletionRequestSchema,
  AssistChoreCompletionResultSchema,
  AssistDaySummaryRequestSchema,
  AssistDaySummaryResultSchema,
  ApprovePairingRequestSchema,
  ArchiveMemberRequestSchema,
  ArchiveHouseholdNoticeRequestSchema,
  CalendarConnectionCommandResultSchema,
  CalendarConnectionSettingsSchema,
  CalendarConnectionTestRequestSchema,
  CalendarConnectionTestResultSchema,
  ChoreCommandResultSchema,
  ChoreExceptionRequestSchema,
  ChoreListSchema,
  ChoreOccurrenceChangeResultSchema,
  ChoreOccurrenceDetailSchema,
  ChoreReassignmentRequestSchema,
  ChoreSkipResultSchema,
  ChoreTemplateCommandResultSchema,
  ChoreTemplateListSchema,
  ChoreTemplateOrderCommandResultSchema,
  CommandRequestSchema,
  CompletionReversalRequestSchema,
  CopyMealPlanWeekRequestSchema,
  CreateMemberRequestSchema,
  CreateHouseholdNoticeRequestSchema,
  CreatePairingRequestSchema,
  CreateReminderRequestSchema,
  CreateTvPairingSessionRequestSchema,
  CreateChoreTemplateRequestSchema,
  CreateHouseholdListRequestSchema,
  CreateSavedMealRequestSchema,
  DeleteReminderRequestSchema,
  DeleteManagedPhotoRequestSchema,
  DemoScenarioRequestSchema,
  ExecuteHomeActionRequestSchema,
  ExchangeTvPairingRequestSchema,
  FirstUsePasskeyOptionsRequestSchema,
  HouseholdListsSchema,
  HouseholdListSettingsSchema,
  type HearthReminder,
  HomeActionIdSchema,
  HomeActionResultSchema,
  HomeAssistantConnectionCommandResultSchema,
  HomeAssistantConnectionSettingsSchema,
  HomeAssistantConnectionTestRequestSchema,
  HomeAssistantConnectionTestResultSchema,
  HomeStatusSchema,
  ListItemCommandResultSchema,
  ListSettingsCommandResultSchema,
  LocalDateSchema,
  ClearMealPlanWeekRequestSchema,
  MealCommandResultSchema,
  MealPlanSchema,
  MealPlanWeekCommandResultSchema,
  MemberAvatarCommandResultSchema,
  type Member,
  MemberSchema,
  MonthKeySchema,
  MonthScheduleSchema,
  OpaqueIdSchema,
  PairedDeviceSchema,
  PairingRequestSchema,
  PasskeyAuthStatusSchema,
  PasskeyCeremonyOptionsSchema,
  PasskeyCeremonyVerificationRequestSchema,
  PasskeyRegistrationResultSchema,
  PasskeyRevocationResultSchema,
  PasskeySessionSchema,
  PasskeySignOutResultSchema,
  PhotoCurationCommandResultSchema,
  PhotoDeletionCommandResultSchema,
  PhotoGallerySchema,
  PhotoSourceIndexStatusSchema,
  PhotoSourceRefreshResultSchema,
  PhotoUploadResultSchema,
  RefreshPhotoSourceRequestSchema,
  ReminderOverviewSchema,
  ReminderCommandResultSchema,
  ReminderDeletionResultSchema,
  RestoreChoreTemplateRequestSchema,
  ReorderHouseholdListsRequestSchema,
  ReorderChoreTemplatesRequestSchema,
  ReorderListItemsRequestSchema,
  PocketMoneyOverviewSchema,
  PocketMoneyPaymentCommandResultSchema,
  PocketMoneyPaymentVoidCommandResultSchema,
  PocketMoneySettingsCommandResultSchema,
  RealtimeEventSchema,
  RecoveryCodeConfirmationRequestSchema,
  RecoveryCodeRevealSchema,
  RecoveryPasskeyOptionsRequestSchema,
  RecordPocketMoneyPaymentRequestSchema,
  RemoveCalendarConnectionRequestSchema,
  RemoveHomeAssistantConnectionRequestSchema,
  ResetMemberAvatarRequestSchema,
  RevokeDeviceRequestSchema,
  RevokePasskeyRequestSchema,
  RuntimeContextSchema,
  SavedMealCommandResultSchema,
  SavedMealLibrarySchema,
  SaveCalendarConnectionRequestSchema,
  SaveHomeAssistantConnectionRequestSchema,
  SetReminderCompletionRequestSchema,
  SystemBackupCommandResultSchema,
  SystemStatusSchema,
  TodaySummarySchema,
  TimestampSchema,
  TodayConfigurationCommandResultSchema,
  TodayConfigurationSchema,
  TvDeviceSessionSchema,
  TvPairingSessionSchema,
  UpdateHouseholdRequestSchema,
  UpdateCalendarMappingsRequestSchema,
  UpdateHouseholdNoticeRequestSchema,
  UpdateChoreTemplateRequestSchema,
  UpdateHouseholdListRequestSchema,
  UpdateListItemRequestSchema,
  UpdateMemberRequestSchema,
  UpdateMemberAvatarRequestSchema,
  UpdateMealPlanWeekRequestSchema,
  UpdatePhotoCurationRequestSchema,
  UpdatePocketMoneySettingsRequestSchema,
  UpdateReminderRequestSchema,
  UpdateSavedMealRequestSchema,
  UpdateTodaySectionsRequestSchema,
  VoidPocketMoneyPaymentRequestSchema,
  WeekScheduleSchema,
  WeatherForecastSchema,
  WeatherLocationCommandResultSchema,
  WeatherLocationSchema,
  WeatherLocationSearchRequestSchema,
  WeatherLocationSearchResultsSchema,
  WeatherLocationTestRequestSchema,
  WeatherLocationTestResultSchema,
  SaveWeatherLocationRequestSchema,
  UpsertMealPlanRequestSchema,
} from '@hearth/shared';

import {
  DEMO_ADMIN_ACTOR_ID,
  InMemoryAdminRepository,
  credentialHash,
  type AdminRepository,
} from './admin-repository.js';
import {
  CalendarConnectionService,
  FakeCalendarConnectionVerifier,
  type CalendarConnectionRepository,
} from './calendar-connection-repository.js';
import { HEARTH_COMPANION_COOKIE, type CompanionAuthRepository } from './companion-auth.js';
import {
  FakeHomeAssistantConnectionVerifier,
  HomeAssistantConnectionService,
  type HomeAssistantConnectionRepository,
} from './home-assistant-connection-repository.js';
import { RealtimeHub } from './realtime.js';
import { HomeService, type HomeRepository } from './home-repository.js';
import { UnconfiguredHomeAssistantProvider } from './integrations/home-assistant-provider.js';
import {
  FakeDailyVerseProvider,
  UnconfiguredDailyVerseProvider,
  type DailyVerseProvider,
} from './integrations/daily-verse-provider.js';
import { UnconfiguredPhotoSourceProvider } from './integrations/photo-source.js';
import { MAX_MANAGED_PHOTO_BYTES } from './integrations/synology-photo-source.js';
import { PhotoService, type PhotoRepository } from './photo-repository.js';
import { InMemoryPlanningRepository, type PlanningRepository } from './planning-repository.js';
import { PocketMoneyService, type PocketMoneyRepository } from './pocket-money-repository.js';
import { ReminderService, type ReminderRepository } from './reminder-repository.js';
import { TodayContentService, type TodayContentRepository } from './today-content-repository.js';
import {
  FakeWeatherLocationVerifier,
  WeatherLocationService,
  type WeatherLocationRepository,
} from './weather-location-repository.js';
import { InMemorySystemOperations, type SystemOperationsRepository } from './system-operations.js';
import { DEMO_HOUSEHOLD_ID, DEMO_NOW } from './demo/seed.js';
import {
  DEMO_TV_ACTOR,
  InMemoryHearthRepository,
  RepositoryError,
  type CommandActor,
  type HearthRepository,
} from './repository.js';
import {
  FixedClock,
  SystemClock,
  resolveRuntimeContext,
  type RuntimeConfiguration,
} from './runtime-context.js';

const HouseholdParamsSchema = z.object({ householdId: OpaqueIdSchema });
const ChoreParamsSchema = HouseholdParamsSchema.extend({ occurrenceId: OpaqueIdSchema });
const HomeActionParamsSchema = HouseholdParamsSchema.extend({ actionId: HomeActionIdSchema });
const MemberParamsSchema = HouseholdParamsSchema.extend({ memberId: OpaqueIdSchema });
const DeviceParamsSchema = HouseholdParamsSchema.extend({ deviceId: OpaqueIdSchema });
const ListParamsSchema = HouseholdParamsSchema.extend({ listId: OpaqueIdSchema });
const ListItemParamsSchema = HouseholdParamsSchema.extend({ itemId: OpaqueIdSchema });
const SavedMealParamsSchema = HouseholdParamsSchema.extend({ mealId: OpaqueIdSchema });
const ChoreTemplateParamsSchema = HouseholdParamsSchema.extend({ templateId: OpaqueIdSchema });
const NoticeParamsSchema = HouseholdParamsSchema.extend({ noticeId: OpaqueIdSchema });
const PocketMoneyPaymentParamsSchema = HouseholdParamsSchema.extend({ paymentId: OpaqueIdSchema });
const PhotoCurationParamsSchema = HouseholdParamsSchema.extend({ assetId: OpaqueIdSchema });
const PasskeyParamsSchema = HouseholdParamsSchema.extend({ passkeyId: OpaqueIdSchema });
const PhotoAssetParamsSchema = HouseholdParamsSchema.extend({
  assetId: OpaqueIdSchema,
  variant: z.enum(['display', 'thumbnail']),
});
const PhotoUploadHeadersSchema = z
  .object({
    'content-type': z.string().min(1).max(100),
    'x-hearth-request-id': OpaqueIdSchema,
    'x-hearth-photo-captured-at': TimestampSchema.optional(),
  })
  .passthrough();
const PHOTO_UPLOAD_MIME_TYPES = new Set([
  'image/avif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/tif',
  'image/tiff',
  'image/webp',
  'image/x-heic',
  'image/x-heif',
]);
const PairingParamsSchema = z.object({ pairingId: OpaqueIdSchema });
const ReminderParamsSchema = HouseholdParamsSchema.extend({
  reminderId: OpaqueIdSchema,
});
const ReminderQuerySchema = z.object({
  includeCompleted: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
const TodayQuerySchema = z.object({ date: LocalDateSchema });
const WeekQuerySchema = z.object({ start: LocalDateSchema });
const MonthQuerySchema = z.object({ month: MonthKeySchema });
const PocketMoneyQuerySchema = z.object({
  weekStart: LocalDateSchema,
  asOf: LocalDateSchema,
});
const ActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const LOGGER_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  '*.token',
  '*.password',
  '*.dataBase64',
  '*.appPassword',
  '*.accessToken',
  '*.setupCode',
  '*.recoveryCode',
  '*.pairingSecret',
] as const;

export const HEARTH_DEVICE_COOKIE = 'hearth_device';
const DEVICE_SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export interface BuildServerOptions {
  repository?: HearthRepository;
  adminRepository?: AdminRepository;
  logger?: boolean;
  demoMode?: boolean;
  realtimeHub?: RealtimeHub;
  planningRepository?: PlanningRepository;
  homeRepository?: HomeRepository;
  photoRepository?: PhotoRepository;
  pocketMoneyRepository?: PocketMoneyRepository;
  reminderRepository?: ReminderRepository;
  calendarConnectionRepository?: CalendarConnectionRepository;
  homeAssistantConnectionRepository?: HomeAssistantConnectionRepository;
  systemOperations?: SystemOperationsRepository;
  companionAuth?: CompanionAuthRepository;
  todayContentRepository?: TodayContentRepository;
  dailyVerseProvider?: DailyVerseProvider;
  weatherLocationRepository?: WeatherLocationRepository;
  runtime?: RuntimeConfiguration;
  trustProxyHops?: number;
  readiness?: () => Promise<void> | void;
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const runtime =
    options.runtime ??
    (options.demoMode === false
      ? {
          mode: 'private' as const,
          householdId: null,
          clock: new SystemClock(),
        }
      : {
          mode: 'test' as const,
          householdId: DEMO_HOUSEHOLD_ID,
          clock: new FixedClock(DEMO_NOW),
        });
  const demoMode = runtime.mode !== 'private';
  const repository = options.repository ?? new InMemoryHearthRepository();
  const adminRepository =
    options.adminRepository ?? new InMemoryAdminRepository(() => runtime.clock.now());
  const realtime = options.realtimeHub ?? new RealtimeHub();
  const planningRepository = options.planningRepository ?? new InMemoryPlanningRepository();
  const homeRepository =
    options.homeRepository ??
    (demoMode ? new HomeService() : new HomeService(new UnconfiguredHomeAssistantProvider()));
  const photoRepository =
    options.photoRepository ??
    (demoMode ? new PhotoService() : new PhotoService(new UnconfiguredPhotoSourceProvider()));
  const pocketMoneyRepository =
    options.pocketMoneyRepository ??
    new PocketMoneyService(repository, adminRepository, undefined, {
      seedDemo: demoMode,
      clock: runtime.clock,
    });
  const reminderRepository =
    options.reminderRepository ??
    new ReminderService(adminRepository, undefined, { seedDemo: demoMode, clock: runtime.clock });
  const todayContentRepository = options.todayContentRepository ?? new TodayContentService();
  const dailyVerseProvider =
    options.dailyVerseProvider ??
    (demoMode ? new FakeDailyVerseProvider() : new UnconfiguredDailyVerseProvider());
  const weatherLocationRepository =
    options.weatherLocationRepository ??
    new WeatherLocationService(adminRepository, new FakeWeatherLocationVerifier(), {
      now: () => runtime.clock.now(),
    });
  const calendarConnectionRepository =
    options.calendarConnectionRepository ??
    new CalendarConnectionService(
      adminRepository,
      new FakeCalendarConnectionVerifier(),
      demoMode
        ? {}
        : {
            credentialStore: {
              load: async () => {
                throw new Error('Private calendar secret storage is not configured.');
              },
              save: async () => {
                throw new Error('Private calendar secret storage is not configured.');
              },
              updateMappings: async () => {
                throw new Error('Private calendar secret storage is not configured.');
              },
              remove: async () => undefined,
            },
          },
    );
  const homeAssistantConnectionRepository =
    options.homeAssistantConnectionRepository ??
    new HomeAssistantConnectionService(
      adminRepository,
      new FakeHomeAssistantConnectionVerifier(),
      demoMode
        ? { now: () => runtime.clock.now() }
        : {
            now: () => runtime.clock.now(),
            credentialStore: {
              save: async () => {
                throw new Error('Private Home Assistant secret storage is not configured.');
              },
              remove: async () => undefined,
            },
          },
    );
  const systemOperations =
    options.systemOperations ??
    new InMemorySystemOperations(adminRepository, {
      version: process.env.HEARTH_VERSION ?? 'development',
      mode: runtime.mode,
      clock: runtime.clock,
    });
  const server = Fastify({
    bodyLimit: 1_500_000,
    trustProxy: options.trustProxyHops ?? false,
    logger:
      options.logger === false
        ? false
        : {
            level: process.env.HEARTH_LOG_LEVEL ?? 'info',
            redact: [...LOGGER_REDACT_PATHS],
          },
  });
  server.addContentTypeParser(/^image\/.*/i, { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  const readToday = async (householdId: string, localDate: string) => {
    const [
      today,
      household,
      lists,
      meals,
      gallery,
      todayConfiguration,
      activeNotice,
      reminderOverview,
    ] = await Promise.all([
      repository.getToday(householdId, localDate),
      adminRepository.getHousehold(householdId),
      planningRepository.getLists(householdId),
      planningRepository.getMealPlan(householdId, localDate),
      photoRepository.getGallery(householdId).catch(() => null),
      todayContentRepository.getConfiguration(householdId),
      todayContentRepository.getActiveNotice(householdId),
      reminderRepository.getOverview(householdId, false),
    ]);
    const members = memberLookup(household.members);
    const primaryList = lists.lists[0];
    const dinner = meals.days[0]?.entries.find((entry) => entry.slot === 'dinner');
    const featuredPhoto =
      gallery?.photos.find((photo) => photo.id === gallery.featuredPhotoId) ?? null;
    const dailyVerse = todayConfiguration.sections.dailyVerse
      ? await dailyVerseProvider.getDailyVerse(householdId, localDate)
      : null;
    const openReminders = reminderOverview.reminders
      .filter((reminder) => !reminder.isCompleted)
      .toSorted((left, right) => compareTodayReminders(left, right, localDate));
    const reminderSummary = todayConfiguration.sections.reminders
      ? {
          openCount: openReminders.length,
          items: openReminders.slice(0, 3).map((reminder) => ({
            id: reminder.id,
            title: reminder.title,
            dueAt: reminder.dueAt,
            hasDueTime: reminder.hasDueTime,
          })),
        }
      : null;
    return TodaySummarySchema.parse({
      ...today,
      household: { ...household, mode: today.household.mode },
      dinner: dinner?.mealName ?? today.dinner,
      listSummary:
        primaryList === undefined
          ? today.listSummary
          : { name: primaryList.name, remainingCount: primaryList.remainingCount },
      notice: activeNotice?.message ?? null,
      dailyVerse,
      reminderSummary,
      sections: todayConfiguration.sections,
      photo: !todayConfiguration.sections.photo
        ? null
        : gallery === null
          ? today.photo
          : featuredPhoto === null
            ? null
            : {
                url: featuredPhoto.displayUrl,
                alt: featuredPhoto.alt,
                orientation: featuredPhoto.orientation,
                width: featuredPhoto.width,
                height: featuredPhoto.height,
              },
      calendars: today.calendars.map((calendar) => ({
        ...calendar,
        owner: calendar.owner === null ? null : (members.get(calendar.owner.id) ?? calendar.owner),
      })),
      events: today.events.map((event) => ({
        ...event,
        owner: event.owner === null ? null : (members.get(event.owner.id) ?? event.owner),
      })),
      chores: today.chores.map((chore) => ({
        ...chore,
        assignee: members.get(chore.assignee.id) ?? chore.assignee,
      })),
    });
  };

  server.addHook('preHandler', async (request, reply) => {
    const routeUrl = request.routeOptions.url;
    if (
      runtime.mode !== 'private' ||
      routeUrl === undefined ||
      !routeUrl.startsWith('/api/v1/households/:householdId')
    ) {
      return;
    }
    const params = HouseholdParamsSchema.safeParse(request.params);
    if (!params.success) return;
    return run(reply, async () => {
      await authorizePrivateHouseholdRead(
        request.headers,
        params.data.householdId,
        options,
        adminRepository,
      );
    });
  });

  server.get('/api/v1/runtime', async (request, reply) => {
    const context = RuntimeContextSchema.parse(
      await resolveRuntimeContext(runtime, adminRepository),
    );
    if (runtime.mode !== 'private' || context.household === null) return context;

    reply.header('Cache-Control', 'private, no-store').header('Vary', 'Cookie, Authorization');
    const authorized = await hasPrivateHouseholdReadAccess(
      request.headers,
      context.household.id,
      options,
      adminRepository,
    );
    return RuntimeContextSchema.parse(
      authorized ? context : { ...context, household: null, requiresSetup: false },
    );
  });

  server.get('/api/v1/auth/status', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (options.companionAuth === undefined) {
      return PasskeyAuthStatusSchema.parse({
        mode: runtime.mode,
        configured: false,
        secureOrigin: false,
        requiresSetup: runtime.mode === 'private',
        authenticated: false,
        actor: null,
      });
    }
    return options.companionAuth.status(optionalCompanionCredential(request.headers));
  });

  server.post('/api/v1/auth/first-use/registration-options', async (request, reply) => {
    const body = parse(FirstUsePasskeyOptionsRequestSchema, request.body, reply);
    if (body === null) return reply;
    return run(reply, async () =>
      PasskeyCeremonyOptionsSchema.parse(
        await companionAuth(options).firstUseRegistrationOptions(body, request.ip),
      ),
    );
  });

  server.post('/api/v1/auth/first-use/registration-verifications', async (request, reply) => {
    const body = parse(PasskeyCeremonyVerificationRequestSchema, request.body, reply);
    if (body === null) return reply;
    return run(reply, async () => {
      const auth = companionAuth(options);
      const result = await auth.verifyFirstUseRegistration(body.ceremonyId, body.response);
      reply
        .header('Cache-Control', 'no-store')
        .header('Set-Cookie', auth.sessionCookie(result.token));
      return PasskeySessionSchema.parse(result.session);
    });
  });

  server.post('/api/v1/auth/authentication-options', async (request, reply) =>
    run(reply, async () =>
      PasskeyCeremonyOptionsSchema.parse(
        await companionAuth(options).authenticationOptions(request.ip),
      ),
    ),
  );

  server.post('/api/v1/auth/authentication-verifications', async (request, reply) => {
    const body = parse(PasskeyCeremonyVerificationRequestSchema, request.body, reply);
    if (body === null) return reply;
    return run(reply, async () => {
      const auth = companionAuth(options);
      const result = await auth.verifyAuthentication(body.ceremonyId, body.response);
      reply
        .header('Cache-Control', 'no-store')
        .header('Set-Cookie', auth.sessionCookie(result.token));
      return PasskeySessionSchema.parse(result.session);
    });
  });

  server.get('/api/v1/auth/session', async (request, reply) =>
    run(reply, async () => {
      reply.header('Cache-Control', 'no-store');
      return PasskeySessionSchema.parse(
        companionAuth(options).session(companionCredential(request.headers)),
      );
    }),
  );

  server.post('/api/v1/auth/sign-outs', async (request, reply) => {
    const auth = companionAuth(options);
    const token = optionalCompanionCredential(request.headers);
    if (token !== null) auth.signOut(token);
    reply.header('Cache-Control', 'no-store').header('Set-Cookie', auth.clearSessionCookie());
    return PasskeySignOutResultSchema.parse({ signedOut: true });
  });

  server.post('/api/v1/auth/recovery/registration-options', async (request, reply) => {
    const body = parse(RecoveryPasskeyOptionsRequestSchema, request.body, reply);
    if (body === null) return reply;
    return run(reply, async () =>
      PasskeyCeremonyOptionsSchema.parse(
        await companionAuth(options).recoveryRegistrationOptions(body, request.ip),
      ),
    );
  });

  server.post('/api/v1/auth/recovery/registration-verifications', async (request, reply) => {
    const body = parse(PasskeyCeremonyVerificationRequestSchema, request.body, reply);
    if (body === null) return reply;
    return run(reply, async () => {
      const auth = companionAuth(options);
      const result = await auth.verifyRecoveryRegistration(body.ceremonyId, body.response);
      reply
        .header('Cache-Control', 'no-store')
        .header('Set-Cookie', auth.sessionCookie(result.token));
      return PasskeySessionSchema.parse(result.session);
    });
  });

  server.get('/api/v1/health', async () => ({
    status: 'ok',
    database: options.adminRepository === undefined ? 'in-memory-test' : 'sqlite-ready',
    mode: runtime.mode,
    now: runtime.clock.now().toISOString(),
  }));

  server.get('/api/v1/readiness', async (_request, reply) => {
    try {
      await options.readiness?.();
      return { status: 'ready', database: 'ready', mode: runtime.mode };
    } catch {
      return reply.status(503).send({
        status: 'not-ready',
        database: 'unavailable',
        mode: runtime.mode,
      });
    }
  });

  server.get('/api/v1/households/:householdId/admin', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    if (params === null) return reply;
    return run(reply, async () =>
      AdminOverviewSchema.parse(
        await adminRepository.getOverview(params.householdId, actorId(request.headers, options)),
      ),
    );
  });

  server.get('/api/v1/households/:householdId/activity', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const query = parse(ActivityQuerySchema, request.query, reply);
    if (params === null || query === null) return reply;
    return run(reply, async () =>
      ActivityFeedSchema.parse({
        entries: await adminRepository.getActivity(
          params.householdId,
          actorId(request.headers, options),
          query.limit,
        ),
        generatedAt: runtime.clock.now().toISOString(),
        localOnly: true,
      }),
    );
  });

  server.get('/api/v1/households/:householdId/system-status', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    if (params === null) return reply;
    return run(reply, async () =>
      SystemStatusSchema.parse(
        await systemOperations.getStatus(params.householdId, actorId(request.headers, options)),
      ),
    );
  });

  server.post('/api/v1/households/:householdId/system-backups', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(CommandRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () =>
      SystemBackupCommandResultSchema.parse(
        await systemOperations.createBackup(
          params.householdId,
          actorId(request.headers, options),
          body.requestId,
        ),
      ),
    );
  });

  server.get('/api/v1/households/:householdId/today-configuration', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    if (params === null) return reply;
    return run(reply, async () => {
      await adminRepository.getOverview(params.householdId, actorId(request.headers, options));
      return TodayConfigurationSchema.parse(
        await todayContentRepository.getConfiguration(params.householdId),
      );
    });
  });

  server.put('/api/v1/households/:householdId/today-sections', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(UpdateTodaySectionsRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const actor = commandActor(request.headers, options, adminRepository);
      await adminRepository.getOverview(params.householdId, actor.id);
      const result = TodayConfigurationCommandResultSchema.parse(
        await todayContentRepository.updateSections(params.householdId, body, actor),
      );
      realtime.publish(params.householdId, 'today.changed', params.householdId);
      return result;
    });
  });

  server.post('/api/v1/households/:householdId/notices', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(CreateHouseholdNoticeRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const actor = commandActor(request.headers, options, adminRepository);
      await adminRepository.getOverview(params.householdId, actor.id);
      const result = TodayConfigurationCommandResultSchema.parse(
        await todayContentRepository.createNotice(params.householdId, body, actor),
      );
      realtime.publish(params.householdId, 'today.changed', result.audit.targetId);
      return result;
    });
  });

  server.patch('/api/v1/households/:householdId/notices/:noticeId', async (request, reply) => {
    const params = parse(NoticeParamsSchema, request.params, reply);
    const body = parse(UpdateHouseholdNoticeRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const actor = commandActor(request.headers, options, adminRepository);
      await adminRepository.getOverview(params.householdId, actor.id);
      const result = TodayConfigurationCommandResultSchema.parse(
        await todayContentRepository.updateNotice(params.householdId, params.noticeId, body, actor),
      );
      realtime.publish(params.householdId, 'today.changed', params.noticeId);
      return result;
    });
  });

  server.post(
    '/api/v1/households/:householdId/notices/:noticeId/archives',
    async (request, reply) => {
      const params = parse(NoticeParamsSchema, request.params, reply);
      const body = parse(ArchiveHouseholdNoticeRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const actor = commandActor(request.headers, options, adminRepository);
        await adminRepository.getOverview(params.householdId, actor.id);
        const result = TodayConfigurationCommandResultSchema.parse(
          await todayContentRepository.archiveNotice(
            params.householdId,
            params.noticeId,
            body.requestId,
            actor,
          ),
        );
        realtime.publish(params.householdId, 'today.changed', params.noticeId);
        return result;
      });
    },
  );

  server.get('/api/v1/households/:householdId/calendar-connection', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    if (params === null) return reply;
    return run(reply, async () => {
      const connection = await calendarConnectionRepository.get(
        params.householdId,
        actorId(request.headers, options),
      );
      return connection === null ? null : CalendarConnectionSettingsSchema.parse(connection);
    });
  });

  server.post(
    '/api/v1/households/:householdId/calendar-connection-selection-tests',
    async (request, reply) => {
      const params = parse(HouseholdParamsSchema, request.params, reply);
      if (params === null) return reply;
      return run(reply, async () =>
        CalendarConnectionTestResultSchema.parse(
          await calendarConnectionRepository.refreshSelection(
            params.householdId,
            actorId(request.headers, options),
          ),
        ),
      );
    },
  );

  server.post(
    '/api/v1/households/:householdId/calendar-connection-tests',
    async (request, reply) => {
      const params = parse(HouseholdParamsSchema, request.params, reply);
      const body = parse(CalendarConnectionTestRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () =>
        CalendarConnectionTestResultSchema.parse(
          await calendarConnectionRepository.test(
            params.householdId,
            actorId(request.headers, options),
            body,
          ),
        ),
      );
    },
  );

  server.put('/api/v1/households/:householdId/calendar-connection', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(SaveCalendarConnectionRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = CalendarConnectionCommandResultSchema.parse(
        await calendarConnectionRepository.save(
          params.householdId,
          actorId(request.headers, options),
          body,
        ),
      );
      realtime.publish(params.householdId, 'calendar.changed', result.audit.targetId);
      return result;
    });
  });

  server.patch(
    '/api/v1/households/:householdId/calendar-connection/mappings',
    async (request, reply) => {
      const params = parse(HouseholdParamsSchema, request.params, reply);
      const body = parse(UpdateCalendarMappingsRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = CalendarConnectionCommandResultSchema.parse(
          await calendarConnectionRepository.updateMappings(
            params.householdId,
            actorId(request.headers, options),
            body,
          ),
        );
        realtime.publish(params.householdId, 'calendar.changed', result.audit.targetId);
        return result;
      });
    },
  );

  server.post(
    '/api/v1/households/:householdId/calendar-connection/removals',
    async (request, reply) => {
      const params = parse(HouseholdParamsSchema, request.params, reply);
      const body = parse(RemoveCalendarConnectionRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = CalendarConnectionCommandResultSchema.parse(
          await calendarConnectionRepository.remove(
            params.householdId,
            actorId(request.headers, options),
            body.requestId,
          ),
        );
        realtime.publish(params.householdId, 'calendar.changed', result.audit.targetId);
        return result;
      });
    },
  );

  server.get(
    '/api/v1/households/:householdId/home-assistant-connection',
    async (request, reply) => {
      const params = parse(HouseholdParamsSchema, request.params, reply);
      if (params === null) return reply;
      return run(reply, async () => {
        const connection = await homeAssistantConnectionRepository.get(
          params.householdId,
          actorId(request.headers, options),
        );
        return connection === null ? null : HomeAssistantConnectionSettingsSchema.parse(connection);
      });
    },
  );

  server.post(
    '/api/v1/households/:householdId/home-assistant-connection-tests',
    async (request, reply) => {
      const params = parse(HouseholdParamsSchema, request.params, reply);
      const body = parse(HomeAssistantConnectionTestRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () =>
        HomeAssistantConnectionTestResultSchema.parse(
          await homeAssistantConnectionRepository.test(
            params.householdId,
            actorId(request.headers, options),
            body,
          ),
        ),
      );
    },
  );

  server.put(
    '/api/v1/households/:householdId/home-assistant-connection',
    async (request, reply) => {
      const params = parse(HouseholdParamsSchema, request.params, reply);
      const body = parse(SaveHomeAssistantConnectionRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = HomeAssistantConnectionCommandResultSchema.parse(
          await homeAssistantConnectionRepository.save(
            params.householdId,
            actorId(request.headers, options),
            body,
          ),
        );
        realtime.publish(params.householdId, 'home.changed', result.audit.targetId);
        return result;
      });
    },
  );

  server.post(
    '/api/v1/households/:householdId/home-assistant-connection/removals',
    async (request, reply) => {
      const params = parse(HouseholdParamsSchema, request.params, reply);
      const body = parse(RemoveHomeAssistantConnectionRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = HomeAssistantConnectionCommandResultSchema.parse(
          await homeAssistantConnectionRepository.remove(
            params.householdId,
            actorId(request.headers, options),
            body.requestId,
          ),
        );
        realtime.publish(params.householdId, 'home.changed', result.audit.targetId);
        return result;
      });
    },
  );

  server.patch('/api/v1/households/:householdId/settings', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(UpdateHouseholdRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const overview = AdminOverviewSchema.parse(
        await adminRepository.updateHousehold(
          params.householdId,
          actorId(request.headers, options),
          body,
        ),
      );
      realtime.publish(params.householdId, 'household.changed', params.householdId);
      return overview;
    });
  });

  server.get('/api/v1/households/:householdId/weather-location', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    if (params === null) return reply;
    return run(reply, async () => {
      const location = await weatherLocationRepository.get(
        params.householdId,
        actorId(request.headers, options),
      );
      return location === null ? null : WeatherLocationSchema.parse(location);
    });
  });

  server.post(
    '/api/v1/households/:householdId/weather-location-searches',
    async (request, reply) => {
      const params = parse(HouseholdParamsSchema, request.params, reply);
      const body = parse(WeatherLocationSearchRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () =>
        WeatherLocationSearchResultsSchema.parse(
          await weatherLocationRepository.search(
            params.householdId,
            actorId(request.headers, options),
            body.query,
          ),
        ),
      );
    },
  );

  server.post('/api/v1/households/:householdId/weather-location-tests', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(WeatherLocationTestRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () =>
      WeatherLocationTestResultSchema.parse(
        await weatherLocationRepository.test(
          params.householdId,
          actorId(request.headers, options),
          body,
        ),
      ),
    );
  });

  server.put('/api/v1/households/:householdId/weather-location', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(SaveWeatherLocationRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = WeatherLocationCommandResultSchema.parse(
        await weatherLocationRepository.save(
          params.householdId,
          actorId(request.headers, options),
          body,
        ),
      );
      realtime.publish(params.householdId, 'weather.changed', result.audit.targetId);
      return result;
    });
  });

  server.get('/api/v1/households/:householdId/adult-access', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    if (params === null) return reply;
    return run(reply, async () =>
      AdultAccessSummarySchema.parse(
        companionAuth(options).adultAccess(
          params.householdId,
          companionActor(request.headers, options),
        ),
      ),
    );
  });

  server.post(
    '/api/v1/households/:householdId/adult-access/passkey-registration-options',
    async (request, reply) => {
      const params = parse(HouseholdParamsSchema, request.params, reply);
      const body = parse(AdditionalPasskeyOptionsRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () =>
        PasskeyCeremonyOptionsSchema.parse(
          await companionAuth(options).additionalRegistrationOptions(
            params.householdId,
            companionActor(request.headers, options),
            body,
          ),
        ),
      );
    },
  );

  server.post(
    '/api/v1/households/:householdId/adult-access/passkey-registration-verifications',
    async (request, reply) => {
      const params = parse(HouseholdParamsSchema, request.params, reply);
      const body = parse(PasskeyCeremonyVerificationRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () =>
        PasskeyRegistrationResultSchema.parse(
          await companionAuth(options).verifyAdditionalRegistration(
            params.householdId,
            companionActor(request.headers, options),
            body.ceremonyId,
            body.response,
          ),
        ),
      );
    },
  );

  server.post(
    '/api/v1/households/:householdId/adult-access/recovery-confirmation-options',
    async (request, reply) => {
      const params = parse(HouseholdParamsSchema, request.params, reply);
      if (params === null) return reply;
      return run(reply, async () =>
        PasskeyCeremonyOptionsSchema.parse(
          await companionAuth(options).recoveryConfirmationOptions(
            params.householdId,
            companionActor(request.headers, options),
          ),
        ),
      );
    },
  );

  server.post(
    '/api/v1/households/:householdId/adult-access/recovery-codes',
    async (request, reply) => {
      const params = parse(HouseholdParamsSchema, request.params, reply);
      const body = parse(RecoveryCodeConfirmationRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () =>
        RecoveryCodeRevealSchema.parse(
          await companionAuth(options).createRecoveryCode(
            params.householdId,
            companionActor(request.headers, options),
            body.ceremonyId,
            body.response,
          ),
        ),
      );
    },
  );

  server.post(
    '/api/v1/households/:householdId/adult-access/passkeys/:passkeyId/revocations',
    async (request, reply) => {
      const params = parse(PasskeyParamsSchema, request.params, reply);
      const body = parse(RevokePasskeyRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () =>
        PasskeyRevocationResultSchema.parse(
          companionAuth(options).revokePasskey(
            params.householdId,
            params.passkeyId,
            companionActor(request.headers, options),
            body.requestId,
          ),
        ),
      );
    },
  );

  server.post('/api/v1/households/:householdId/members', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(CreateMemberRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const member = MemberSchema.parse(
        await adminRepository.createMember(
          params.householdId,
          actorId(request.headers, options),
          body,
        ),
      );
      realtime.publish(params.householdId, 'household.changed', member.id);
      return member;
    });
  });

  server.patch('/api/v1/households/:householdId/members/:memberId', async (request, reply) => {
    const params = parse(MemberParamsSchema, request.params, reply);
    const body = parse(UpdateMemberRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const member = MemberSchema.parse(
        await adminRepository.updateMember(
          params.householdId,
          params.memberId,
          actorId(request.headers, options),
          body,
        ),
      );
      realtime.publish(params.householdId, 'household.changed', member.id);
      return member;
    });
  });

  server.get('/api/v1/households/:householdId/members/:memberId/avatar', async (request, reply) => {
    const params = parse(MemberParamsSchema, request.params, reply);
    if (params === null) return reply;
    return run(reply, async () => {
      const asset = await adminRepository.getMemberAvatar(params.householdId, params.memberId);
      return reply
        .header('Cache-Control', 'private, max-age=31536000, immutable')
        .header('Content-Length', String(asset.bytes.byteLength))
        .header('X-Content-Type-Options', 'nosniff')
        .type(asset.mimeType)
        .send(Buffer.from(asset.bytes));
    });
  });

  server.put('/api/v1/households/:householdId/members/:memberId/avatar', async (request, reply) => {
    const params = parse(MemberParamsSchema, request.params, reply);
    const body = parse(UpdateMemberAvatarRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = MemberAvatarCommandResultSchema.parse(
        await adminRepository.updateMemberAvatar(
          params.householdId,
          params.memberId,
          actorId(request.headers, options),
          body,
        ),
      );
      realtime.publish(params.householdId, 'household.changed', result.member.id);
      return result;
    });
  });

  server.post(
    '/api/v1/households/:householdId/members/:memberId/avatar-resets',
    async (request, reply) => {
      const params = parse(MemberParamsSchema, request.params, reply);
      const body = parse(ResetMemberAvatarRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = MemberAvatarCommandResultSchema.parse(
          await adminRepository.resetMemberAvatar(
            params.householdId,
            params.memberId,
            actorId(request.headers, options),
            body.requestId,
          ),
        );
        realtime.publish(params.householdId, 'household.changed', result.member.id);
        return result;
      });
    },
  );

  server.post(
    '/api/v1/households/:householdId/members/:memberId/archives',
    async (request, reply) => {
      const params = parse(MemberParamsSchema, request.params, reply);
      const body = parse(ArchiveMemberRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const member = MemberSchema.parse(
          await adminRepository.archiveMember(
            params.householdId,
            params.memberId,
            actorId(request.headers, options),
            body.requestId,
          ),
        );
        realtime.publish(params.householdId, 'household.changed', member.id);
        return member;
      });
    },
  );

  server.post('/api/v1/device-pairing-requests', async (request, reply) => {
    const body = parse(CreatePairingRequestSchema, request.body, reply);
    if (body === null) return reply;
    return run(reply, async () =>
      PairingRequestSchema.parse(
        await adminRepository.createPairing(body.deviceName, body.requestId),
      ),
    );
  });

  server.post('/api/v1/tv-pairing-sessions', async (request, reply) => {
    const body = parse(CreateTvPairingSessionRequestSchema, request.body, reply);
    if (body === null) return reply;
    return run(reply, async () =>
      TvPairingSessionSchema.parse({
        pairing: await adminRepository.createPairing(
          body.deviceName,
          body.requestId,
          credentialHash(body.pairingSecret),
          body.applicationVersion,
        ),
      }),
    );
  });

  server.get('/api/v1/device-pairing-requests/:pairingId', async (request, reply) => {
    const params = parse(PairingParamsSchema, request.params, reply);
    if (params === null) return reply;
    return run(reply, async () =>
      PairingRequestSchema.parse(await adminRepository.getPairing(params.pairingId)),
    );
  });

  server.post(
    '/api/v1/tv-pairing-sessions/:pairingId/credential-exchanges',
    async (request, reply) => {
      const params = parse(PairingParamsSchema, request.params, reply);
      const body = parse(ExchangeTvPairingRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const session = TvDeviceSessionSchema.parse(
          await adminRepository.exchangeTvPairing(
            params.pairingId,
            body.pairingSecret,
            body.requestId,
          ),
        );
        reply
          .header('Cache-Control', 'no-store')
          .header('Set-Cookie', deviceSessionCookie(body.pairingSecret, isPrivateMode(options)));
        return session;
      });
    },
  );

  server.get('/api/v1/device-sessions/current', async (request, reply) => {
    return run(reply, async () =>
      TvDeviceSessionSchema.parse(
        await adminRepository.getTvDeviceSession(deviceCredential(request.headers)),
      ),
    );
  });

  server.get('/api/v1/households/:householdId/reminders', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const query = parse(ReminderQuerySchema, request.query, reply);
    if (params === null || query === null) return reply;
    return run(reply, async () =>
      ReminderOverviewSchema.parse(
        await reminderRepository.getOverview(params.householdId, query.includeCompleted),
      ),
    );
  });

  server.post('/api/v1/households/:householdId/reminders', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(CreateReminderRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = ReminderCommandResultSchema.parse(
        await reminderRepository.create(
          params.householdId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'reminders.changed', result.reminder.id);
      return result;
    });
  });

  server.put('/api/v1/households/:householdId/reminders/:reminderId', async (request, reply) => {
    const params = parse(ReminderParamsSchema, request.params, reply);
    const body = parse(UpdateReminderRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = ReminderCommandResultSchema.parse(
        await reminderRepository.update(
          params.householdId,
          params.reminderId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'reminders.changed', result.reminder.id);
      return result;
    });
  });

  server.put(
    '/api/v1/households/:householdId/reminders/:reminderId/completion',
    async (request, reply) => {
      const params = parse(ReminderParamsSchema, request.params, reply);
      const body = parse(SetReminderCompletionRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = ReminderCommandResultSchema.parse(
          await reminderRepository.setCompletion(
            params.householdId,
            params.reminderId,
            body,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'reminders.changed', result.reminder.id);
        return result;
      });
    },
  );

  server.post(
    '/api/v1/households/:householdId/reminders/:reminderId/deletions',
    async (request, reply) => {
      const params = parse(ReminderParamsSchema, request.params, reply);
      const body = parse(DeleteReminderRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = ReminderDeletionResultSchema.parse(
          await reminderRepository.delete(
            params.householdId,
            params.reminderId,
            body.requestId,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'reminders.changed', result.reminderId);
        return result;
      });
    },
  );

  server.post('/api/v1/households/:householdId/pairing-approvals', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(ApprovePairingRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () =>
      PairedDeviceSchema.parse(
        await adminRepository.approvePairing(
          params.householdId,
          actorId(request.headers, options),
          body.code,
          body.requestId,
        ),
      ),
    );
  });

  server.post(
    '/api/v1/households/:householdId/paired-devices/:deviceId/revocations',
    async (request, reply) => {
      const params = parse(DeviceParamsSchema, request.params, reply);
      const body = parse(RevokeDeviceRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () =>
        PairedDeviceSchema.parse(
          await adminRepository.revokeDevice(
            params.householdId,
            params.deviceId,
            actorId(request.headers, options),
            body.requestId,
          ),
        ),
      );
    },
  );

  server.get('/api/v1/households/:householdId/today', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const query = parse(TodayQuerySchema, request.query, reply);
    if (params === null || query === null) return reply;
    return run(reply, async () => readToday(params.householdId, query.date));
  });

  server.get('/api/v1/households/:householdId/weather', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    if (params === null) return reply;
    return run(reply, async () => {
      const [forecast, location] = await Promise.all([
        repository.getWeather(params.householdId),
        Promise.resolve(weatherLocationRepository.getDisplayLabel(params.householdId)),
      ]);
      return WeatherForecastSchema.parse({
        ...forecast,
        locationLabel: location ?? forecast.locationLabel,
      });
    });
  });

  server.get('/api/v1/households/:householdId/week', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const query = parse(WeekQuerySchema, request.query, reply);
    if (params === null || query === null) return reply;
    return run(reply, async () => {
      const [week, household] = await Promise.all([
        repository.getWeek(params.householdId, query.start),
        adminRepository.getHousehold(params.householdId),
      ]);
      const members = memberLookup(household.members);
      return WeekScheduleSchema.parse({
        ...week,
        calendars: week.calendars.map((calendar) => ({
          ...calendar,
          owner:
            calendar.owner === null ? null : (members.get(calendar.owner.id) ?? calendar.owner),
        })),
        events: week.events.map((event) => ({
          ...event,
          owner: event.owner === null ? null : (members.get(event.owner.id) ?? event.owner),
        })),
      });
    });
  });

  server.get('/api/v1/households/:householdId/month', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const query = parse(MonthQuerySchema, request.query, reply);
    if (params === null || query === null) return reply;
    return run(reply, async () => {
      const [month, household] = await Promise.all([
        repository.getMonth(params.householdId, query.month),
        adminRepository.getHousehold(params.householdId),
      ]);
      const members = memberLookup(household.members);
      return MonthScheduleSchema.parse({
        ...month,
        calendars: month.calendars.map((calendar) => ({
          ...calendar,
          owner:
            calendar.owner === null ? null : (members.get(calendar.owner.id) ?? calendar.owner),
        })),
        events: month.events.map((event) => ({
          ...event,
          owner: event.owner === null ? null : (members.get(event.owner.id) ?? event.owner),
        })),
      });
    });
  });

  server.get('/api/v1/households/:householdId/photos', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    if (params === null) return reply;
    return run(reply, async () =>
      PhotoGallerySchema.parse(await photoRepository.getGallery(params.householdId)),
    );
  });

  server.get('/api/v1/households/:householdId/photo-source', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    if (params === null) return reply;
    return run(reply, async () => {
      await adminRepository.getOverview(params.householdId, actorId(request.headers, options));
      return PhotoSourceIndexStatusSchema.parse(
        await photoRepository.getSourceStatus(params.householdId),
      );
    });
  });

  server.post('/api/v1/households/:householdId/photo-source/refreshes', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(RefreshPhotoSourceRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const actor = commandActor(request.headers, options, adminRepository);
      await adminRepository.getOverview(params.householdId, actor.id);
      const result = PhotoSourceRefreshResultSchema.parse(
        await photoRepository.refreshSource(params.householdId, body.requestId, actor),
      );
      realtime.publish(params.householdId, 'photos.changed', result.status.collection.id);
      return result;
    });
  });

  server.post(
    '/api/v1/households/:householdId/photo-uploads',
    { bodyLimit: MAX_MANAGED_PHOTO_BYTES },
    async (request, reply) => {
      const params = parse(HouseholdParamsSchema, request.params, reply);
      const headers = parse(PhotoUploadHeadersSchema, request.headers, reply);
      if (params === null || headers === null) return reply;
      const mimeType = headers['content-type'].split(';', 1)[0]!.trim().toLowerCase();
      if (!PHOTO_UPLOAD_MIME_TYPES.has(mimeType) || !Buffer.isBuffer(request.body)) {
        return reply.status(400).send(
          ApiErrorSchema.parse({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Choose a supported family photo smaller than 25 MB.',
              retryable: false,
              requestId: headers['x-hearth-request-id'],
            },
          }),
        );
      }
      return run(reply, async () => {
        const actor = commandActor(request.headers, options, adminRepository);
        await adminRepository.getOverview(params.householdId, actor.id);
        const result = PhotoUploadResultSchema.parse(
          await photoRepository.uploadPhoto(
            params.householdId,
            {
              bytes: request.body as Buffer,
              mimeType,
              capturedAt: headers['x-hearth-photo-captured-at'] ?? null,
            },
            headers['x-hearth-request-id'],
            actor,
          ),
        );
        realtime.publish(params.householdId, 'photos.changed', result.photo.id);
        return result;
      });
    },
  );

  server.post(
    '/api/v1/households/:householdId/photo-assets/:assetId/curation-actions',
    async (request, reply) => {
      const params = parse(PhotoCurationParamsSchema, request.params, reply);
      const body = parse(UpdatePhotoCurationRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const actor = commandActor(request.headers, options, adminRepository);
        await adminRepository.getOverview(params.householdId, actor.id);
        const result = PhotoCurationCommandResultSchema.parse(
          await photoRepository.updateCuration(
            params.householdId,
            params.assetId,
            body.action,
            body.requestId,
            actor,
          ),
        );
        realtime.publish(params.householdId, 'photos.changed', params.assetId);
        return result;
      });
    },
  );

  server.post(
    '/api/v1/households/:householdId/photo-assets/:assetId/deletions',
    async (request, reply) => {
      const params = parse(PhotoCurationParamsSchema, request.params, reply);
      const body = parse(DeleteManagedPhotoRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const actor = commandActor(request.headers, options, adminRepository);
        await adminRepository.getOverview(params.householdId, actor.id);
        const result = PhotoDeletionCommandResultSchema.parse(
          await photoRepository.deleteManagedPhoto(
            params.householdId,
            params.assetId,
            body.requestId,
            actor,
          ),
        );
        realtime.publish(params.householdId, 'photos.changed', params.assetId);
        return result;
      });
    },
  );

  server.get(
    '/api/v1/households/:householdId/photo-assets/:assetId/:variant',
    async (request, reply) => {
      const params = parse(PhotoAssetParamsSchema, request.params, reply);
      if (params === null) return reply;
      return run(reply, async () => {
        const asset = await photoRepository.getDerivative(
          params.householdId,
          params.assetId,
          params.variant,
        );
        if (asset === null) {
          throw new RepositoryError('NOT_FOUND', 'That family photo could not be found.');
        }
        return reply
          .header('Cache-Control', 'private, max-age=31536000, immutable')
          .header('Content-Length', String(asset.bytes.byteLength))
          .header('X-Content-Type-Options', 'nosniff')
          .type(asset.mimeType)
          .send(Buffer.from(asset.bytes));
      });
    },
  );

  server.get('/api/v1/households/:householdId/chore-occurrences', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const query = parse(TodayQuerySchema, request.query, reply);
    if (params === null || query === null) return reply;
    return run(reply, async () => {
      const [chores, household] = await Promise.all([
        repository.getChores(params.householdId, query.date),
        adminRepository.getHousehold(params.householdId),
      ]);
      const occurrences = chores.groups.flatMap((group) => group.occurrences);
      return ChoreListSchema.parse({
        ...chores,
        groups: household.members.map((member) => ({
          member,
          occurrences: occurrences
            .filter((occurrence) => occurrence.assignee.id === member.id)
            .map((occurrence) => ({ ...occurrence, assignee: member })),
        })),
      });
    });
  });

  server.get('/api/v1/households/:householdId/home', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    if (params === null) return reply;
    return run(reply, async () =>
      HomeStatusSchema.parse(await homeRepository.getStatus(params.householdId)),
    );
  });

  server.post('/api/v1/households/:householdId/home/actions/:actionId', async (request, reply) => {
    const params = parse(HomeActionParamsSchema, request.params, reply);
    const body = parse(ExecuteHomeActionRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = HomeActionResultSchema.parse(
        await homeRepository.executeAction(
          params.householdId,
          params.actionId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'home.changed', params.actionId);
      return result;
    });
  });

  server.post('/api/v1/households/:householdId/assist/day-summary', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(AssistDaySummaryRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      assistActor(request.headers, options);
      const today = await readToday(params.householdId, body.date);
      return AssistDaySummaryResultSchema.parse({
        requestId: body.requestId,
        date: body.date,
        speech: buildAssistDaySummary(today),
      });
    });
  });

  server.post(
    '/api/v1/households/:householdId/assist/chore-completions',
    async (request, reply) => {
      const params = parse(HouseholdParamsSchema, request.params, reply);
      const body = parse(AssistChoreCompletionRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const chores = await repository.getChores(params.householdId, body.date);
        let occurrence;
        try {
          occurrence = resolveAssistChore(chores, body.memberName, body.choreTitle);
        } catch (error) {
          if (error instanceof HomeDomainError) {
            throw new RepositoryError(error.code, error.message);
          }
          throw error;
        }
        const result = ChoreCommandResultSchema.parse(
          await repository.complete(
            params.householdId,
            occurrence.id,
            body.requestId,
            assistActor(request.headers, options),
          ),
        );
        realtime.publish(params.householdId, 'chore.changed', occurrence.id);
        realtime.publish(params.householdId, 'pocket-money.changed', occurrence.id);
        return AssistChoreCompletionResultSchema.parse({
          speech: `Done. I marked ${occurrence.title} complete for ${occurrence.assignee.displayName} today.`,
          command: result,
        });
      });
    },
  );

  server.get('/api/v1/households/:householdId/lists', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    if (params === null) return reply;
    return run(reply, async () =>
      HouseholdListsSchema.parse(await planningRepository.getLists(params.householdId)),
    );
  });

  server.get('/api/v1/households/:householdId/list-settings', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    if (params === null) return reply;
    return run(reply, async () =>
      HouseholdListSettingsSchema.parse(
        await planningRepository.getListSettings(
          params.householdId,
          commandActor(request.headers, options, adminRepository),
        ),
      ),
    );
  });

  server.post('/api/v1/households/:householdId/lists', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(CreateHouseholdListRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = ListSettingsCommandResultSchema.parse(
        await planningRepository.createList(
          params.householdId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'list.changed', result.audit.targetId);
      return result;
    });
  });

  server.put('/api/v1/households/:householdId/lists/:listId', async (request, reply) => {
    const params = parse(ListParamsSchema, request.params, reply);
    const body = parse(UpdateHouseholdListRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = ListSettingsCommandResultSchema.parse(
        await planningRepository.updateList(
          params.householdId,
          params.listId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'list.changed', params.listId);
      return result;
    });
  });

  server.post('/api/v1/households/:householdId/lists/:listId/archives', async (request, reply) => {
    const params = parse(ListParamsSchema, request.params, reply);
    const body = parse(CommandRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = ListSettingsCommandResultSchema.parse(
        await planningRepository.archiveList(
          params.householdId,
          params.listId,
          body.requestId,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'list.changed', params.listId);
      return result;
    });
  });

  server.post(
    '/api/v1/households/:householdId/lists/:listId/restorations',
    async (request, reply) => {
      const params = parse(ListParamsSchema, request.params, reply);
      const body = parse(CommandRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = ListSettingsCommandResultSchema.parse(
          await planningRepository.restoreList(
            params.householdId,
            params.listId,
            body.requestId,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'list.changed', params.listId);
        return result;
      });
    },
  );

  server.put('/api/v1/households/:householdId/list-order', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(ReorderHouseholdListsRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = ListSettingsCommandResultSchema.parse(
        await planningRepository.reorderLists(
          params.householdId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'list.changed', params.householdId);
      return result;
    });
  });

  server.put('/api/v1/households/:householdId/list-items/:itemId', async (request, reply) => {
    const params = parse(ListItemParamsSchema, request.params, reply);
    const body = parse(UpdateListItemRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = ListSettingsCommandResultSchema.parse(
        await planningRepository.updateListItem(
          params.householdId,
          params.itemId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'list.changed', params.itemId);
      return result;
    });
  });

  server.post(
    '/api/v1/households/:householdId/list-items/:itemId/archives',
    async (request, reply) => {
      const params = parse(ListItemParamsSchema, request.params, reply);
      const body = parse(CommandRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = ListSettingsCommandResultSchema.parse(
          await planningRepository.archiveListItem(
            params.householdId,
            params.itemId,
            body.requestId,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'list.changed', params.itemId);
        return result;
      });
    },
  );

  server.put('/api/v1/households/:householdId/lists/:listId/item-order', async (request, reply) => {
    const params = parse(ListParamsSchema, request.params, reply);
    const body = parse(ReorderListItemsRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = ListSettingsCommandResultSchema.parse(
        await planningRepository.reorderListItems(
          params.householdId,
          params.listId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'list.changed', params.listId);
      return result;
    });
  });

  server.post(
    '/api/v1/households/:householdId/lists/:listId/checked-item-clears',
    async (request, reply) => {
      const params = parse(ListParamsSchema, request.params, reply);
      const body = parse(CommandRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = ListSettingsCommandResultSchema.parse(
          await planningRepository.clearCheckedListItems(
            params.householdId,
            params.listId,
            body.requestId,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'list.changed', params.listId);
        return result;
      });
    },
  );

  server.post('/api/v1/households/:householdId/lists/:listId/items', async (request, reply) => {
    const params = parse(ListParamsSchema, request.params, reply);
    const body = parse(AddListItemRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = ListItemCommandResultSchema.parse(
        await planningRepository.addListItem(
          params.householdId,
          params.listId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'list.changed', result.item.id);
      return result;
    });
  });

  server.post('/api/v1/households/:householdId/assist/list-items', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(AssistAddListItemRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const lists = await planningRepository.getLists(params.householdId);
      let target;
      try {
        target = resolveHouseholdListTarget(lists.lists, body.listName);
      } catch (error) {
        if (error instanceof PlanningDomainError) {
          throw new RepositoryError(error.code, error.message);
        }
        throw error;
      }
      const result = ListItemCommandResultSchema.parse(
        await planningRepository.addListItem(
          params.householdId,
          target.id,
          { requestId: body.requestId, text: body.text, quantity: body.quantity },
          assistActor(request.headers, options),
        ),
      );
      realtime.publish(params.householdId, 'list.changed', result.item.id);
      return result;
    });
  });

  server.post(
    '/api/v1/households/:householdId/list-items/:itemId/completions',
    async (request, reply) => {
      const params = parse(ListItemParamsSchema, request.params, reply);
      const body = parse(CommandRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = ListItemCommandResultSchema.parse(
          await planningRepository.completeListItem(
            params.householdId,
            params.itemId,
            body.requestId,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'list.changed', params.itemId);
        return result;
      });
    },
  );

  server.post(
    '/api/v1/households/:householdId/list-items/:itemId/completion-reversals',
    async (request, reply) => {
      const params = parse(ListItemParamsSchema, request.params, reply);
      const body = parse(CommandRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = ListItemCommandResultSchema.parse(
          await planningRepository.undoListItem(
            params.householdId,
            params.itemId,
            body.requestId,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'list.changed', params.itemId);
        return result;
      });
    },
  );

  server.get('/api/v1/households/:householdId/meal-plan', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const query = parse(WeekQuerySchema, request.query, reply);
    if (params === null || query === null) return reply;
    return run(reply, async () =>
      MealPlanSchema.parse(await planningRepository.getMealPlan(params.householdId, query.start)),
    );
  });

  server.put('/api/v1/households/:householdId/meal-plan-entries', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(UpsertMealPlanRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = MealCommandResultSchema.parse(
        await planningRepository.upsertMealPlan(
          params.householdId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'meal.changed', result.entry.id);
      return result;
    });
  });

  server.post('/api/v1/households/:householdId/saved-meals', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(CreateSavedMealRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = SavedMealCommandResultSchema.parse(
        await planningRepository.createSavedMeal(
          params.householdId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'meal.changed', result.savedMeal.id);
      return result;
    });
  });

  server.get('/api/v1/households/:householdId/saved-meal-library', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    if (params === null) return reply;
    return run(reply, async () =>
      SavedMealLibrarySchema.parse(
        await planningRepository.getSavedMealLibrary(
          params.householdId,
          commandActor(request.headers, options, adminRepository),
        ),
      ),
    );
  });

  server.put('/api/v1/households/:householdId/saved-meals/:mealId', async (request, reply) => {
    const params = parse(SavedMealParamsSchema, request.params, reply);
    const body = parse(UpdateSavedMealRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = SavedMealCommandResultSchema.parse(
        await planningRepository.updateSavedMeal(
          params.householdId,
          params.mealId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'meal.changed', result.savedMeal.id);
      return result;
    });
  });

  server.post(
    '/api/v1/households/:householdId/saved-meals/:mealId/archives',
    async (request, reply) => {
      const params = parse(SavedMealParamsSchema, request.params, reply);
      const body = parse(CommandRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = SavedMealCommandResultSchema.parse(
          await planningRepository.archiveSavedMeal(
            params.householdId,
            params.mealId,
            body.requestId,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'meal.changed', result.savedMeal.id);
        return result;
      });
    },
  );

  server.post(
    '/api/v1/households/:householdId/saved-meals/:mealId/restorations',
    async (request, reply) => {
      const params = parse(SavedMealParamsSchema, request.params, reply);
      const body = parse(CommandRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = SavedMealCommandResultSchema.parse(
          await planningRepository.restoreSavedMeal(
            params.householdId,
            params.mealId,
            body.requestId,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'meal.changed', result.savedMeal.id);
        return result;
      });
    },
  );

  server.put('/api/v1/households/:householdId/meal-plan-weeks', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(UpdateMealPlanWeekRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = MealPlanWeekCommandResultSchema.parse(
        await planningRepository.updateMealPlanWeek(
          params.householdId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'meal.changed', result.audit.targetId);
      return result;
    });
  });

  server.post('/api/v1/households/:householdId/meal-plan-week-clears', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(ClearMealPlanWeekRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = MealPlanWeekCommandResultSchema.parse(
        await planningRepository.clearMealPlanWeek(
          params.householdId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'meal.changed', result.audit.targetId);
      return result;
    });
  });

  server.post('/api/v1/households/:householdId/meal-plan-week-copies', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(CopyMealPlanWeekRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = MealPlanWeekCommandResultSchema.parse(
        await planningRepository.copyMealPlanWeek(
          params.householdId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'meal.changed', result.audit.targetId);
      return result;
    });
  });

  server.get('/api/v1/households/:householdId/pocket-money', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const query = parse(PocketMoneyQuerySchema, request.query, reply);
    if (params === null || query === null) return reply;
    return run(reply, async () =>
      PocketMoneyOverviewSchema.parse(
        await pocketMoneyRepository.getOverview(params.householdId, query.weekStart, query.asOf),
      ),
    );
  });

  server.put(
    '/api/v1/households/:householdId/members/:memberId/pocket-money-settings',
    async (request, reply) => {
      const params = parse(MemberParamsSchema, request.params, reply);
      const body = parse(UpdatePocketMoneySettingsRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = PocketMoneySettingsCommandResultSchema.parse(
          await pocketMoneyRepository.updateSettings(
            params.householdId,
            params.memberId,
            body,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'pocket-money.changed', params.memberId);
        return result;
      });
    },
  );

  server.post('/api/v1/households/:householdId/pocket-money-payments', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(RecordPocketMoneyPaymentRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = PocketMoneyPaymentCommandResultSchema.parse(
        await pocketMoneyRepository.recordPayment(
          params.householdId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'pocket-money.changed', body.memberId);
      return result;
    });
  });

  server.post(
    '/api/v1/households/:householdId/pocket-money-payments/:paymentId/voids',
    async (request, reply) => {
      const params = parse(PocketMoneyPaymentParamsSchema, request.params, reply);
      const body = parse(VoidPocketMoneyPaymentRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = PocketMoneyPaymentVoidCommandResultSchema.parse(
          await pocketMoneyRepository.voidPayment(
            params.householdId,
            params.paymentId,
            body,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'pocket-money.changed', result.payment.memberId);
        return result;
      });
    },
  );

  server.get('/api/v1/households/:householdId/chore-templates', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    if (params === null) return reply;
    return run(reply, async () =>
      ChoreTemplateListSchema.parse(
        await planningRepository.getChoreTemplates(
          params.householdId,
          commandActor(request.headers, options, adminRepository),
        ),
      ),
    );
  });

  server.post('/api/v1/households/:householdId/chore-templates', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(CreateChoreTemplateRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = ChoreTemplateCommandResultSchema.parse(
        await planningRepository.createChoreTemplate(
          params.householdId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'chore-template.changed', result.template.id);
      return result;
    });
  });

  server.put('/api/v1/households/:householdId/chore-template-order', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    const body = parse(ReorderChoreTemplatesRequestSchema, request.body, reply);
    if (params === null || body === null) return reply;
    return run(reply, async () => {
      const result = ChoreTemplateOrderCommandResultSchema.parse(
        await planningRepository.reorderChoreTemplates(
          params.householdId,
          body,
          commandActor(request.headers, options, adminRepository),
        ),
      );
      realtime.publish(params.householdId, 'chore-template.changed', params.householdId);
      return result;
    });
  });

  server.patch(
    '/api/v1/households/:householdId/chore-templates/:templateId',
    async (request, reply) => {
      const params = parse(ChoreTemplateParamsSchema, request.params, reply);
      const body = parse(UpdateChoreTemplateRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = ChoreTemplateCommandResultSchema.parse(
          await planningRepository.updateChoreTemplate(
            params.householdId,
            params.templateId,
            body,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'chore-template.changed', result.template.id);
        return result;
      });
    },
  );

  server.post(
    '/api/v1/households/:householdId/chore-templates/:templateId/archivals',
    async (request, reply) => {
      const params = parse(ChoreTemplateParamsSchema, request.params, reply);
      const body = parse(CommandRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = ChoreTemplateCommandResultSchema.parse(
          await planningRepository.archiveChoreTemplate(
            params.householdId,
            params.templateId,
            body.requestId,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'chore-template.changed', result.template.id);
        return result;
      });
    },
  );

  server.post(
    '/api/v1/households/:householdId/chore-templates/:templateId/restorations',
    async (request, reply) => {
      const params = parse(ChoreTemplateParamsSchema, request.params, reply);
      const body = parse(RestoreChoreTemplateRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = ChoreTemplateCommandResultSchema.parse(
          await planningRepository.restoreChoreTemplate(
            params.householdId,
            params.templateId,
            body,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'chore-template.changed', result.template.id);
        return result;
      });
    },
  );

  server.get('/api/v1/households/:householdId/events', async (request, reply) => {
    const params = parse(HouseholdParamsSchema, request.params, reply);
    if (params === null) return reply;
    reply.hijack();
    reply.raw.writeHead(200, {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');
    const unsubscribe = realtime.subscribe(params.householdId, (event) => {
      const parsed = RealtimeEventSchema.parse(event);
      reply.raw.write(
        `id: ${parsed.id}\nevent: ${parsed.kind}\ndata: ${JSON.stringify(parsed)}\n\n`,
      );
    });
    const keepAlive = setInterval(() => reply.raw.write(': keep-alive\n\n'), 20_000);
    request.raw.once('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
    return reply;
  });

  server.get(
    '/api/v1/households/:householdId/chore-occurrences/:occurrenceId',
    async (request, reply) => {
      const params = parse(ChoreParamsSchema, request.params, reply);
      if (params === null) return reply;
      return run(reply, async () =>
        ChoreOccurrenceDetailSchema.parse(
          await repository.getChoreOccurrenceDetail(
            params.householdId,
            params.occurrenceId,
            commandActor(request.headers, options, adminRepository),
          ),
        ),
      );
    },
  );

  server.post(
    '/api/v1/households/:householdId/chore-occurrences/:occurrenceId/completions',
    async (request, reply) => {
      const params = parse(ChoreParamsSchema, request.params, reply);
      const body = parse(CommandRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = ChoreCommandResultSchema.parse(
          await repository.complete(
            params.householdId,
            params.occurrenceId,
            body.requestId,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'chore.changed', params.occurrenceId);
        realtime.publish(params.householdId, 'pocket-money.changed', params.occurrenceId);
        return result;
      });
    },
  );

  server.post(
    '/api/v1/households/:householdId/chore-occurrences/:occurrenceId/completion-reversals',
    async (request, reply) => {
      const params = parse(ChoreParamsSchema, request.params, reply);
      const body = parse(CompletionReversalRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = ChoreCommandResultSchema.parse(
          await repository.undo(
            params.householdId,
            params.occurrenceId,
            body.requestId,
            body.completionId,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'chore.changed', params.occurrenceId);
        realtime.publish(params.householdId, 'pocket-money.changed', params.occurrenceId);
        return result;
      });
    },
  );

  server.post(
    '/api/v1/households/:householdId/chore-occurrences/:occurrenceId/skips',
    async (request, reply) => {
      const params = parse(ChoreParamsSchema, request.params, reply);
      const body = parse(ChoreExceptionRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = ChoreSkipResultSchema.parse(
          await repository.skip(
            params.householdId,
            params.occurrenceId,
            body.requestId,
            body.reason,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'chore.changed', params.occurrenceId);
        realtime.publish(params.householdId, 'pocket-money.changed', params.occurrenceId);
        return result;
      });
    },
  );

  server.post(
    '/api/v1/households/:householdId/chore-occurrences/:occurrenceId/excuses',
    async (request, reply) => {
      const params = parse(ChoreParamsSchema, request.params, reply);
      const body = parse(ChoreExceptionRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = ChoreOccurrenceChangeResultSchema.parse(
          await repository.excuse(
            params.householdId,
            params.occurrenceId,
            body.requestId,
            body.reason,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'chore.changed', params.occurrenceId);
        realtime.publish(params.householdId, 'pocket-money.changed', params.occurrenceId);
        return result;
      });
    },
  );

  server.post(
    '/api/v1/households/:householdId/chore-occurrences/:occurrenceId/reassignments',
    async (request, reply) => {
      const params = parse(ChoreParamsSchema, request.params, reply);
      const body = parse(ChoreReassignmentRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = ChoreOccurrenceChangeResultSchema.parse(
          await repository.reassign(
            params.householdId,
            params.occurrenceId,
            body.requestId,
            body.assigneeId,
            body.reason,
            commandActor(request.headers, options, adminRepository),
          ),
        );
        realtime.publish(params.householdId, 'chore.changed', params.occurrenceId);
        realtime.publish(params.householdId, 'pocket-money.changed', params.occurrenceId);
        return result;
      });
    },
  );

  if (demoMode) {
    server.post('/api/v1/demo/reset', async (_request, reply) => {
      planningRepository.reset();
      repository.reset();
      adminRepository.reset();
      homeRepository.reset();
      photoRepository.reset();
      pocketMoneyRepository.reset();
      reminderRepository.reset();
      calendarConnectionRepository.reset();
      homeAssistantConnectionRepository.reset();
      systemOperations.reset();
      todayContentRepository.reset();
      weatherLocationRepository.reset();
      return reply.send({ reset: true });
    });

    server.post('/api/v1/demo/scenario', async (request, reply) => {
      const body = parse(DemoScenarioRequestSchema, request.body, reply);
      if (body === null) return reply;
      repository.setScenario(body.scenario);
      planningRepository.setScenario(body.scenario);
      homeRepository.setScenario(body.scenario);
      photoRepository.setScenario(body.scenario);
      todayContentRepository.setScenario(body.scenario);
      return reply.send({ scenario: body.scenario });
    });
  }

  server.addHook('onClose', async () => {
    await photoRepository.close();
    planningRepository.close();
    adminRepository.close();
    pocketMoneyRepository.close();
    reminderRepository.close();
    calendarConnectionRepository.close();
    homeAssistantConnectionRepository.close();
    systemOperations.close();
    todayContentRepository.close();
    weatherLocationRepository.close();
  });

  return server;
}

function compareTodayReminders(
  left: HearthReminder,
  right: HearthReminder,
  localDate: string,
): number {
  const priority = reminderPriority(left, localDate) - reminderPriority(right, localDate);
  if (priority !== 0) return priority;
  const leftDue = left.dueAt ?? left.dueLocalDate ?? '';
  const rightDue = right.dueAt ?? right.dueLocalDate ?? '';
  const due = leftDue.localeCompare(rightDue);
  if (due !== 0) return due;
  const title = left.title.localeCompare(right.title);
  return title === 0 ? left.id.localeCompare(right.id) : title;
}

function reminderPriority(reminder: HearthReminder, localDate: string): number {
  if (reminder.dueLocalDate === null) return 2;
  if (reminder.dueLocalDate < localDate) return 0;
  if (reminder.dueLocalDate === localDate) return 1;
  return 3;
}

function parse<T extends z.ZodType>(
  schema: T,
  value: unknown,
  reply: FastifyReply,
): z.infer<T> | null {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    void reply.status(400).send(
      ApiErrorSchema.parse({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'That request was not understood.',
          retryable: false,
          requestId: null,
        },
      }),
    );
    return null;
  }
  return parsed.data;
}

async function run(reply: FastifyReply, operation: () => Promise<unknown>): Promise<unknown> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RepositoryError) {
      const status =
        error.code === 'VALIDATION_ERROR'
          ? 400
          : error.code === 'UNAUTHENTICATED'
            ? 401
            : error.code === 'NOT_FOUND'
              ? 404
              : error.code === 'FORBIDDEN'
                ? 403
                : [
                      'CONFLICT',
                      'CONFIRMATION_REQUIRED',
                      'AMBIGUOUS_TARGET',
                      'DUPLICATE_ITEM',
                      'STALE_SNAPSHOT',
                    ].includes(error.code)
                  ? 409
                  : 503;
      return reply.status(status).send(
        ApiErrorSchema.parse({
          error: {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
            requestId: null,
          },
        }),
      );
    }
    throw error;
  }
}

async function authorizePrivateHouseholdRead(
  headers: Record<string, string | string[] | undefined>,
  householdId: string,
  options: BuildServerOptions,
  adminRepository: AdminRepository,
): Promise<void> {
  const deviceCredential = optionalDeviceCredential(headers);
  if (deviceCredential !== null) {
    const session = adminRepository.getTvDeviceSession(deviceCredential);
    if (session.householdId !== householdId) {
      throw new RepositoryError('FORBIDDEN', 'This television belongs to a different Hearth home.');
    }
    if (!session.scopes.includes('household.read')) {
      throw new RepositoryError('FORBIDDEN', 'This television cannot view household information.');
    }
    return;
  }

  const companionCredential = optionalCompanionCredential(headers);
  if (companionCredential === null || options.companionAuth === undefined) {
    throw new RepositoryError('UNAUTHENTICATED', 'Sign in or pair this television to continue.');
  }
  const session = options.companionAuth.session(companionCredential);
  if (session.householdId !== householdId) {
    throw new RepositoryError('FORBIDDEN', 'That sign-in belongs to a different Hearth home.');
  }
  const household = await adminRepository.getHousehold(householdId);
  const member = household.members.find((candidate) => candidate.id === session.memberId);
  if (member === undefined) {
    throw new RepositoryError('UNAUTHENTICATED', 'Sign in to continue.');
  }
  if (!member.capabilities.includes('household.view')) {
    throw new RepositoryError('FORBIDDEN', 'This household member cannot view Hearth.');
  }
}

async function hasPrivateHouseholdReadAccess(
  headers: Record<string, string | string[] | undefined>,
  householdId: string,
  options: BuildServerOptions,
  adminRepository: AdminRepository,
): Promise<boolean> {
  try {
    await authorizePrivateHouseholdRead(headers, householdId, options, adminRepository);
    return true;
  } catch (error) {
    if (
      error instanceof RepositoryError &&
      (error.code === 'UNAUTHENTICATED' || error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND')
    ) {
      return false;
    }
    throw error;
  }
}

function actorId(
  headers: Record<string, string | string[] | undefined>,
  options: BuildServerOptions,
): string {
  if (isPrivateMode(options)) {
    return companionActor(headers, options).id;
  }
  const header = headers['x-hearth-demo-actor'];
  return typeof header === 'string' ? header : DEMO_ADMIN_ACTOR_ID;
}

function commandActor(
  headers: Record<string, string | string[] | undefined>,
  options: BuildServerOptions,
  adminRepository: AdminRepository,
): CommandActor {
  const credential = optionalDeviceCredential(headers);
  if (credential !== null) return adminRepository.authenticateDeviceCredential(credential);
  if (isPrivateMode(options)) {
    return companionActor(headers, options);
  }
  return demoCommandActor(headers);
}

function demoCommandActor(headers: Record<string, string | string[] | undefined>): CommandActor {
  const actorHeader = headers['x-hearth-demo-actor'];
  const sourceHeader = headers['x-hearth-demo-source'];
  if (typeof actorHeader !== 'string') return DEMO_TV_ACTOR;
  if (actorHeader.startsWith('member_')) {
    return {
      id: actorHeader,
      type: 'member',
      source: sourceHeader === 'voice' ? 'voice' : 'companion',
    };
  }
  if (actorHeader.startsWith('service_')) {
    return { id: actorHeader, type: 'service', source: 'automation' };
  }
  return { id: actorHeader, type: 'device', source: 'tv' };
}

function assistActor(
  headers: Record<string, string | string[] | undefined>,
  options: BuildServerOptions,
): CommandActor {
  if (isPrivateMode(options)) {
    throw new RepositoryError('UNAUTHENTICATED', 'Home Assistant is not connected to Hearth.');
  }
  const actorHeader = headers['x-hearth-demo-actor'];
  if (typeof actorHeader !== 'string') {
    return { id: 'service_home_assistant', type: 'service', source: 'voice' };
  }
  return { ...demoCommandActor(headers), source: 'voice' };
}

function isPrivateMode(options: BuildServerOptions): boolean {
  return options.runtime?.mode === 'private' || options.demoMode === false;
}

function deviceCredential(headers: Record<string, string | string[] | undefined>): string {
  const credential = optionalDeviceCredential(headers);
  if (credential === null) {
    throw new RepositoryError('UNAUTHENTICATED', 'This television is not paired with Hearth.');
  }
  return credential;
}

function optionalDeviceCredential(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const authorization = headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    const credential = authorization.slice('Bearer '.length).trim();
    return credential.length > 0 ? credential : null;
  }
  const cookie = headers.cookie;
  if (typeof cookie !== 'string') return null;
  for (const part of cookie.split(';')) {
    const [name, ...valueParts] = part.trim().split('=');
    if (name === HEARTH_DEVICE_COOKIE) {
      const value = valueParts.join('=');
      return value.length > 0 ? safeDecodeCookie(value) : null;
    }
  }
  return null;
}

function companionAuth(options: BuildServerOptions): CompanionAuthRepository {
  if (options.companionAuth === undefined) {
    throw new RepositoryError(
      'INTEGRATION_UNAVAILABLE',
      'Private companion authentication is not configured.',
    );
  }
  return options.companionAuth;
}

function companionActor(
  headers: Record<string, string | string[] | undefined>,
  options: BuildServerOptions,
): CommandActor {
  if (options.companionAuth === undefined) {
    throw new RepositoryError('UNAUTHENTICATED', 'Sign in to continue.');
  }
  return options.companionAuth.authenticate(companionCredential(headers));
}

function companionCredential(headers: Record<string, string | string[] | undefined>): string {
  const token = optionalCompanionCredential(headers);
  if (token === null) throw new RepositoryError('UNAUTHENTICATED', 'Sign in to continue.');
  return token;
}

function optionalCompanionCredential(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const cookie = headers.cookie;
  if (typeof cookie !== 'string') return null;
  for (const part of cookie.split(';')) {
    const [name, ...valueParts] = part.trim().split('=');
    if (name === HEARTH_COMPANION_COOKIE) {
      const value = valueParts.join('=');
      return value.length > 0 ? safeDecodeCookie(value) : null;
    }
  }
  return null;
}

function safeDecodeCookie(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function deviceSessionCookie(credential: string, secure: boolean): string {
  const secureAttribute = secure ? '; Secure' : '';
  return `${HEARTH_DEVICE_COOKIE}=${encodeURIComponent(credential)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DEVICE_SESSION_MAX_AGE_SECONDS}${secureAttribute}`;
}

function memberLookup(members: Member[]): Map<string, Member> {
  return new Map(members.map((member) => [member.id, member]));
}
