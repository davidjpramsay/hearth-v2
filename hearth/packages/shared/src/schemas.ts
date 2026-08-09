import { z } from 'zod';

export const OpaqueIdSchema = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[a-z][a-z0-9_-]+$/, 'Expected an opaque Hearth identifier');

export const LocalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD local date');

export const TimestampSchema = z.iso.datetime({ offset: true });
export const TimezoneSchema = z.string().min(1).max(80);

export const CapabilitySchema = z.enum([
  'household.admin',
  'household.view',
  'chores.complete',
  'lists.change',
  'meals.change',
  'pocket-money.view',
  'home.control',
]);

export const MemberSchema = z.object({
  id: OpaqueIdSchema,
  displayName: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  avatarUrl: z.string().startsWith('/'),
  role: z.enum(['adult', 'child']),
  capabilities: z.array(CapabilitySchema),
});

export const HouseholdSummarySchema = z.object({
  id: OpaqueIdSchema,
  name: z.string().min(1).max(100),
  timezone: TimezoneSchema,
  locale: z.string().min(2).max(20),
  mode: z.string().min(1).max(40),
  members: z.array(MemberSchema),
});

export const RuntimeModeSchema = z.enum(['demo', 'test', 'private']);

export const RuntimeHouseholdSchema = HouseholdSummarySchema.pick({
  id: true,
  name: true,
  timezone: true,
  locale: true,
});

export const RuntimeContextSchema = z.object({
  mode: RuntimeModeSchema,
  generatedAt: TimestampSchema,
  household: RuntimeHouseholdSchema.nullable(),
  timezone: TimezoneSchema,
  locale: z.string().min(2).max(20),
  localDate: LocalDateSchema,
  weekStart: LocalDateSchema,
  currentMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  requiresSetup: z.boolean(),
});

export const PasskeyAuthStatusSchema = z.object({
  mode: RuntimeModeSchema,
  configured: z.boolean(),
  secureOrigin: z.boolean(),
  requiresSetup: z.boolean(),
  authenticated: z.boolean(),
  actor: MemberSchema.pick({ id: true, displayName: true, role: true }).nullable(),
});

export const FirstUsePasskeyOptionsRequestSchema = z
  .object({
    setupCode: z.string().trim().min(12).max(160),
    householdName: z.string().trim().min(1).max(100),
    adultName: z.string().trim().min(1).max(80),
    timezone: TimezoneSchema,
    passkeyLabel: z.string().trim().min(1).max(80),
  })
  .strict();

export const PasskeyCeremonyOptionsSchema = z.object({
  ceremonyId: OpaqueIdSchema,
  options: z.record(z.string(), z.unknown()),
  expiresAt: TimestampSchema,
});

export const PasskeyCeremonyVerificationRequestSchema = z
  .object({
    ceremonyId: OpaqueIdSchema,
    response: z.record(z.string(), z.unknown()),
  })
  .strict();

export const PasskeySessionSchema = z.object({
  authenticated: z.literal(true),
  householdId: OpaqueIdSchema,
  memberId: OpaqueIdSchema,
  displayName: z.string().min(1).max(80),
  expiresAt: TimestampSchema,
});

export const PasskeySignOutResultSchema = z.object({ signedOut: z.literal(true) });

export const IntegrationStateSchema = z.object({
  kind: z.enum(['calendar', 'home-assistant']),
  status: z.enum([
    'healthy',
    'stale',
    'unavailable',
    'authentication-required',
    'read-only',
    'not-configured',
    'disabled',
  ]),
  lastSuccessfulAt: TimestampSchema.nullable(),
  message: z.string().min(1).max(180),
});

export const CalendarSourceSchema = z.object({
  id: OpaqueIdSchema,
  displayName: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  owner: MemberSchema.nullable(),
  access: z.enum(['read-only', 'read-write']),
});

export const CalendarEventSchema = z.object({
  id: OpaqueIdSchema,
  calendarId: OpaqueIdSchema,
  title: z.string().min(1).max(160),
  owner: MemberSchema.nullable(),
  sourceLabel: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  start: TimestampSchema,
  end: TimestampSchema,
  startLocalDate: LocalDateSchema,
  endLocalDate: LocalDateSchema,
  allDay: z.boolean(),
  location: z.string().max(240).nullable(),
  providerVersion: z.string().min(1).max(160).nullable(),
  recurrenceMasterId: OpaqueIdSchema.nullable(),
  isRecurrenceException: z.boolean(),
});

export const ChoreStateSchema = z.enum(['pending', 'completed', 'skipped', 'excused', 'cancelled']);

export const ChoreOccurrenceSchema = z.object({
  id: OpaqueIdSchema,
  title: z.string().min(1).max(140),
  assignee: MemberSchema,
  routineLabel: z.string().min(1).max(80),
  localDate: LocalDateSchema,
  state: ChoreStateSchema,
  completionId: OpaqueIdSchema.nullable(),
  completedAt: TimestampSchema.nullable(),
  completedLabel: z.string().max(80).nullable(),
  locked: z.boolean(),
});

export const WeatherSummarySchema = z.object({
  temperatureCelsius: z.number().int().min(-30).max(60),
  condition: z.string().min(1).max(80),
});

export const DailyForecastSchema = z.object({
  temperatureCelsius: z.number().int().min(-30).max(60),
  condition: z.enum(['clear', 'partly-cloudy', 'cloudy', 'rain']),
  label: z.string().min(1).max(80),
});

const SameOriginAssetUrlSchema = z
  .string()
  .startsWith('/')
  .max(500)
  .refine((value) => !value.startsWith('//') && !value.includes('..'), {
    message: 'Asset URLs must stay on the Hearth origin.',
  });

