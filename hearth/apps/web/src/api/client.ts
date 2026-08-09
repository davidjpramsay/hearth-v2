import {
  AdminOverviewSchema,
  ApiErrorSchema,
  CalendarConnectionCommandResultSchema,
  CalendarConnectionSettingsSchema,
  CalendarConnectionTestResultSchema,
  ChoreCommandResultSchema,
  ChoreListSchema,
  ChoreOccurrenceChangeResultSchema,
  ChoreOccurrenceDetailSchema,
  ChoreSkipResultSchema,
  ChoreTemplateCommandResultSchema,
  ChoreTemplateListSchema,
  HouseholdListSettingsSchema,
  HouseholdListsSchema,
  HomeActionResultSchema,
  HomeStatusSchema,
  ListItemCommandResultSchema,
  ListSettingsCommandResultSchema,
  MealCommandResultSchema,
  MealPlanSchema,
  MealPlanWeekCommandResultSchema,
  MemberAvatarCommandResultSchema,
  MemberSchema,
  MonthScheduleSchema,
  PairedDeviceSchema,
  PairingRequestSchema,
  PasskeyAuthStatusSchema,
  PasskeyCeremonyOptionsSchema,
  PasskeySessionSchema,
  PasskeySignOutResultSchema,
  PhotoGallerySchema,
  PhotoSourceIndexStatusSchema,
  PhotoSourceRefreshResultSchema,
  PocketMoneyOverviewSchema,
  PocketMoneyPaymentCommandResultSchema,
  PocketMoneyPaymentVoidCommandResultSchema,
  PocketMoneySettingsCommandResultSchema,
  RuntimeContextSchema,
  SavedMealCommandResultSchema,
  SavedMealLibrarySchema,
  TodaySummarySchema,
  TodayConfigurationCommandResultSchema,
  TodayConfigurationSchema,
  WeekScheduleSchema,
  type AdminOverview,
  type ApiError,
  type CalendarConnectionCommandResult,
  type CalendarConnectionSettings,
  type CalendarConnectionTestResult,
  type ChoreCommandResult,
  type ChoreList,
  type ChoreOccurrenceChangeResult,
  type ChoreOccurrenceDetail,
  type ChoreSkipResult,
  type ChoreTemplateCommandResult,
  type ChoreTemplateList,
  type DemoScenario,
  type HouseholdLists,
  type HouseholdListSettings,
  type HouseholdListType,
  type HomeActionId,
  type HomeActionResult,
  type HomeStatus,
  type ListItemCommandResult,
  type ListSettingsCommandResult,
  type MealCommandResult,
  type MealPlan,
  type MealPlanEntryInput,
  type MealPlanWeekCommandResult,
  type Member,
  type MemberAvatarCommandResult,
  type MonthSchedule,
  type PairedDevice,
  type PairingRequest,
  type FirstUsePasskeyOptionsRequest,
  type PasskeyAuthStatus,
  type PasskeyCeremonyOptions,
  type PasskeySession,
  type PhotoGallery,
  type PhotoSourceIndexStatus,
  type PhotoSourceRefreshResult,
  type Payday,
  type PocketMoneyOverview,
  type PocketMoneyPaymentCommandResult,
  type PocketMoneyPaymentVoidCommandResult,
  type PocketMoneySettingsCommandResult,
  type SavedMealCommandResult,
  type SavedMealLibrary,
  type RuntimeContext,
  type TodaySummary,
  type TodaySectionVisibility,
  type WeekSchedule,
} from '@hearth/shared';
import type { z } from 'zod';

const API_BASE = import.meta.env.VITE_HEARTH_API_BASE ?? '/api/v1';
let runtimeContext: RuntimeContext | null = null;

export class HearthApiError extends Error {
  constructor(readonly payload: ApiError) {
    super(payload.error.message);
    this.name = 'HearthApiError';
  }
}

