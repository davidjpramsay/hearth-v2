import type {
  CalendarEvent,
  CalendarSource,
  ChoreOccurrence,
  DailyForecast,
  HouseholdSummary,
  IntegrationState,
  Member,
  TodayPhotoSummary,
  WeekDay,
} from '@hearth/shared';

export const DEMO_HOUSEHOLD_ID = 'household_hearth_demo';
export const DEMO_LOCAL_DATE = '2026-08-03';
export const DEMO_NOW = '2026-08-03T07:42:00+08:00';
export const DEMO_TODAY_PHOTO: TodayPhotoSummary = {
  url: '/demo/family-breakfast.webp',
  alt: 'Ezra and Maya set the breakfast table together.',
};

const ezra: Member = {
  id: 'member_ezra',
  displayName: 'Ezra',
  color: '#1668b7',
  avatarUrl: '/demo/ezra.png',
  role: 'child' as const,
  capabilities: ['household.view', 'chores.complete', 'lists.change', 'pocket-money.view'],
};

const maya: Member = {
  id: 'member_maya',
  displayName: 'Maya',
  color: '#c97900',
  avatarUrl: '/demo/maya.png',
  role: 'adult' as const,
  capabilities: [
    'household.admin',
    'household.view',
    'chores.complete',
    'lists.change',
    'meals.change',
    'pocket-money.view',
    'home.control',
  ],
};

export interface DemoSeed {
  household: HouseholdSummary;
  calendars: CalendarSource[];
  events: CalendarEvent[];
  chores: ChoreOccurrence[];
  integrations: IntegrationState[];
  weekDays: WeekDay[];
}

export function createDemoSeed(): DemoSeed {
  const household: HouseholdSummary = {
    id: DEMO_HOUSEHOLD_ID,
    name: 'Hearth Demo Home',
    timezone: 'Australia/Perth',
    locale: 'en-AU',
    mode: 'Morning',
    members: [ezra, maya],
  };
  const calendars: CalendarSource[] = [
    calendar('calendar_ezra', 'Ezra', ezra, ezra.color),
    calendar('calendar_maya', 'Maya', maya, maya.color),
    calendar('calendar_family', 'Family', null, '#3f7251'),
  ];

  const events: CalendarEvent[] = [
    event('event_school_mon', 'School drop-off', ezra, '2026-08-03T08:15:00+08:00', 45),
    event('event_dentist', 'Dentist', maya, '2026-08-03T10:30:00+08:00', 60),
    event('event_football_mon', 'Football training', ezra, '2026-08-03T15:20:00+08:00', 75),
    event('event_library_tue', 'Library', maya, '2026-08-04T14:30:00+08:00', 60),
    event('event_family_dinner_mon', 'Family dinner', null, '2026-08-03T18:30:00+08:00', 90),
    event('event_school_wed', 'School drop-off', ezra, '2026-08-05T08:15:00+08:00', 45),
    event('event_library_wed', 'Library', maya, '2026-08-05T14:30:00+08:00', 60),
    event('event_football_wed', 'Football training', ezra, '2026-08-05T16:45:00+08:00', 75),
    event('event_football_thu', 'Football training', ezra, '2026-08-06T16:45:00+08:00', 75),
    event('event_school_fri', 'School drop-off', ezra, '2026-08-07T08:15:00+08:00', 45),
    event('event_family_dinner_fri', 'Family dinner', null, '2026-08-07T18:30:00+08:00', 90),
    event('event_swimming', 'Swimming', maya, '2026-08-08T10:00:00+08:00', 60),
    event('event_nan_visits', 'Nan visits', null, '2026-08-09T11:00:00+08:00', 180),
    event('event_school_aug10', 'School drop-off', ezra, '2026-08-10T08:15:00+08:00', 45),
    event('event_library_aug11', 'Library', maya, '2026-08-11T14:30:00+08:00', 60),
    event('event_football_aug12', 'Football training', ezra, '2026-08-12T16:45:00+08:00', 75),
    event('event_dentist_aug17', 'Dentist', maya, '2026-08-17T10:30:00+08:00', 60),
    event('event_family_aug19', 'Family birthday', null, '2026-08-19T18:00:00+08:00', 120),
    event('event_football_aug22', 'Football match', ezra, '2026-08-22T09:00:00+08:00', 120),
    event('event_library_aug25', 'Library', maya, '2026-08-25T14:30:00+08:00', 60),
    event('event_family_aug27', 'Family dinner', null, '2026-08-27T18:30:00+08:00', 90),
    event('event_football_aug30', 'Football training', ezra, '2026-08-30T15:20:00+08:00', 75),
  ];

  const chores: ChoreOccurrence[] = [
    chore('occurrence_school_bag', 'Pack school bag', ezra, 'Morning', '07:00', '07:30', 0),
    chore('occurrence_feed_pepper', 'Feed Pepper', ezra, 'Morning', null, '07:15', 1),
    chore('occurrence_dishes', 'Dishwasher', ezra, 'Evening', '17:30', '18:45', 2),
    chore('occurrence_laundry', 'Start laundry', maya, 'Morning', null, '07:20', 3),
    chore('occurrence_herbs', 'Water herbs', maya, 'Evening', '16:30', '17:00', 4),
    {
      ...chore('occurrence_make_bed', 'Make bed', maya, 'Morning', null, '07:10', 5),
      state: 'completed',
      completionId: 'completion_seed_make_bed',
      completedAt: '2026-08-02T23:18:00.000Z',
      completedLabel: 'Done 07:18',
    },
  ];

  return {
    household,
    calendars,
    events,
    chores,
    integrations: [
      integration('calendar', 'healthy', 'Demo calendar is current.'),
      integration('home-assistant', 'healthy', 'Demo Home Assistant adapter is ready.'),
    ],
    weekDays: [
      day('2026-08-03', 'Mon', '3 Aug', true, 0),
      day('2026-08-04', 'Tue', '4 Aug', false, 1),
      day('2026-08-05', 'Wed', '5 Aug', false, 2),
      day('2026-08-06', 'Thu', '6 Aug', false, 3),
      day('2026-08-07', 'Fri', '7 Aug', false, 4),
      day('2026-08-08', 'Sat', '8 Aug', false, 5),
      day('2026-08-09', 'Sun', '9 Aug', false, 6),
    ],
  };
}