export const TodayPhotoSummarySchema = z.object({
  url: SameOriginAssetUrlSchema,
  alt: z.string().min(1).max(180),
});

export const PhotoOrientationSchema = z.enum(['landscape', 'portrait', 'square']);

export const PhotoAssetSchema = z.object({
  id: OpaqueIdSchema,
  thumbnailUrl: SameOriginAssetUrlSchema,
  displayUrl: SameOriginAssetUrlSchema,
  alt: z.string().min(1).max(180),
  width: z.number().int().positive().max(20_000),
  height: z.number().int().positive().max(20_000),
  orientation: PhotoOrientationSchema,
  capturedAt: TimestampSchema.nullable(),
  favourite: z.boolean(),
});

export const PhotoSourceSummarySchema = z.object({
  kind: z.enum(['demo', 'synology-folder']),
  label: z.string().min(1).max(100),
  status: z.enum(['ready', 'unconfigured', 'unavailable']),
  message: z.string().min(1).max(180).nullable(),
});

export const PhotoCollectionSchema = z.object({
  id: OpaqueIdSchema,
  name: z.string().min(1).max(100),
  photoCount: z.number().int().nonnegative(),
  updatedAt: TimestampSchema.nullable(),
  source: PhotoSourceSummarySchema,
});

export const PhotoGallerySchema = z.object({
  householdId: OpaqueIdSchema,
  freshness: z.enum(['current', 'stale', 'offline']),
  statusMessage: z.string().max(180).nullable(),
  collection: PhotoCollectionSchema,
  featuredPhotoId: OpaqueIdSchema.nullable(),
  photos: z.array(PhotoAssetSchema),
});

export const TodaySectionVisibilitySchema = z.object({
  dinner: z.boolean(),
  listSummary: z.boolean(),
  notice: z.boolean(),
  photo: z.boolean(),
});

export const HouseholdNoticeSchema = z.object({
  id: OpaqueIdSchema,
  householdId: OpaqueIdSchema,
  message: z.string().trim().min(1).max(240),
  priority: z.enum(['standard', 'important']),
  startsAt: TimestampSchema,
  expiresAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const TodayConfigurationSchema = z.object({
  householdId: OpaqueIdSchema,
  sections: TodaySectionVisibilitySchema,
  activeNoticeId: OpaqueIdSchema.nullable(),
  notices: z.array(HouseholdNoticeSchema),
});

export const TodaySummarySchema = z.object({
  household: HouseholdSummarySchema,
  localDate: LocalDateSchema,
  generatedAt: TimestampSchema,
  displayTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  displayDate: z.string().min(1).max(100),
  weather: WeatherSummarySchema.nullable(),
  freshness: z.enum(['current', 'stale', 'offline']),
  statusMessage: z.string().max(180).nullable(),
  calendars: z.array(CalendarSourceSchema),
  events: z.array(CalendarEventSchema),
  chores: z.array(ChoreOccurrenceSchema),
  dinner: z.string().max(180).nullable(),
  listSummary: z
    .object({
      name: z.string().min(1).max(100),
      remainingCount: z.number().int().nonnegative(),
    })
    .nullable(),
  notice: z.string().max(240).nullable(),
  photo: TodayPhotoSummarySchema.nullable(),
  sections: TodaySectionVisibilitySchema,
  integrations: z.array(IntegrationStateSchema),
});

export const WeekDaySchema = z.object({
  localDate: LocalDateSchema,
  dayLabel: z.string().min(1).max(20),
  dateLabel: z.string().min(1).max(20),
  isToday: z.boolean(),
  forecast: DailyForecastSchema.nullable(),
});

export const WeekScheduleSchema = z.object({
  householdId: OpaqueIdSchema,
  startDate: LocalDateSchema,
  endDate: LocalDateSchema,
  displayRange: z.string().min(1).max(80),
  freshness: z.enum(['current', 'stale', 'offline']),
  statusMessage: z.string().max(180).nullable(),
  days: z.array(WeekDaySchema).length(7),
  calendars: z.array(CalendarSourceSchema),
  events: z.array(CalendarEventSchema),
});

export const MonthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const MonthDaySchema = z.object({
  localDate: LocalDateSchema,
  dayNumber: z.number().int().min(1).max(31),
  inMonth: z.boolean(),
  isToday: z.boolean(),
});

export const MonthScheduleSchema = z.object({
  householdId: OpaqueIdSchema,
  month: MonthKeySchema,
  gridStartDate: LocalDateSchema,
  gridEndDate: LocalDateSchema,
  displayMonth: z.string().min(1).max(40),
  displayYear: z.string().regex(/^\d{4}$/),
  freshness: z.enum(['current', 'stale', 'offline']),
  statusMessage: z.string().max(180).nullable(),
  days: z.array(MonthDaySchema).length(42),
  calendars: z.array(CalendarSourceSchema),
  events: z.array(CalendarEventSchema),
});

export const ChoreGroupSchema = z.object({
  member: MemberSchema,
  occurrences: z.array(ChoreOccurrenceSchema),
});

export const ChoreListSchema = z.object({
  householdId: OpaqueIdSchema,
  localDate: LocalDateSchema,
  displayDate: z.string().min(1).max(100),
  completedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  groups: z.array(ChoreGroupSchema),
});

export const CommandRequestSchema = z.object({
  requestId: OpaqueIdSchema,
});

export const HomeActionIdSchema = z.enum(['evening-mode', 'goodnight', 'screen-off']);

export const HomeActionSchema = z.object({
  id: HomeActionIdSchema,
  label: z.string().min(1).max(80),
  description: z.string().min(1).max(160),
  icon: z.enum(['sun', 'moon', 'power']),
  confirmation: z.enum(['none', 'explicit']),
  enabled: z.boolean(),
  unavailableReason: z.string().min(1).max(180).nullable(),
});

export const PowerSafetyDecisionSchema = z.object({
  automaticScreenOffAllowed: z.boolean(),
  reason: z.enum([
    'clear',
    'presence-detected',
    'protected-media-active',
    'hearth-not-foreground',
    'state-unavailable',
  ]),
});

export const HomeStatusSchema = z.object({
  householdId: OpaqueIdSchema,
  roomLabel: z.string().min(1).max(80),
  generatedAt: TimestampSchema,
  freshness: z.enum(['current', 'stale']),
  statusMessage: z.string().min(1).max(180).nullable(),
  integration: IntegrationStateSchema,
  occupancy: z.enum(['occupied', 'clear', 'unknown']),
  televisionPower: z.enum(['on', 'standby', 'unknown']),
  protectedMediaActive: z.boolean(),
  powerProtectionLabel: z.string().min(1).max(100),
  automaticScreenOff: PowerSafetyDecisionSchema,
  actions: z.array(HomeActionSchema),
});

export const ExecuteHomeActionRequestSchema = CommandRequestSchema.extend({
  confirmed: z.boolean(),
});

export const AssistDaySummaryRequestSchema = CommandRequestSchema.extend({
  date: LocalDateSchema,
});

export const AssistChoreCompletionRequestSchema = CommandRequestSchema.extend({
  date: LocalDateSchema,
  memberName: z.string().trim().min(1).max(80),
  choreTitle: z.string().trim().min(1).max(140),
});

export const ChoreRepeatSchema = z.enum(['daily', 'weekdays', 'weekly']);

export const ChoreTemplateSchema = z.object({
  id: OpaqueIdSchema,
  title: z.string().min(1).max(140),
  description: z.string().max(320).nullable(),
  assignee: MemberSchema,
  routineLabel: z.string().min(1).max(80),
  repeat: ChoreRepeatSchema,
  repeatDays: z.array(z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])).min(1),
  activeFrom: LocalDateSchema,
  archived: z.boolean(),
});