export const queryKeys = {
  get today() {
    const runtime = getHearthRuntime();
    return [householdId(runtime), 'today', runtime.localDate] as const;
  },
  get weekRoot() {
    return [householdId(getHearthRuntime()), 'week'] as const;
  },
  week: (start = getHearthRuntime().weekStart) =>
    [householdId(getHearthRuntime()), 'week', start] as const,
  month: (month = getHearthRuntime().currentMonth) =>
    [householdId(getHearthRuntime()), 'month', month] as const,
  get chores() {
    const runtime = getHearthRuntime();
    return [householdId(runtime), 'chores', runtime.localDate] as const;
  },
  get home() {
    return [householdId(getHearthRuntime()), 'home'] as const;
  },
  get photos() {
    return [householdId(getHearthRuntime()), 'photos'] as const;
  },
  get photoSource() {
    return [householdId(getHearthRuntime()), 'photo-source'] as const;
  },
  get admin() {
    return [householdId(getHearthRuntime()), 'admin'] as const;
  },
  get todayConfiguration() {
    return [householdId(getHearthRuntime()), 'today-configuration'] as const;
  },
  get calendarConnection() {
    return [householdId(getHearthRuntime()), 'calendar-connection'] as const;
  },
  get lists() {
    return [householdId(getHearthRuntime()), 'lists'] as const;
  },
  get listSettings() {
    return [householdId(getHearthRuntime()), 'list-settings'] as const;
  },
  meals: (startDate = getHearthRuntime().weekStart) =>
    [householdId(getHearthRuntime()), 'meals', startDate] as const,
  get savedMealLibrary() {
    return [householdId(getHearthRuntime()), 'saved-meal-library'] as const;
  },
  get pocketMoneyRoot() {
    return [householdId(getHearthRuntime()), 'pocket-money'] as const;
  },
  pocketMoney: (
    weekStart = getHearthRuntime().weekStart,
    asOfDate = getHearthRuntime().localDate,
  ) => [...queryKeys.pocketMoneyRoot, weekStart, asOfDate] as const,
  get choreTemplates() {
    return [householdId(getHearthRuntime()), 'chore-templates'] as const;
  },
  choreOccurrence: (occurrenceId: string) =>
    [householdId(getHearthRuntime()), 'chore-occurrence', occurrenceId] as const,
};

const demoAdminHeaders = { 'X-Hearth-Demo-Actor': 'member_maya' } as const;

