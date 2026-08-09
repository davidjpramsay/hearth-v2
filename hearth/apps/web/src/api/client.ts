import {
  AdminOverviewSchema,
  ApiErrorSchema,
  CalendarConnectionCommandResultSchema,
  CalendarConnectionSettingsSchema,
  CalendarConnectionTestResultSchema,
  ChoreCommandResultSchema,
  ChoreListSchema,
  ChoreSkipResultSchema,
  ChoreTemplateCommandResultSchema,
  ChoreTemplateListSchema,
  HouseholdListsSchema,
  HomeActionResultSchema,
  HomeStatusSchema,
  ListItemCommandResultSchema,
  MealCommandResultSchema,
  MealPlanSchema,
  MemberAvatarCommandResultSchema,
  MemberSchema,
  MonthScheduleSchema,
  PairedDeviceSchema,
  PairingRequestSchema,
  PhotoGallerySchema,
  PocketMoneyOverviewSchema,
  PocketMoneyPaymentCommandResultSchema,
  PocketMoneySettingsCommandResultSchema,
  SavedMealCommandResultSchema,
  TodaySummarySchema,
  WeekScheduleSchema,
  type AdminOverview,
  type ApiError,
  type CalendarConnectionCommandResult,
  type CalendarConnectionSettings,
  type CalendarConnectionTestResult,
  type ChoreCommandResult,
  type ChoreList,
  type ChoreSkipResult,
  type ChoreTemplateCommandResult,
  type ChoreTemplateList,
  type DemoScenario,
  type HouseholdLists,
  type HomeActionId,
  type HomeActionResult,
  type HomeStatus,
  type ListItemCommandResult,
  type MealCommandResult,
  type MealPlan,
  type Member,
  type MemberAvatarCommandResult,
  type MonthSchedule,
  type PairedDevice,
  type PairingRequest,
  type PhotoGallery,
  type Payday,
  type PocketMoneyOverview,
  type PocketMoneyPaymentCommandResult,
  type PocketMoneySettingsCommandResult,
  type SavedMealCommandResult,
  type TodaySummary,
  type WeekSchedule,
} from '@hearth/shared';
import type { z } from 'zod';

export const DEMO_HOUSEHOLD_ID = 'household_hearth_demo';
export const DEMO_DATE = '2026-08-03';
const API_BASE = import.meta.env.VITE_HEARTH_API_BASE ?? '/api/v1';

export class HearthApiError extends Error {
  constructor(readonly payload: ApiError) {
    super(payload.error.message);
    this.name = 'HearthApiError';
  }
}

export const queryKeys = {
  today: [DEMO_HOUSEHOLD_ID, 'today', DEMO_DATE] as const,
  week: [DEMO_HOUSEHOLD_ID, 'week', DEMO_DATE] as const,
  month: (month = DEMO_DATE.slice(0, 7)) => [DEMO_HOUSEHOLD_ID, 'month', month] as const,
  chores: [DEMO_HOUSEHOLD_ID, 'chores', DEMO_DATE] as const,
  home: [DEMO_HOUSEHOLD_ID, 'home'] as const,
  photos: [DEMO_HOUSEHOLD_ID, 'photos'] as const,
  admin: [DEMO_HOUSEHOLD_ID, 'admin'] as const,
  calendarConnection: [DEMO_HOUSEHOLD_ID, 'calendar-connection'] as const,
  lists: [DEMO_HOUSEHOLD_ID, 'lists'] as const,
  meals: (startDate = DEMO_DATE) => [DEMO_HOUSEHOLD_ID, 'meals', startDate] as const,
  pocketMoney: [DEMO_HOUSEHOLD_ID, 'pocket-money', DEMO_DATE] as const,
  choreTemplates: [DEMO_HOUSEHOLD_ID, 'chore-templates'] as const,
};

const demoAdminHeaders = { 'X-Hearth-Demo-Actor': 'member_maya' } as const;