export const ChoreTemplateListSchema = z.object({
  householdId: OpaqueIdSchema,
  templates: z.array(ChoreTemplateSchema),
});

const ChoreTemplateFieldsSchema = z.object({
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().max(320).nullable(),
  assigneeId: OpaqueIdSchema,
  routineLabel: z.string().trim().min(1).max(80),
  repeat: ChoreRepeatSchema,
  repeatDays: z.array(z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])).min(1),
  activeFrom: LocalDateSchema,
});

export const CreateChoreTemplateRequestSchema = CommandRequestSchema.extend(
  ChoreTemplateFieldsSchema.shape,
);
export const UpdateChoreTemplateRequestSchema = CommandRequestSchema.extend(
  ChoreTemplateFieldsSchema.shape,
);

export const ChoreTemplateCommandResultSchema = z.object({
  template: ChoreTemplateSchema,
  audit: z.lazy(() => AuditSummarySchema),
  replayed: z.boolean(),
});

export const HouseholdListTypeSchema = z.enum(['grocery', 'packing', 'shopping', 'wish', 'custom']);

export const ListItemSchema = z.object({
  id: OpaqueIdSchema,
  text: z.string().min(1).max(160),
  quantity: z.string().max(40).nullable(),
  checked: z.boolean(),
  checkedAt: TimestampSchema.nullable(),
  checkedByActorId: OpaqueIdSchema.nullable(),
});

export const HouseholdListSchema = z.object({
  id: OpaqueIdSchema,
  name: z.string().min(1).max(100),
  type: HouseholdListTypeSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  remainingCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  items: z.array(ListItemSchema),
});

export const HouseholdListsSchema = z.object({
  householdId: OpaqueIdSchema,
  lists: z.array(HouseholdListSchema),
});

export const AddListItemRequestSchema = CommandRequestSchema.extend({
  text: z.string().trim().min(1).max(160),
  quantity: z.string().trim().max(40).nullable(),
});

export const AssistAddListItemRequestSchema = AddListItemRequestSchema.extend({
  listName: z.string().trim().min(1).max(100),
});

export const ListItemCommandResultSchema = z.object({
  list: HouseholdListSchema,
  item: ListItemSchema,
  audit: z.lazy(() => AuditSummarySchema),
  replayed: z.boolean(),
});

export const MealSlotSchema = z.enum(['breakfast', 'lunch', 'dinner']);

export const SavedMealSchema = z.object({
  id: OpaqueIdSchema,
  name: z.string().min(1).max(140),
  description: z.string().max(320).nullable(),
  favourite: z.boolean(),
});

export const MealPlanEntrySchema = z.object({
  id: OpaqueIdSchema,
  localDate: LocalDateSchema,
  slot: MealSlotSchema,
  mealName: z.string().min(1).max(160),
  savedMealId: OpaqueIdSchema.nullable(),
  note: z.string().max(240).nullable(),
});

export const MealPlanDaySchema = z.object({
  localDate: LocalDateSchema,
  dayLabel: z.string().min(1).max(20),
  dateLabel: z.string().min(1).max(20),
  isToday: z.boolean(),
  entries: z.array(MealPlanEntrySchema),
});

export const MealPlanSchema = z.object({
  householdId: OpaqueIdSchema,
  startDate: LocalDateSchema,
  endDate: LocalDateSchema,
  displayRange: z.string().min(1).max(80),
  days: z.array(MealPlanDaySchema).length(7),
  savedMeals: z.array(SavedMealSchema),
});

export const UpsertMealPlanRequestSchema = CommandRequestSchema.extend({
  localDate: LocalDateSchema,
  slot: MealSlotSchema,
  mealName: z.string().trim().min(1).max(160),
  savedMealId: OpaqueIdSchema.nullable(),
  note: z.string().trim().max(240).nullable(),
});