export const hearthApi = {
  get realtimeUrl() {
    return `${householdApiBase()}/events`;
  },
  getRuntime: () => request(`${API_BASE}/runtime`, RuntimeContextSchema),
  getAuthStatus: () => request(`${API_BASE}/auth/status`, PasskeyAuthStatusSchema),
  getFirstUseRegistrationOptions: (input: FirstUsePasskeyOptionsRequest) =>
    request(`${API_BASE}/auth/first-use/registration-options`, PasskeyCeremonyOptionsSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  verifyFirstUseRegistration: (ceremonyId: string, response: Record<string, unknown>) =>
    request(`${API_BASE}/auth/first-use/registration-verifications`, PasskeySessionSchema, {
      method: 'POST',
      body: JSON.stringify({ ceremonyId, response }),
    }),
  getAuthenticationOptions: () =>
    request(`${API_BASE}/auth/authentication-options`, PasskeyCeremonyOptionsSchema, {
      method: 'POST',
    }),
  verifyAuthentication: (ceremonyId: string, response: Record<string, unknown>) =>
    request(`${API_BASE}/auth/authentication-verifications`, PasskeySessionSchema, {
      method: 'POST',
      body: JSON.stringify({ ceremonyId, response }),
    }),
  signOut: () =>
    request(`${API_BASE}/auth/sign-outs`, PasskeySignOutResultSchema, { method: 'POST' }),
  getToday: () =>
    request(`${householdApiBase()}/today?date=${getHearthRuntime().localDate}`, TodaySummarySchema),
  getTodayConfiguration: () =>
    request(`${householdApiBase()}/today-configuration`, TodayConfigurationSchema, {
      headers: demoAdminHeaders,
    }),
  updateTodaySections: (sections: TodaySectionVisibility, requestId: string) =>
    request(`${householdApiBase()}/today-sections`, TodayConfigurationCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId, ...sections }),
    }),
  createNotice: (input: {
    requestId: string;
    message: string;
    priority: 'standard' | 'important';
    startsAt: string;
    expiresAt: string | null;
  }) =>
    request(`${householdApiBase()}/notices`, TodayConfigurationCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  updateNotice: (
    noticeId: string,
    input: {
      requestId: string;
      message: string;
      priority: 'standard' | 'important';
      startsAt: string;
      expiresAt: string | null;
    },
  ) =>
    request(`${householdApiBase()}/notices/${noticeId}`, TodayConfigurationCommandResultSchema, {
      method: 'PATCH',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  archiveNotice: (noticeId: string, requestId: string) =>
    request(
      `${householdApiBase()}/notices/${noticeId}/archives`,
      TodayConfigurationCommandResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId }),
      },
    ),
  getWeek: (start = getHearthRuntime().weekStart) =>
    request(`${householdApiBase()}/week?start=${start}`, WeekScheduleSchema),
  getMonth: (month = getHearthRuntime().currentMonth) =>
    request(`${householdApiBase()}/month?month=${month}`, MonthScheduleSchema),
  getChores: () =>
    request(
      `${householdApiBase()}/chore-occurrences?date=${getHearthRuntime().localDate}`,
      ChoreListSchema,
    ),
  getHome: () => request(`${householdApiBase()}/home`, HomeStatusSchema),
  getPhotos: () => request(`${householdApiBase()}/photos`, PhotoGallerySchema),
  getPhotoSource: (): Promise<PhotoSourceIndexStatus> =>
    request(`${householdApiBase()}/photo-source`, PhotoSourceIndexStatusSchema, {
      headers: demoAdminHeaders,
    }),
  refreshPhotoSource: (requestId: string): Promise<PhotoSourceRefreshResult> =>
    request(`${householdApiBase()}/photo-source/refreshes`, PhotoSourceRefreshResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId }),
    }),
  executeHomeAction: (actionId: HomeActionId, requestId: string, confirmed: boolean) =>
    request(`${householdApiBase()}/home/actions/${actionId}`, HomeActionResultSchema, {
      method: 'POST',
      body: JSON.stringify({ requestId, confirmed }),
    }),
  getLists: () => request(`${householdApiBase()}/lists`, HouseholdListsSchema),
  getListSettings: (): Promise<HouseholdListSettings> =>
    request(`${householdApiBase()}/list-settings`, HouseholdListSettingsSchema, {
      headers: demoAdminHeaders,
    }),
  createList: (input: {
    requestId: string;
    name: string;
    type: HouseholdListType;
    color: string;
  }): Promise<ListSettingsCommandResult> =>
    request(`${householdApiBase()}/lists`, ListSettingsCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  updateList: (
    listId: string,
    input: {
      requestId: string;
      name: string;
      type: HouseholdListType;
      color: string;
    },
  ): Promise<ListSettingsCommandResult> =>
    request(`${householdApiBase()}/lists/${listId}`, ListSettingsCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  archiveList: (listId: string, requestId: string): Promise<ListSettingsCommandResult> =>
    request(`${householdApiBase()}/lists/${listId}/archives`, ListSettingsCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId }),
    }),
  restoreList: (listId: string, requestId: string): Promise<ListSettingsCommandResult> =>
    request(`${householdApiBase()}/lists/${listId}/restorations`, ListSettingsCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId }),
    }),
  reorderLists: (orderedListIds: string[], requestId: string): Promise<ListSettingsCommandResult> =>
    request(`${householdApiBase()}/list-order`, ListSettingsCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId, orderedListIds }),
    }),
  updateListItem: (
    itemId: string,
    input: { requestId: string; text: string; quantity: string | null },
  ): Promise<ListSettingsCommandResult> =>
    request(`${householdApiBase()}/list-items/${itemId}`, ListSettingsCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  archiveListItem: (itemId: string, requestId: string): Promise<ListSettingsCommandResult> =>
    request(
      `${householdApiBase()}/list-items/${itemId}/archives`,
      ListSettingsCommandResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId }),
      },
    ),
  reorderListItems: (
    listId: string,
    orderedItemIds: string[],
    requestId: string,
  ): Promise<ListSettingsCommandResult> =>
    request(`${householdApiBase()}/lists/${listId}/item-order`, ListSettingsCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId, orderedItemIds }),
    }),
  clearCheckedListItems: (listId: string, requestId: string): Promise<ListSettingsCommandResult> =>
    request(
      `${householdApiBase()}/lists/${listId}/checked-item-clears`,
      ListSettingsCommandResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId }),
      },
    ),
  addListItem: (
    listId: string,
    input: { requestId: string; text: string; quantity: string | null },
    source: 'companion' | 'voice' = 'companion',
  ) =>
    request(`${householdApiBase()}/lists/${listId}/items`, ListItemCommandResultSchema, {
      method: 'POST',
      headers:
        source === 'voice'
          ? { ...demoAdminHeaders, 'X-Hearth-Demo-Source': 'voice' }
          : demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  assistAddListItem: (input: {
    requestId: string;
    listName: string;
    text: string;
    quantity: string | null;
  }) =>
    request(`${householdApiBase()}/assist/list-items`, ListItemCommandResultSchema, {
      method: 'POST',
      headers: { ...demoAdminHeaders, 'X-Hearth-Demo-Source': 'voice' },
      body: JSON.stringify(input),
    }),
  completeListItem: (itemId: string, requestId: string, source: 'tv' | 'companion') =>
    request(`${householdApiBase()}/list-items/${itemId}/completions`, ListItemCommandResultSchema, {
      method: 'POST',
      ...(source === 'companion' ? { headers: demoAdminHeaders } : {}),
      body: JSON.stringify({ requestId }),
    }),
  undoListItem: (itemId: string, requestId: string, source: 'tv' | 'companion') =>
    request(
      `${householdApiBase()}/list-items/${itemId}/completion-reversals`,
      ListItemCommandResultSchema,
      {
        method: 'POST',
        ...(source === 'companion' ? { headers: demoAdminHeaders } : {}),
        body: JSON.stringify({ requestId }),
      },
    ),
  getMealPlan: (startDate = getHearthRuntime().weekStart) =>
    request(`${householdApiBase()}/meal-plan?start=${startDate}`, MealPlanSchema),
  upsertMealPlan: (input: {
    requestId: string;
    localDate: string;
    slot: 'breakfast' | 'lunch' | 'dinner';
    mealName: string;
    savedMealId: string | null;
    note: string | null;
  }) =>
    request(`${householdApiBase()}/meal-plan-entries`, MealCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  createSavedMeal: (input: {
    requestId: string;
    name: string;
    description: string | null;
    preparationMinutes: number | null;
    favourite: boolean;
  }) =>
    request(`${householdApiBase()}/saved-meals`, SavedMealCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  getSavedMealLibrary: () =>
    request(`${householdApiBase()}/saved-meal-library`, SavedMealLibrarySchema, {
      headers: demoAdminHeaders,
    }),
  updateSavedMeal: (
    mealId: string,
    input: {
      requestId: string;
      name: string;
      description: string | null;
      preparationMinutes: number | null;
      favourite: boolean;
    },
  ) =>
    request(`${householdApiBase()}/saved-meals/${mealId}`, SavedMealCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  archiveSavedMeal: (mealId: string, requestId: string) =>
    request(`${householdApiBase()}/saved-meals/${mealId}/archives`, SavedMealCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId }),
    }),
  restoreSavedMeal: (mealId: string, requestId: string) =>
    request(
      `${householdApiBase()}/saved-meals/${mealId}/restorations`,
      SavedMealCommandResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId }),
      },
    ),
  updateMealPlanWeek: (input: {
    requestId: string;
    startDate: string;
    entries: MealPlanEntryInput[];
  }) =>
    request(`${householdApiBase()}/meal-plan-weeks`, MealPlanWeekCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  clearMealPlanWeek: (startDate: string, requestId: string) =>
    request(`${householdApiBase()}/meal-plan-week-clears`, MealPlanWeekCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId, startDate }),
    }),
  copyMealPlanWeek: (input: {
    requestId: string;
    sourceStartDate: string;
    targetStartDate: string;
    replaceExisting: boolean;
  }) =>
    request(`${householdApiBase()}/meal-plan-week-copies`, MealPlanWeekCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  getPocketMoney: (
    weekStart = getHearthRuntime().weekStart,
    asOfDate = getHearthRuntime().localDate,
  ) =>
    request(
      `${householdApiBase()}/pocket-money?weekStart=${weekStart}&asOf=${asOfDate}`,
      PocketMoneyOverviewSchema,
    ),
  updatePocketMoneySettings: (
    memberId: string,
    input: {
      requestId: string;
      weeklyAmountCents: number;
      payday: Payday;
      weekStart: string;
      asOfDate: string;
    },
  ) =>
    request(
      `${householdApiBase()}/members/${memberId}/pocket-money-settings`,
      PocketMoneySettingsCommandResultSchema,
      { method: 'PUT', headers: demoAdminHeaders, body: JSON.stringify(input) },
    ),
  recordPocketMoneyPayment: (input: {
    requestId: string;
    memberId: string;
    weekStart: string;
    asOfDate: string;
    amountCents?: number;
    note?: string | null;
  }) =>
    request(`${householdApiBase()}/pocket-money-payments`, PocketMoneyPaymentCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  voidPocketMoneyPayment: (
    paymentId: string,
    input: { requestId: string; asOfDate: string; reason: string },
  ) =>
    request(
      `${householdApiBase()}/pocket-money-payments/${paymentId}/voids`,
      PocketMoneyPaymentVoidCommandResultSchema,
      { method: 'POST', headers: demoAdminHeaders, body: JSON.stringify(input) },
    ),
  getChoreTemplates: () =>
    request(`${householdApiBase()}/chore-templates`, ChoreTemplateListSchema, {
      headers: demoAdminHeaders,
    }),
  createChoreTemplate: (input: ChoreTemplateInput & { requestId: string }) =>
    request(`${householdApiBase()}/chore-templates`, ChoreTemplateCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  updateChoreTemplate: (templateId: string, input: ChoreTemplateInput & { requestId: string }) =>
    request(
      `${householdApiBase()}/chore-templates/${templateId}`,
      ChoreTemplateCommandResultSchema,
      { method: 'PATCH', headers: demoAdminHeaders, body: JSON.stringify(input) },
    ),
  archiveChoreTemplate: (templateId: string, requestId: string) =>
    request(
      `${householdApiBase()}/chore-templates/${templateId}/archivals`,
      ChoreTemplateCommandResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId }),
      },
    ),
  restoreChoreTemplate: (templateId: string, requestId: string, resumeFrom: string) =>
    request(
      `${householdApiBase()}/chore-templates/${templateId}/restorations`,
      ChoreTemplateCommandResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId, resumeFrom }),
      },
    ),
  getAdmin: () =>
    request(`${householdApiBase()}/admin`, AdminOverviewSchema, {
      headers: demoAdminHeaders,
    }),
  getCalendarConnection: () =>
    request(
      `${householdApiBase()}/calendar-connection`,
      CalendarConnectionSettingsSchema.nullable(),
      { headers: demoAdminHeaders },
    ),
  testCalendarConnection: (input: { serverUrl: string; username: string; appPassword: string }) =>
    request(`${householdApiBase()}/calendar-connection-tests`, CalendarConnectionTestResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  saveCalendarConnection: (input: {
    requestId: string;
    testId: string;
    label: string;
    calendars: Array<{ calendarId: string; ownerMemberId: string | null }>;
  }) =>
    request(`${householdApiBase()}/calendar-connection`, CalendarConnectionCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  removeCalendarConnection: (requestId: string) =>
    request(
      `${householdApiBase()}/calendar-connection/removals`,
      CalendarConnectionCommandResultSchema,
      { method: 'POST', headers: demoAdminHeaders, body: JSON.stringify({ requestId }) },
    ),
  updateHousehold: (input: { requestId: string; name: string; timezone: string }) =>
    request(`${householdApiBase()}/settings`, AdminOverviewSchema, {
      method: 'PATCH',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  createMember: (input: {
    requestId: string;
    displayName: string;
    role: 'adult' | 'child';
    color: string;
    administrator: boolean;
  }) =>
    request(`${householdApiBase()}/members`, MemberSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  updateMember: (
    memberId: string,
    input: {
      requestId: string;
      displayName: string;
      role: 'adult' | 'child';
      color: string;
      administrator: boolean;
    },
  ) =>
    request(`${householdApiBase()}/members/${memberId}`, MemberSchema, {
      method: 'PATCH',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  updateMemberAvatar: (memberId: string, requestId: string, dataBase64: string) =>
    request(`${householdApiBase()}/members/${memberId}/avatar`, MemberAvatarCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId, mimeType: 'image/jpeg', dataBase64 }),
    }),
  resetMemberAvatar: (memberId: string, requestId: string) =>
    request(
      `${householdApiBase()}/members/${memberId}/avatar-resets`,
      MemberAvatarCommandResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId }),
      },
    ),
  archiveMember: (memberId: string, requestId: string) =>
    request(`${householdApiBase()}/members/${memberId}/archives`, MemberSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId }),
    }),
  createPairing: (deviceName: string, requestId: string) =>
    request(`${API_BASE}/device-pairing-requests`, PairingRequestSchema, {
      method: 'POST',
      body: JSON.stringify({ deviceName, requestId }),
    }),
  getPairing: (pairingId: string) =>
    request(`${API_BASE}/device-pairing-requests/${pairingId}`, PairingRequestSchema),
  approvePairing: (code: string, requestId: string) =>
    request(`${householdApiBase()}/pairing-approvals`, PairedDeviceSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ code, requestId }),
    }),
  revokeDevice: (deviceId: string, requestId: string) =>
    request(`${householdApiBase()}/paired-devices/${deviceId}/revocations`, PairedDeviceSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId }),
    }),
  completeChore: (occurrenceId: string, requestId: string) =>
    request(
      `${householdApiBase()}/chore-occurrences/${occurrenceId}/completions`,
      ChoreCommandResultSchema,
      { method: 'POST', body: JSON.stringify({ requestId }) },
    ),
  undoChore: (occurrenceId: string, requestId: string, completionId: string) =>
    request(
      `${householdApiBase()}/chore-occurrences/${occurrenceId}/completion-reversals`,
      ChoreCommandResultSchema,
      { method: 'POST', body: JSON.stringify({ requestId, completionId }) },
    ),
  getChoreOccurrenceDetail: (occurrenceId: string) =>
    request(
      `${householdApiBase()}/chore-occurrences/${occurrenceId}`,
      ChoreOccurrenceDetailSchema,
      { headers: demoAdminHeaders },
    ),
  skipChore: (occurrenceId: string, requestId: string, reason: string) =>
    request(
      `${householdApiBase()}/chore-occurrences/${occurrenceId}/skips`,
      ChoreSkipResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId, reason }),
      },
    ),
  excuseChore: (occurrenceId: string, requestId: string, reason: string) =>
    request(
      `${householdApiBase()}/chore-occurrences/${occurrenceId}/excuses`,
      ChoreOccurrenceChangeResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId, reason }),
      },
    ),
  reassignChore: (occurrenceId: string, requestId: string, assigneeId: string, reason: string) =>
    request(
      `${householdApiBase()}/chore-occurrences/${occurrenceId}/reassignments`,
      ChoreOccurrenceChangeResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId, assigneeId, reason }),
      },
    ),
  setScenario: async (scenario: DemoScenario): Promise<void> => {
    await requestRaw(`${API_BASE}/demo/scenario`, {
      method: 'POST',
      body: JSON.stringify({ scenario }),
    });
  },
  resetDemo: async (): Promise<void> => {
    await requestRaw(`${API_BASE}/demo/reset`, { method: 'POST' });
  },
};