function event(
  id: string,
  title: string,
  owner: Member | null,
  start: string,
  durationMinutes: number,
): CalendarEvent {
  return {
    id,
    calendarId:
      owner?.id === 'member_ezra'
        ? 'calendar_ezra'
        : owner?.id === 'member_maya'
          ? 'calendar_maya'
          : 'calendar_family',
    title,
    owner,
    sourceLabel: owner?.displayName ?? 'Family',
    color: owner?.color ?? '#3f7251',
    start,
    end: new Date(new Date(start).getTime() + durationMinutes * 60_000).toISOString(),
    startLocalDate: start.slice(0, 10),
    endLocalDate: start.slice(0, 10),
    allDay: false,
    location: null,
    providerVersion: 'demo_v1',
    recurrenceMasterId: title === 'School drop-off' ? 'event_school_series' : null,
    isRecurrenceException: false,
  };
}

function calendar(
  id: string,
  displayName: string,
  owner: Member | null,
  color: string,
): CalendarSource {
  return { id, displayName, owner, color, access: 'read-only' };
}

function chore(
  id: string,
  title: string,
  assignee: Member,
  routineLabel: ChoreOccurrence['routineLabel'],
  availableFromTime: string | null,
  dueTime: string | null,
  sortOrder: number,
): ChoreOccurrence {
  return {
    id,
    title,
    assignee,
    routineLabel,
    availableFromTime,
    dueTime,
    sortOrder,
    localDate: DEMO_LOCAL_DATE,
    state: 'pending',
    completionId: null,
    completedAt: null,
    completedLabel: null,
    locked: false,
  };
}

function integration(
  kind: IntegrationState['kind'],
  status: IntegrationState['status'],
  message: string,
): IntegrationState {
  return {
    kind,
    status,
    lastSuccessfulAt: DEMO_NOW,
    message,
  };
}

export function demoForecastForDay(index: number): DailyForecast {
  const forecasts: DailyForecast[] = [
    { temperatureCelsius: 16, condition: 'clear', label: 'Clear', source: 'demo' },
    {
      temperatureCelsius: 18,
      condition: 'partly-cloudy',
      label: 'Partly cloudy',
      source: 'demo',
    },
    { temperatureCelsius: 17, condition: 'rain', label: 'Showers', source: 'demo' },
    { temperatureCelsius: 18, condition: 'cloudy', label: 'Cloudy', source: 'demo' },
    { temperatureCelsius: 19, condition: 'clear', label: 'Clear', source: 'demo' },
    {
      temperatureCelsius: 20,
      condition: 'partly-cloudy',
      label: 'Partly cloudy',
      source: 'demo',
    },
    { temperatureCelsius: 17, condition: 'rain', label: 'Rain', source: 'demo' },
  ];
  return forecasts[index % forecasts.length] ?? forecasts[0]!;
}

function day(
  localDate: string,
  dayLabel: string,
  dateLabel: string,
  isToday: boolean,
  forecastIndex: number,
): WeekDay {
  return { localDate, dayLabel, dateLabel, isToday, forecast: demoForecastForDay(forecastIndex) };
}