export const CreateSavedMealRequestSchema = CommandRequestSchema.extend({
  name: z.string().trim().min(1).max(140),
  description: z.string().trim().max(320).nullable(),
});

export const SavedMealCommandResultSchema = z.object({
  savedMeal: SavedMealSchema,
  audit: z.lazy(() => AuditSummarySchema),
  replayed: z.boolean(),
});

export const MealCommandResultSchema = z.object({
  entry: MealPlanEntrySchema,
  audit: z.lazy(() => AuditSummarySchema),
  replayed: z.boolean(),
});

export const PaydaySchema = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

export const PocketMoneyPaymentSchema = z
  .object({
    id: OpaqueIdSchema,
    memberId: OpaqueIdSchema,
    weekStart: LocalDateSchema,
    weekEnd: LocalDateSchema,
    scheduledCount: z.number().int().nonnegative(),
    completedCount: z.number().int().nonnegative(),
    completionPercentage: z.number().int().min(0).max(100),
    amountCents: z.number().int().nonnegative(),
    paidAt: TimestampSchema,
    paidByActorId: OpaqueIdSchema,
    source: z.enum(['companion', 'system']),
  })
  .refine((payment) => payment.completedCount <= payment.scheduledCount, {
    message: 'Completed chores cannot exceed scheduled chores.',
    path: ['completedCount'],
  });

export const PocketMoneyChildSummarySchema = z
  .object({
    member: MemberSchema,
    weeklyAmountCents: z.number().int().positive().max(100_000).nullable(),
    currency: z.literal('AUD'),
    payday: PaydaySchema.nullable(),
    scheduledCount: z.number().int().nonnegative(),
    completedCount: z.number().int().nonnegative(),
    completionPercentage: z.number().int().min(0).max(100),
    earnedAmountCents: z.number().int().nonnegative().nullable(),
    status: z.enum(['not-configured', 'building', 'ready', 'paid']),
    payment: PocketMoneyPaymentSchema.nullable(),
  })
  .refine((summary) => summary.completedCount <= summary.scheduledCount, {
    message: 'Completed chores cannot exceed scheduled chores.',
    path: ['completedCount'],
  });

export const PocketMoneyOverviewSchema = z.object({
  householdId: OpaqueIdSchema,
  weekStart: LocalDateSchema,
  weekEnd: LocalDateSchema,
  asOfDate: LocalDateSchema,
  displayRange: z.string().min(1).max(80),
  children: z.array(PocketMoneyChildSummarySchema),
});

export const UpdatePocketMoneySettingsRequestSchema = CommandRequestSchema.extend({
  weeklyAmountCents: z.number().int().min(100).max(100_000),
  payday: PaydaySchema,
  weekStart: LocalDateSchema,
  asOfDate: LocalDateSchema,
});

export const RecordPocketMoneyPaymentRequestSchema = CommandRequestSchema.extend({
  memberId: OpaqueIdSchema,
  weekStart: LocalDateSchema,
  asOfDate: LocalDateSchema,
});

export const PocketMoneySettingsCommandResultSchema = z.object({
  child: PocketMoneyChildSummarySchema,
  audit: z.lazy(() => AuditSummarySchema),
  replayed: z.boolean(),
});

export const PocketMoneyPaymentCommandResultSchema = z.object({
  payment: PocketMoneyPaymentSchema,
  child: PocketMoneyChildSummarySchema,
  audit: z.lazy(() => AuditSummarySchema),
  replayed: z.boolean(),
});

/** @deprecated Retained only so historical reward records remain readable. */
export const RewardDefinitionSchema = z.object({
  id: OpaqueIdSchema,
  name: z.string().min(1).max(140),
  description: z.string().max(320).nullable(),
  cost: z.number().int().positive().max(100_000),
  approvalRequired: z.boolean(),
  archived: z.boolean(),
});

export const RewardLedgerEntrySchema = z.object({
  id: OpaqueIdSchema,
  member: MemberSchema,
  delta: z
    .number()
    .int()
    .refine((value) => value !== 0),
  reason: z.string().min(1).max(180),
  rewardId: OpaqueIdSchema.nullable(),
  relatedChoreOccurrenceId: OpaqueIdSchema.nullable(),
  reversalOfEntryId: OpaqueIdSchema.nullable(),
  occurredAt: TimestampSchema,
  actorId: OpaqueIdSchema,
  source: z.enum(['tv', 'companion', 'voice', 'automation', 'system']),
});

export const MemberRewardBalanceSchema = z.object({
  member: MemberSchema,
  balance: z.number().int(),
});

export const RewardsOverviewSchema = z.object({
  householdId: OpaqueIdSchema,
  balances: z.array(MemberRewardBalanceSchema),
  definitions: z.array(RewardDefinitionSchema),
  ledger: z.array(RewardLedgerEntrySchema),
});

export const CreateRewardDefinitionRequestSchema = CommandRequestSchema.extend({
  name: z.string().trim().min(1).max(140),
  description: z.string().trim().max(320).nullable(),
  cost: z.number().int().positive().max(100_000),
  approvalRequired: z.boolean(),
});

export const RewardDefinitionCommandResultSchema = z.object({
  definition: RewardDefinitionSchema,
  audit: z.lazy(() => AuditSummarySchema),
  replayed: z.boolean(),
});

export const AdjustRewardRequestSchema = CommandRequestSchema.extend({
  memberId: OpaqueIdSchema,
  delta: z
    .number()
    .int()
    .min(-100_000)
    .max(100_000)
    .refine((value) => value !== 0),
  reason: z.string().trim().min(1).max(180),
  rewardId: OpaqueIdSchema.nullable(),
});