export type HearthApi = typeof hearthApi;
export type HearthRuntime = RuntimeContext;
export type HearthAuthStatus = PasskeyAuthStatus;
export type HearthPasskeyCeremonyOptions = PasskeyCeremonyOptions;
export type HearthPasskeySession = PasskeySession;
export type HearthToday = TodaySummary;
export type HearthWeek = WeekSchedule;
export type HearthMonth = MonthSchedule;
export type HearthChores = ChoreList;
export type HearthHome = HomeStatus;
export type HearthPhotos = PhotoGallery;
export type HearthHomeActionResult = HomeActionResult;
export type HearthCommandResult = ChoreCommandResult;
export type HearthSkipResult = ChoreSkipResult;
export type HearthAdmin = AdminOverview;
export type HearthCalendarConnection = CalendarConnectionSettings;
export type HearthCalendarConnectionTestResult = CalendarConnectionTestResult;
export type HearthCalendarConnectionCommandResult = CalendarConnectionCommandResult;
export type HearthMember = Member;
export type HearthMemberAvatarCommandResult = MemberAvatarCommandResult;
export type HearthPairedDevice = PairedDevice;
export type HearthPairingRequest = PairingRequest;
export type HearthLists = HouseholdLists;
export type HearthListCommandResult = ListItemCommandResult;
export type HearthMealPlan = MealPlan;
export type HearthMealCommandResult = MealCommandResult;
export type HearthSavedMealCommandResult = SavedMealCommandResult;
export type HearthSavedMealLibrary = SavedMealLibrary;
export type HearthMealPlanWeekCommandResult = MealPlanWeekCommandResult;
export type HearthPocketMoney = PocketMoneyOverview;
export type HearthPocketMoneySettingsCommandResult = PocketMoneySettingsCommandResult;
export type HearthPocketMoneyPaymentCommandResult = PocketMoneyPaymentCommandResult;
export type HearthPocketMoneyPaymentVoidCommandResult = PocketMoneyPaymentVoidCommandResult;
export type HearthChoreTemplates = ChoreTemplateList;
export type HearthChoreTemplateCommandResult = ChoreTemplateCommandResult;
export type HearthChoreOccurrenceDetail = ChoreOccurrenceDetail;
export type HearthChoreOccurrenceChangeResult = ChoreOccurrenceChangeResult;

