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
  AdminOverviewSchema,
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
  ChoreListSchema,
  ChoreSkipResultSchema,
  ChoreTemplateCommandResultSchema,
  ChoreTemplateListSchema,
  CommandRequestSchema,
  CompletionReversalRequestSchema,
  CreateMemberRequestSchema,
  CreateHouseholdNoticeRequestSchema,
  CreatePairingRequestSchema,
  CreateTvPairingSessionRequestSchema,
  CreateChoreTemplateRequestSchema,
  CreateSavedMealRequestSchema,
  DemoScenarioRequestSchema,
  ExecuteHomeActionRequestSchema,
  ExchangeTvPairingRequestSchema,
  FirstUsePasskeyOptionsRequestSchema,
  HouseholdListsSchema,
  HomeActionIdSchema,
  HomeActionResultSchema,
  HomeStatusSchema,
  ListItemCommandResultSchema,
  LocalDateSchema,
  MealCommandResultSchema,
  MealPlanSchema,
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
  PasskeySessionSchema,
  PasskeySignOutResultSchema,
  PhotoGallerySchema,
  PocketMoneyOverviewSchema,
  PocketMoneyPaymentCommandResultSchema,
  PocketMoneySettingsCommandResultSchema,
  RealtimeEventSchema,
  RecordPocketMoneyPaymentRequestSchema,
  RemoveCalendarConnectionRequestSchema,
  ResetMemberAvatarRequestSchema,
  RevokeDeviceRequestSchema,
  RuntimeContextSchema,
  SavedMealCommandResultSchema,
  SaveCalendarConnectionRequestSchema,
  TodaySummarySchema,
  TodayConfigurationCommandResultSchema,
  TodayConfigurationSchema,
  TvDeviceSessionSchema,
  TvPairingSessionSchema,
  UpdateHouseholdRequestSchema,
  UpdateHouseholdNoticeRequestSchema,
  UpdateChoreTemplateRequestSchema,
  UpdateMemberRequestSchema,
  UpdateMemberAvatarRequestSchema,
  UpdatePocketMoneySettingsRequestSchema,
  UpdateTodaySectionsRequestSchema,
  WeekScheduleSchema,
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
import { RealtimeHub } from './realtime.js';
import { HomeService, type HomeRepository } from './home-repository.js';
import { UnconfiguredHomeAssistantProvider } from './integrations/home-assistant-provider.js';
import { UnconfiguredPhotoSourceProvider } from './integrations/photo-source.js';
import { PhotoService, type PhotoRepository } from './photo-repository.js';
import { InMemoryPlanningRepository, type PlanningRepository } from './planning-repository.js';
import { PocketMoneyService, type PocketMoneyRepository } from './pocket-money-repository.js';
import { TodayContentService, type TodayContentRepository } from './today-content-repository.js';
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
const ChoreTemplateParamsSchema = HouseholdParamsSchema.extend({ templateId: OpaqueIdSchema });
const NoticeParamsSchema = HouseholdParamsSchema.extend({ noticeId: OpaqueIdSchema });
const PairingParamsSchema = z.object({ pairingId: OpaqueIdSchema });
const TodayQuerySchema = z.object({ date: LocalDateSchema });
const WeekQuerySchema = z.object({ start: LocalDateSchema });
const MonthQuerySchema = z.object({ month: MonthKeySchema });
const PocketMoneyQuerySchema = z.object({
  weekStart: LocalDateSchema,
  asOf: LocalDateSchema,
});

export const LOGGER_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  '*.token',
  '*.password',
  '*.dataBase64',
  '*.appPassword',
  '*.setupCode',
] as const;