export const ReverseRewardEntryRequestSchema = CommandRequestSchema;

export const RewardCommandResultSchema = z.object({
  entry: RewardLedgerEntrySchema,
  balances: z.array(MemberRewardBalanceSchema),
  audit: z.lazy(() => AuditSummarySchema),
  replayed: z.boolean(),
});

export const CompletionReversalRequestSchema = CommandRequestSchema.extend({
  completionId: OpaqueIdSchema,
});

export const AuditSummarySchema = z.object({
  id: OpaqueIdSchema,
  actorType: z.enum(['member', 'device', 'service', 'system']),
  actorId: OpaqueIdSchema,
  source: z.enum(['tv', 'companion', 'voice', 'automation', 'sync', 'system']),
  action: z.enum([
    'chore.complete',
    'chore.undo',
    'chore.skip',
    'household.update',
    'member.create',
    'member.update',
    'member.avatar.update',
    'member.avatar.reset',
    'member.archive',
    'device.pair',
    'device.revoke',
    'chore-template.create',
    'chore-template.update',
    'list.item.add',
    'list.item.complete',
    'list.item.undo',
    'meal.plan',
    'saved-meal.create',
    'reward.definition.create',
    'reward.adjust',
    'reward.reverse',
    'reward.award',
    'pocket-money.settings.update',
    'pocket-money.payment.record',
    'calendar.connection.save',
    'calendar.connection.remove',
    'auth.passkey.register',
    'home.action.execute',
    'notice.create',
    'notice.update',
    'notice.archive',
    'today.sections.update',
  ]),
  targetId: OpaqueIdSchema,
  occurredAt: TimestampSchema,
  result: z.enum(['succeeded', 'rejected', 'failed', 'reversed']),
});

const NoticeFieldsSchema = z.object({
  message: HouseholdNoticeSchema.shape.message,
  priority: HouseholdNoticeSchema.shape.priority,
  startsAt: TimestampSchema,
  expiresAt: TimestampSchema.nullable(),
});

function validateNoticeWindow(
  value: z.infer<typeof NoticeFieldsSchema>,
  context: z.core.$RefinementCtx,
) {
  if (value.expiresAt !== null && Date.parse(value.expiresAt) <= Date.parse(value.startsAt)) {
    context.addIssue({
      code: 'custom',
      message: 'The notice expiry must be after its start time.',
      path: ['expiresAt'],
    });
  }
}

export const CreateHouseholdNoticeRequestSchema = CommandRequestSchema.extend(
  NoticeFieldsSchema.shape,
).superRefine(validateNoticeWindow);
export const UpdateHouseholdNoticeRequestSchema = CreateHouseholdNoticeRequestSchema;
export const ArchiveHouseholdNoticeRequestSchema = CommandRequestSchema;
export const UpdateTodaySectionsRequestSchema = CommandRequestSchema.extend(
  TodaySectionVisibilitySchema.shape,
);

export const TodayConfigurationCommandResultSchema = z.object({
  configuration: TodayConfigurationSchema,
  audit: AuditSummarySchema,
  replayed: z.boolean(),
});

export const ChoreCommandResultSchema = z.object({
  occurrence: ChoreOccurrenceSchema,
  completionId: OpaqueIdSchema,
  audit: AuditSummarySchema,
  replayed: z.boolean(),
});

export const ChoreSkipResultSchema = z.object({
  occurrence: ChoreOccurrenceSchema,
  audit: AuditSummarySchema,
  replayed: z.boolean(),
});

export const HomeActionResultSchema = z.object({
  actionId: HomeActionIdSchema,
  label: z.string().min(1).max(80),
  message: z.string().min(1).max(180),
  executedAt: TimestampSchema,
  audit: AuditSummarySchema,
  replayed: z.boolean(),
});

export const AssistDaySummaryResultSchema = z.object({
  requestId: OpaqueIdSchema,
  date: LocalDateSchema,
  speech: z.string().min(1).max(480),
});

export const AssistChoreCompletionResultSchema = z.object({
  speech: z.string().min(1).max(240),
  command: ChoreCommandResultSchema,
});

export const RealtimeEventSchema = z.object({
  id: OpaqueIdSchema,
  kind: z.enum([
    'chore.changed',
    'household.changed',
    'list.changed',
    'meal.changed',
    'reward.changed',
    'pocket-money.changed',
    'chore-template.changed',
    'home.changed',
    'calendar.changed',
    'today.changed',
  ]),
  householdId: OpaqueIdSchema,
  targetId: OpaqueIdSchema,
  occurredAt: TimestampSchema,
});

export const ApiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'NOT_FOUND',
  'CONFLICT',
  'FORBIDDEN',
  'OFFLINE',
  'INTEGRATION_UNAVAILABLE',
  'COMMAND_FAILED',
  'CONFIRMATION_REQUIRED',
  'AMBIGUOUS_TARGET',
  'DUPLICATE_ITEM',
]);

export const AdminActorSchema = z.object({
  id: OpaqueIdSchema,
  displayName: z.string().min(1).max(80),
  role: z.enum(['adult', 'child']),
  capabilities: z.array(CapabilitySchema),
});

export const PairedDeviceSchema = z.object({
  id: OpaqueIdSchema,
  name: z.string().min(1).max(80),
  type: z.literal('television'),
  status: z.enum(['connected', 'revoked']),
  scopes: z.array(z.enum(['household.read', 'chores.complete', 'lists.change', 'home.control'])),
  pairedAt: TimestampSchema,
  lastSeenAt: TimestampSchema.nullable(),
  revokedAt: TimestampSchema.nullable(),
});

export const PairingCodeSchema = z
  .string()
  .length(6)
  .regex(/^[A-Z0-9]{6}$/, 'Expected a six-character pairing code');