export const hearthApi = {
  realtimeUrl: `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/events`,
  getToday: () =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/today?date=${DEMO_DATE}`,
      TodaySummarySchema,
    ),
  getWeek: () =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/week?start=${DEMO_DATE}`,
      WeekScheduleSchema,
    ),
  getMonth: (month = DEMO_DATE.slice(0, 7)) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/month?month=${month}`,
      MonthScheduleSchema,
    ),
  getChores: () =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/chore-occurrences?date=${DEMO_DATE}`,
      ChoreListSchema,
    ),
  getHome: () => request(`${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/home`, HomeStatusSchema),
  getPhotos: () =>
    request(`${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/photos`, PhotoGallerySchema),
  executeHomeAction: (actionId: HomeActionId, requestId: string, confirmed: boolean) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/home/actions/${actionId}`,
      HomeActionResultSchema,
      {
        method: 'POST',
        body: JSON.stringify({ requestId, confirmed }),
      },
    ),
  getLists: () =>
    request(`${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/lists`, HouseholdListsSchema),
  addListItem: (
    listId: string,
    input: { requestId: string; text: string; quantity: string | null },
    source: 'companion' | 'voice' = 'companion',
  ) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/lists/${listId}/items`,
      ListItemCommandResultSchema,
      {
        method: 'POST',
        headers:
          source === 'voice'
            ? { ...demoAdminHeaders, 'X-Hearth-Demo-Source': 'voice' }
            : demoAdminHeaders,
        body: JSON.stringify(input),
      },
    ),
  assistAddListItem: (input: {
    requestId: string;
    listName: string;
    text: string;
    quantity: string | null;
  }) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/assist/list-items`,
      ListItemCommandResultSchema,
      {
        method: 'POST',
        headers: { ...demoAdminHeaders, 'X-Hearth-Demo-Source': 'voice' },
        body: JSON.stringify(input),
      },
    ),
  completeListItem: (itemId: string, requestId: string, source: 'tv' | 'companion') =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/list-items/${itemId}/completions`,
      ListItemCommandResultSchema,
      {
        method: 'POST',
        ...(source === 'companion' ? { headers: demoAdminHeaders } : {}),
        body: JSON.stringify({ requestId }),
      },
    ),
  undoListItem: (itemId: string, requestId: string, source: 'tv' | 'companion') =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/list-items/${itemId}/completion-reversals`,
      ListItemCommandResultSchema,
      {
        method: 'POST',
        ...(source === 'companion' ? { headers: demoAdminHeaders } : {}),
        body: JSON.stringify({ requestId }),
      },
    ),
  getMealPlan: (startDate = DEMO_DATE) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/meal-plan?start=${startDate}`,
      MealPlanSchema,
    ),
  upsertMealPlan: (input: {
    requestId: string;
    localDate: string;
    slot: 'breakfast' | 'lunch' | 'dinner';
    mealName: string;
    savedMealId: string | null;
    note: string | null;
  }) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/meal-plan-entries`,
      MealCommandResultSchema,
      {
        method: 'PUT',
        headers: demoAdminHeaders,
        body: JSON.stringify(input),
      },
    ),
  createSavedMeal: (input: { requestId: string; name: string; description: string | null }) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/saved-meals`,
      SavedMealCommandResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify(input),
      },
    ),
  getPocketMoney: () =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/pocket-money?weekStart=${DEMO_DATE}&asOf=${DEMO_DATE}`,
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
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/members/${memberId}/pocket-money-settings`,
      PocketMoneySettingsCommandResultSchema,
      { method: 'PUT', headers: demoAdminHeaders, body: JSON.stringify(input) },
    ),
  recordPocketMoneyPayment: (input: {
    requestId: string;
    memberId: string;
    weekStart: string;
    asOfDate: string;
  }) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/pocket-money-payments`,
      PocketMoneyPaymentCommandResultSchema,
      { method: 'POST', headers: demoAdminHeaders, body: JSON.stringify(input) },
    ),
  getChoreTemplates: () =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/chore-templates`,
      ChoreTemplateListSchema,
      { headers: demoAdminHeaders },
    ),
  createChoreTemplate: (input: ChoreTemplateInput & { requestId: string }) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/chore-templates`,
      ChoreTemplateCommandResultSchema,
      { method: 'POST', headers: demoAdminHeaders, body: JSON.stringify(input) },
    ),
  updateChoreTemplate: (templateId: string, input: ChoreTemplateInput & { requestId: string }) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/chore-templates/${templateId}`,
      ChoreTemplateCommandResultSchema,
      { method: 'PATCH', headers: demoAdminHeaders, body: JSON.stringify(input) },
    ),
  getAdmin: () =>
    request(`${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/admin`, AdminOverviewSchema, {
      headers: demoAdminHeaders,
    }),
  getCalendarConnection: () =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/calendar-connection`,
      CalendarConnectionSettingsSchema.nullable(),
      { headers: demoAdminHeaders },
    ),
  testCalendarConnection: (input: { serverUrl: string; username: string; appPassword: string }) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/calendar-connection-tests`,
      CalendarConnectionTestResultSchema,
      { method: 'POST', headers: demoAdminHeaders, body: JSON.stringify(input) },
    ),
  saveCalendarConnection: (input: {
    requestId: string;
    testId: string;
    label: string;
    calendars: Array<{ calendarId: string; ownerMemberId: string | null }>;
  }) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/calendar-connection`,
      CalendarConnectionCommandResultSchema,
      { method: 'PUT', headers: demoAdminHeaders, body: JSON.stringify(input) },
    ),
  removeCalendarConnection: (requestId: string) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/calendar-connection/removals`,
      CalendarConnectionCommandResultSchema,
      { method: 'POST', headers: demoAdminHeaders, body: JSON.stringify({ requestId }) },
    ),
  updateHousehold: (input: { requestId: string; name: string; timezone: string }) =>
    request(`${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/settings`, AdminOverviewSchema, {
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
    request(`${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/members`, MemberSchema, {
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
    request(`${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/members/${memberId}`, MemberSchema, {
      method: 'PATCH',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  updateMemberAvatar: (memberId: string, requestId: string, dataBase64: string) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/members/${memberId}/avatar`,
      MemberAvatarCommandResultSchema,
      {
        method: 'PUT',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId, mimeType: 'image/jpeg', dataBase64 }),
      },
    ),
  resetMemberAvatar: (memberId: string, requestId: string) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/members/${memberId}/avatar-resets`,
      MemberAvatarCommandResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId }),
      },
    ),
  archiveMember: (memberId: string, requestId: string) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/members/${memberId}/archives`,
      MemberSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId }),
      },
    ),
  createPairing: (deviceName: string, requestId: string) =>
    request(`${API_BASE}/device-pairing-requests`, PairingRequestSchema, {
      method: 'POST',
      body: JSON.stringify({ deviceName, requestId }),
    }),
  getPairing: (pairingId: string) =>
    request(`${API_BASE}/device-pairing-requests/${pairingId}`, PairingRequestSchema),
  approvePairing: (code: string, requestId: string) =>
    request(`${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/pairing-approvals`, PairedDeviceSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ code, requestId }),
    }),
  revokeDevice: (deviceId: string, requestId: string) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/paired-devices/${deviceId}/revocations`,
      PairedDeviceSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId }),
      },
    ),
  completeChore: (occurrenceId: string, requestId: string) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/chore-occurrences/${occurrenceId}/completions`,
      ChoreCommandResultSchema,
      { method: 'POST', body: JSON.stringify({ requestId }) },
    ),
  undoChore: (occurrenceId: string, requestId: string, completionId: string) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/chore-occurrences/${occurrenceId}/completion-reversals`,
      ChoreCommandResultSchema,
      { method: 'POST', body: JSON.stringify({ requestId, completionId }) },
    ),
  skipChore: (occurrenceId: string, requestId: string) =>
    request(
      `${API_BASE}/households/${DEMO_HOUSEHOLD_ID}/chore-occurrences/${occurrenceId}/skips`,
      ChoreSkipResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId }),
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
export type HearthPocketMoney = PocketMoneyOverview;
export type HearthPocketMoneySettingsCommandResult = PocketMoneySettingsCommandResult;
export type HearthPocketMoneyPaymentCommandResult = PocketMoneyPaymentCommandResult;
export type HearthChoreTemplates = ChoreTemplateList;
export type HearthChoreTemplateCommandResult = ChoreTemplateCommandResult;

export interface ChoreTemplateInput {
  title: string;
  description: string | null;
  assigneeId: string;
  routineLabel: string;
  repeat: 'daily' | 'weekdays' | 'weekly';
  repeatDays: Array<'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'>;
  activeFrom: string;
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