export const HEARTH_DEVICE_COOKIE = 'hearth_device';

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
  calendarConnectionRepository?: CalendarConnectionRepository;
  companionAuth?: CompanionAuthRepository;
  todayContentRepository?: TodayContentRepository;
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
  const adminRepository = options.adminRepository ?? new InMemoryAdminRepository();
  const realtime = options.realtimeHub ?? new RealtimeHub();
  const planningRepository = options.planningRepository ?? new InMemoryPlanningRepository();
  const homeRepository =
    options.homeRepository ??
    (demoMode ? new HomeService() : new HomeService(new UnconfiguredHomeAssistantProvider()));
  const photoRepository =
    options.photoRepository ??
    (demoMode ? new PhotoService() : new PhotoService(new UnconfiguredPhotoSourceProvider()));
  const pocketMoneyRepository =
    options.pocketMoneyRepository ?? new PocketMoneyService(repository, adminRepository);
  const todayContentRepository = options.todayContentRepository ?? new TodayContentService();
  const calendarConnectionRepository =
    options.calendarConnectionRepository ??
    new CalendarConnectionService(
      adminRepository,
      new FakeCalendarConnectionVerifier(),
      demoMode
        ? {}
        : {
            credentialStore: {
              save: async () => {
                throw new Error('Private calendar secret storage is not configured.');
              },
              remove: async () => undefined,
            },
          },
    );
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

  const readToday = async (householdId: string, localDate: string) => {
    const [today, household, lists, meals, gallery, todayConfiguration, activeNotice] =
      await Promise.all([
        repository.getToday(householdId, localDate),
        adminRepository.getHousehold(householdId),
        planningRepository.getLists(householdId),
        planningRepository.getMealPlan(householdId, localDate),
        photoRepository.getGallery(householdId).catch(() => null),
        todayContentRepository.getConfiguration(householdId),
        todayContentRepository.getActiveNotice(householdId),
      ]);
    const members = memberLookup(household.members);
    const primaryList = lists.lists[0];
    const dinner = meals.days[0]?.entries.find((entry) => entry.slot === 'dinner');
    const featuredPhoto =
      gallery?.photos.find((photo) => photo.id === gallery.featuredPhotoId) ?? null;
    return TodaySummarySchema.parse({
      ...today,
      household: { ...household, mode: today.household.mode },
      dinner: dinner?.mealName ?? today.dinner,
      listSummary:
        primaryList === undefined
          ? today.listSummary
          : { name: primaryList.name, remainingCount: primaryList.remainingCount },
      notice: activeNotice?.message ?? null,
      sections: todayConfiguration.sections,
      photo: !todayConfiguration.sections.photo
        ? null
        : gallery === null
          ? today.photo
          : featuredPhoto === null
            ? null
            : { url: featuredPhoto.displayUrl, alt: featuredPhoto.alt },
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

  server.get('/api/v1/runtime', async () =>
    RuntimeContextSchema.parse(await resolveRuntimeContext(runtime, adminRepository)),
  );

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

  server.post('/api/v1/auth/authentication-options', async (_request, reply) =>
    run(reply, async () =>
      PasskeyCeremonyOptionsSchema.parse(await companionAuth(options).authenticationOptions()),
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
      return run(reply, async () =>
        TvDeviceSessionSchema.parse(
          await adminRepository.exchangeTvPairing(
            params.pairingId,
            body.pairingSecret,
            body.requestId,
          ),
        ),
      );
    },
  );

  server.get('/api/v1/device-sessions/current', async (request, reply) => {
    return run(reply, async () =>
      TvDeviceSessionSchema.parse(
        await adminRepository.getTvDeviceSession(deviceCredential(request.headers)),
      ),
    );
  });

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
      const body = parse(CommandRequestSchema, request.body, reply);
      if (params === null || body === null) return reply;
      return run(reply, async () => {
        const result = ChoreSkipResultSchema.parse(
          await repository.skip(
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

  if (demoMode) {
    server.post('/api/v1/demo/reset', async (_request, reply) => {
      planningRepository.reset();
      repository.reset();
      adminRepository.reset();
      homeRepository.reset();
      photoRepository.reset();
      pocketMoneyRepository.reset();
      calendarConnectionRepository.reset();
      todayContentRepository.reset();
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
    planningRepository.close();
    adminRepository.close();
    pocketMoneyRepository.close();
    calendarConnectionRepository.close();
    todayContentRepository.close();
  });

  return server;
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

function memberLookup(members: Member[]): Map<string, Member> {
  return new Map(members.map((member) => [member.id, member]));
}