export const PairingRequestSchema = z.object({
  id: OpaqueIdSchema,
  requestId: OpaqueIdSchema,
  code: PairingCodeSchema,
  deviceName: z.string().min(1).max(80),
  status: z.enum(['pending', 'approved', 'expired', 'cancelled']),
  expiresAt: TimestampSchema,
  approvedDeviceId: OpaqueIdSchema.nullable(),
});

export const AdminOverviewSchema = z.object({
  household: HouseholdSummarySchema,
  actor: AdminActorSchema,
  pairedDevices: z.array(PairedDeviceSchema),
  pendingPairings: z.array(PairingRequestSchema),
  integrations: z.array(IntegrationStateSchema),
  recentAudit: z.array(AuditSummarySchema),
  localOnly: z.literal(true),
});

export const CalendarConnectionCalendarSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  owner: MemberSchema.nullable(),
});

export const CalendarConnectionSettingsSchema = z.object({
  id: OpaqueIdSchema,
  provider: z.literal('caldav'),
  label: z.string().trim().min(1).max(80),
  serverHost: z.string().trim().min(1).max(253),
  accountHint: z.string().trim().min(1).max(80),
  status: z.enum(['ready', 'needs-attention']),
  readOnly: z.literal(true),
  calendars: z.array(CalendarConnectionCalendarSchema).min(1).max(40),
  lastCheckedAt: TimestampSchema,
  lastSuccessfulAt: TimestampSchema.nullable(),
  message: z.string().trim().min(1).max(180),
});

const HttpsCalendarServerSchema = z
  .url()
  .max(500)
  .refine((value) => /^https:\/\//i.test(value), 'Expected an HTTPS URL');

export const CalendarConnectionTestRequestSchema = z
  .object({
    serverUrl: HttpsCalendarServerSchema,
    username: z.string().trim().min(1).max(320),
    appPassword: z.string().min(4).max(512),
  })
  .strict();

export const CalendarConnectionOptionSchema = z.object({
  id: OpaqueIdSchema,
  displayName: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const CalendarConnectionTestResultSchema = z.object({
  testId: OpaqueIdSchema,
  provider: z.literal('caldav'),
  serverHost: z.string().trim().min(1).max(253),
  accountHint: z.string().trim().min(1).max(80),
  availableCalendars: z.array(CalendarConnectionOptionSchema).min(1).max(40),
  expiresAt: TimestampSchema,
});

const SelectedCalendarSchema = z.object({
  calendarId: OpaqueIdSchema,
  ownerMemberId: OpaqueIdSchema.nullable(),
});

export const SaveCalendarConnectionRequestSchema = CommandRequestSchema.extend({
  testId: OpaqueIdSchema,
  label: z.string().trim().min(1).max(80),
  calendars: z.array(SelectedCalendarSchema).min(1).max(40),
}).superRefine((value, context) => {
  const ids = value.calendars.map(({ calendarId }) => calendarId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: 'custom',
      path: ['calendars'],
      message: 'Choose each calendar only once',
    });
  }
});

export const RemoveCalendarConnectionRequestSchema = CommandRequestSchema;

export const CalendarConnectionCommandResultSchema = z.object({
  connection: CalendarConnectionSettingsSchema.nullable(),
  audit: AuditSummarySchema,
  replayed: z.boolean(),
});

export const UpdateHouseholdRequestSchema = CommandRequestSchema.extend({
  name: z.string().trim().min(1).max(100),
  timezone: TimezoneSchema,
});

const MemberFieldsSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  role: z.enum(['adult', 'child']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  administrator: z.boolean(),
});

function validateMemberPermissions(
  value: z.infer<typeof MemberFieldsSchema>,
  context: z.core.$RefinementCtx,
) {
  if (value.administrator && value.role !== 'adult') {
    context.addIssue({
      code: 'custom',
      message: 'Only an adult can be a household administrator.',
      path: ['administrator'],
    });
  }
}

export const CreateMemberRequestSchema = CommandRequestSchema.extend(
  MemberFieldsSchema.shape,
).superRefine(validateMemberPermissions);
export const UpdateMemberRequestSchema = CommandRequestSchema.extend(
  MemberFieldsSchema.shape,
).superRefine(validateMemberPermissions);
export const ArchiveMemberRequestSchema = CommandRequestSchema;

export const UpdateMemberAvatarRequestSchema = CommandRequestSchema.extend({
  mimeType: z.literal('image/jpeg'),
  dataBase64: z
    .string()
    .min(4)
    .max(1_400_000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Expected base64-encoded image data')
    .refine((value) => value.length % 4 === 0, 'Expected complete base64-encoded image data'),
});
export const ResetMemberAvatarRequestSchema = CommandRequestSchema;

export const MemberAvatarCommandResultSchema = z.object({
  member: MemberSchema,
  audit: AuditSummarySchema,
  replayed: z.boolean(),
});

export const CreatePairingRequestSchema = CommandRequestSchema.extend({
  deviceName: z.string().trim().min(1).max(80),
});

export const PairingSecretSchema = z
  .string()
  .min(43)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'Expected a base64url pairing secret');

export const CreateTvPairingSessionRequestSchema = CreatePairingRequestSchema.extend({
  applicationVersion: z.string().trim().min(1).max(40),
  pairingSecret: PairingSecretSchema,
});

export const TvPairingSessionSchema = z.object({
  pairing: PairingRequestSchema,
});

export const ExchangeTvPairingRequestSchema = CommandRequestSchema.extend({
  pairingSecret: PairingSecretSchema,
});

export const TvDeviceSessionSchema = z.object({
  deviceId: OpaqueIdSchema,
  householdId: OpaqueIdSchema,
  deviceName: z.string().min(1).max(80),
  scopes: PairedDeviceSchema.shape.scopes,
  pairedAt: TimestampSchema,
});