export interface ChoreTemplateInput {
  title: string;
  description: string | null;
  assigneeIds: string[];
  routineLabel: string;
  dueTime: string | null;
  repeat: 'once' | 'daily' | 'weekdays' | 'weekly';
  repeatDays: Array<'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'>;
  activeFrom: string;
}

export function configureHearthClient(runtime: RuntimeContext): void {
  runtimeContext = RuntimeContextSchema.parse(runtime);
}

export function getHearthRuntime(): RuntimeContext {
  if (runtimeContext === null) {
    throw new Error('Hearth runtime has not been loaded.');
  }
  return runtimeContext;
}

function householdId(runtime: RuntimeContext): string {
  if (runtime.household === null) {
    throw new Error('Hearth household setup is required.');
  }
  return runtime.household.id;
}

function householdApiBase(): string {
  return `${API_BASE}/households/${householdId(getHearthRuntime())}`;
}

export function createRequestId(prefix: string): string {
  const randomUuid = globalThis.crypto.randomUUID;
  if (typeof randomUuid === 'function') {
    return `request_${prefix}_${randomUuid.call(globalThis.crypto).replaceAll('-', '_')}`;
  }
  const randomWords = globalThis.crypto.getRandomValues(new Uint32Array(4));
  const suffix = Array.from(randomWords, (word) => word.toString(16).padStart(8, '0')).join('_');
  return `request_${prefix}_${suffix}`;
}

async function request<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await requestRaw(url, init);
  return schema.parse(await response.json());
}

async function requestRaw(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const parsed = ApiErrorSchema.safeParse(body);
    if (parsed.success) throw new HearthApiError(parsed.data);
    throw new Error('Hearth could not complete that request.');
  }
  return response;
}