export const ApprovePairingRequestSchema = CommandRequestSchema.extend({
  code: PairingCodeSchema,
});

export const RevokeDeviceRequestSchema = CommandRequestSchema;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string().min(1).max(240),
    retryable: z.boolean(),
    requestId: OpaqueIdSchema.nullable(),
  }),
});

export const DemoScenarioSchema = z.enum([
  'healthy',
  'loading',
  'empty',
  'stale',
  'unavailable',
  'permission',
  'fail-next',
  'protected-media',
]);

export const DemoScenarioRequestSchema = z.object({ scenario: DemoScenarioSchema });

export type Member = z.infer<typeof MemberSchema>;
export type Capability = z.infer<typeof CapabilitySchema>;
export type HouseholdSummary = z.infer<typeof HouseholdSummarySchema>;
export type RuntimeMode = z.infer<typeof RuntimeModeSchema>;
export type RuntimeHousehold = z.infer<typeof RuntimeHouseholdSchema>;
export type RuntimeContext = z.infer<typeof RuntimeContextSchema>;
export type PasskeyAuthStatus = z.infer<typeof PasskeyAuthStatusSchema>;
export type FirstUsePasskeyOptionsRequest = z.infer<typeof FirstUsePasskeyOptionsRequestSchema>;
export type PasskeyCeremonyOptions = z.infer<typeof PasskeyCeremonyOptionsSchema>;
export type PasskeyCeremonyVerificationRequest = z.infer<
  typeof PasskeyCeremonyVerificationRequestSchema
>;
export type PasskeySession = z.infer<typeof PasskeySessionSchema>;
export type PasskeySignOutResult = z.infer<typeof PasskeySignOutResultSchema>;
export type IntegrationState = z.infer<typeof IntegrationStateSchema>;
export type CalendarSource = z.infer<typeof CalendarSourceSchema>;
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;
export type ChoreState = z.infer<typeof ChoreStateSchema>;
export type ChoreOccurrence = z.infer<typeof ChoreOccurrenceSchema>;
export type TodaySummary = z.infer<typeof TodaySummarySchema>;
export type TodaySectionVisibility = z.infer<typeof TodaySectionVisibilitySchema>;
export type HouseholdNotice = z.infer<typeof HouseholdNoticeSchema>;
export type TodayConfiguration = z.infer<typeof TodayConfigurationSchema>;
export type CreateHouseholdNoticeRequest = z.infer<typeof CreateHouseholdNoticeRequestSchema>;
export type UpdateHouseholdNoticeRequest = z.infer<typeof UpdateHouseholdNoticeRequestSchema>;
export type UpdateTodaySectionsRequest = z.infer<typeof UpdateTodaySectionsRequestSchema>;
export type TodayConfigurationCommandResult = z.infer<typeof TodayConfigurationCommandResultSchema>;
export type TodayPhotoSummary = z.infer<typeof TodayPhotoSummarySchema>;
export type PhotoOrientation = z.infer<typeof PhotoOrientationSchema>;
export type PhotoAsset = z.infer<typeof PhotoAssetSchema>;
export type PhotoSourceSummary = z.infer<typeof PhotoSourceSummarySchema>;
export type PhotoCollection = z.infer<typeof PhotoCollectionSchema>;
export type PhotoGallery = z.infer<typeof PhotoGallerySchema>;
export type DailyForecast = z.infer<typeof DailyForecastSchema>;
export type WeekDay = z.infer<typeof WeekDaySchema>;
export type WeekSchedule = z.infer<typeof WeekScheduleSchema>;
export type MonthKey = z.infer<typeof MonthKeySchema>;
export type MonthDay = z.infer<typeof MonthDaySchema>;
export type MonthSchedule = z.infer<typeof MonthScheduleSchema>;
export type ChoreGroup = z.infer<typeof ChoreGroupSchema>;
export type ChoreList = z.infer<typeof ChoreListSchema>;
export type HomeActionId = z.infer<typeof HomeActionIdSchema>;
export type HomeAction = z.infer<typeof HomeActionSchema>;
export type PowerSafetyDecision = z.infer<typeof PowerSafetyDecisionSchema>;
export type HomeStatus = z.infer<typeof HomeStatusSchema>;
export type ExecuteHomeActionRequest = z.infer<typeof ExecuteHomeActionRequestSchema>;
export type AssistDaySummaryRequest = z.infer<typeof AssistDaySummaryRequestSchema>;
export type AssistChoreCompletionRequest = z.infer<typeof AssistChoreCompletionRequestSchema>;
export type ChoreRepeat = z.infer<typeof ChoreRepeatSchema>;
export type ChoreTemplate = z.infer<typeof ChoreTemplateSchema>;
export type ChoreTemplateList = z.infer<typeof ChoreTemplateListSchema>;
export type CreateChoreTemplateRequest = z.infer<typeof CreateChoreTemplateRequestSchema>;
export type UpdateChoreTemplateRequest = z.infer<typeof UpdateChoreTemplateRequestSchema>;
export type ChoreTemplateCommandResult = z.infer<typeof ChoreTemplateCommandResultSchema>;
export type HouseholdListType = z.infer<typeof HouseholdListTypeSchema>;
export type ListItem = z.infer<typeof ListItemSchema>;
export type HouseholdList = z.infer<typeof HouseholdListSchema>;
export type HouseholdLists = z.infer<typeof HouseholdListsSchema>;
export type AddListItemRequest = z.infer<typeof AddListItemRequestSchema>;
export type AssistAddListItemRequest = z.infer<typeof AssistAddListItemRequestSchema>;
export type ListItemCommandResult = z.infer<typeof ListItemCommandResultSchema>;
export type MealSlot = z.infer<typeof MealSlotSchema>;
export type SavedMeal = z.infer<typeof SavedMealSchema>;
export type MealPlanEntry = z.infer<typeof MealPlanEntrySchema>;
export type MealPlanDay = z.infer<typeof MealPlanDaySchema>;
export type MealPlan = z.infer<typeof MealPlanSchema>;
export type UpsertMealPlanRequest = z.infer<typeof UpsertMealPlanRequestSchema>;
export type CreateSavedMealRequest = z.infer<typeof CreateSavedMealRequestSchema>;
export type SavedMealCommandResult = z.infer<typeof SavedMealCommandResultSchema>;
export type MealCommandResult = z.infer<typeof MealCommandResultSchema>;
export type Payday = z.infer<typeof PaydaySchema>;
export type PocketMoneyPayment = z.infer<typeof PocketMoneyPaymentSchema>;
export type PocketMoneyChildSummary = z.infer<typeof PocketMoneyChildSummarySchema>;
export type PocketMoneyOverview = z.infer<typeof PocketMoneyOverviewSchema>;
export type UpdatePocketMoneySettingsRequest = z.infer<
  typeof UpdatePocketMoneySettingsRequestSchema
>;
export type RecordPocketMoneyPaymentRequest = z.infer<typeof RecordPocketMoneyPaymentRequestSchema>;
export type PocketMoneySettingsCommandResult = z.infer<
  typeof PocketMoneySettingsCommandResultSchema
>;
export type PocketMoneyPaymentCommandResult = z.infer<typeof PocketMoneyPaymentCommandResultSchema>;
export type RewardDefinition = z.infer<typeof RewardDefinitionSchema>;
export type RewardLedgerEntry = z.infer<typeof RewardLedgerEntrySchema>;
export type MemberRewardBalance = z.infer<typeof MemberRewardBalanceSchema>;
export type RewardsOverview = z.infer<typeof RewardsOverviewSchema>;
export type CreateRewardDefinitionRequest = z.infer<typeof CreateRewardDefinitionRequestSchema>;
export type RewardDefinitionCommandResult = z.infer<typeof RewardDefinitionCommandResultSchema>;
export type AdjustRewardRequest = z.infer<typeof AdjustRewardRequestSchema>;
export type ReverseRewardEntryRequest = z.infer<typeof ReverseRewardEntryRequestSchema>;
export type RewardCommandResult = z.infer<typeof RewardCommandResultSchema>;
export type CommandRequest = z.infer<typeof CommandRequestSchema>;
export type CompletionReversalRequest = z.infer<typeof CompletionReversalRequestSchema>;
export type AuditSummary = z.infer<typeof AuditSummarySchema>;
export type ChoreCommandResult = z.infer<typeof ChoreCommandResultSchema>;
export type ChoreSkipResult = z.infer<typeof ChoreSkipResultSchema>;
export type HomeActionResult = z.infer<typeof HomeActionResultSchema>;
export type AssistDaySummaryResult = z.infer<typeof AssistDaySummaryResultSchema>;
export type AssistChoreCompletionResult = z.infer<typeof AssistChoreCompletionResultSchema>;
export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type DemoScenario = z.infer<typeof DemoScenarioSchema>;
export type AdminActor = z.infer<typeof AdminActorSchema>;
export type PairedDevice = z.infer<typeof PairedDeviceSchema>;
export type PairingRequest = z.infer<typeof PairingRequestSchema>;
export type AdminOverview = z.infer<typeof AdminOverviewSchema>;
export type CalendarConnectionCalendar = z.infer<typeof CalendarConnectionCalendarSchema>;
export type CalendarConnectionSettings = z.infer<typeof CalendarConnectionSettingsSchema>;
export type CalendarConnectionTestRequest = z.infer<typeof CalendarConnectionTestRequestSchema>;
export type CalendarConnectionOption = z.infer<typeof CalendarConnectionOptionSchema>;
export type CalendarConnectionTestResult = z.infer<typeof CalendarConnectionTestResultSchema>;
export type SaveCalendarConnectionRequest = z.infer<typeof SaveCalendarConnectionRequestSchema>;
export type RemoveCalendarConnectionRequest = z.infer<typeof RemoveCalendarConnectionRequestSchema>;
export type CalendarConnectionCommandResult = z.infer<typeof CalendarConnectionCommandResultSchema>;
export type UpdateHouseholdRequest = z.infer<typeof UpdateHouseholdRequestSchema>;
export type CreateMemberRequest = z.infer<typeof CreateMemberRequestSchema>;
export type UpdateMemberRequest = z.infer<typeof UpdateMemberRequestSchema>;
export type ArchiveMemberRequest = z.infer<typeof ArchiveMemberRequestSchema>;
export type UpdateMemberAvatarRequest = z.infer<typeof UpdateMemberAvatarRequestSchema>;
export type ResetMemberAvatarRequest = z.infer<typeof ResetMemberAvatarRequestSchema>;
export type MemberAvatarCommandResult = z.infer<typeof MemberAvatarCommandResultSchema>;
export type CreatePairingRequest = z.infer<typeof CreatePairingRequestSchema>;
export type CreateTvPairingSessionRequest = z.infer<typeof CreateTvPairingSessionRequestSchema>;
export type TvPairingSession = z.infer<typeof TvPairingSessionSchema>;
export type ExchangeTvPairingRequest = z.infer<typeof ExchangeTvPairingRequestSchema>;
export type TvDeviceSession = z.infer<typeof TvDeviceSessionSchema>;
export type ApprovePairingRequest = z.infer<typeof ApprovePairingRequestSchema>;
export type RevokeDeviceRequest = z.infer<typeof RevokeDeviceRequestSchema>;
