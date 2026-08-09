import { describe, expect, it } from 'vitest';

import {
  ApiErrorSchema,
  CalendarEventSchema,
  CalendarConnectionTestRequestSchema,
  SaveCalendarConnectionRequestSchema,
  CalendarSourceSchema,
  CreateMemberRequestSchema,
  DailyForecastSchema,
  ChoreCommandResultSchema,
  CommandRequestSchema,
  LocalDateSchema,
  HouseholdListsSchema,
  HomeStatusSchema,
  IntegrationStateSchema,
  MealPlanSchema,
  MonthKeySchema,
  MonthScheduleSchema,
  UpdateMemberAvatarRequestSchema,
  PhotoGallerySchema,
  PocketMoneyOverviewSchema,
  PocketMoneyPaymentSchema,
  RuntimeContextSchema,
  PairingCodeSchema,
  CreateTvPairingSessionRequestSchema,
  TvPairingSessionSchema,
  TodayPhotoSummarySchema,
  AssistAddListItemRequestSchema,
  CreateHouseholdNoticeRequestSchema,
  TodaySectionVisibilitySchema,
} from './schemas.js';

describe('shared wire schemas', () => {
  it('keeps private first-use runtime context free of fictional household data', () => {
    expect(
      RuntimeContextSchema.parse({
        mode: 'private',
        generatedAt: '2026-12-31T16:15:00.000Z',
        household: null,
        timezone: 'Australia/Perth',
        locale: 'en-AU',
        localDate: '2027-01-01',
        weekStart: '2026-12-28',
        currentMonth: '2027-01',
        requiresSetup: true,
      }),
    ).toMatchObject({ mode: 'private', household: null, localDate: '2027-01-01' });
  });

  it('accepts opaque request identifiers and rejects database row numbers', () => {
    expect(CommandRequestSchema.parse({ requestId: 'request_demo_001' })).toEqual({
      requestId: 'request_demo_001',
    });
    expect(() => CommandRequestSchema.parse({ requestId: 42 })).toThrow();
  });

  it('requires explicit local dates', () => {
    expect(LocalDateSchema.parse('2026-08-03')).toBe('2026-08-03');
    expect(() => LocalDateSchema.parse('03/08/2026')).toThrow();
  });

  it('accepts only HTTPS calendar setup and unique tested calendar selections', () => {
    expect(
      CalendarConnectionTestRequestSchema.parse({
        serverUrl: 'https://caldav.icloud.com',
        username: 'fictional@example.com',
        appPassword: 'demo-app-password',
      }).serverUrl,
    ).toBe('https://caldav.icloud.com');
    expect(
      CalendarConnectionTestRequestSchema.safeParse({
        serverUrl: 'http://calendar.example.com',
        username: 'fictional@example.com',
        appPassword: 'demo-app-password',
      }).success,
    ).toBe(false);
    expect(
      SaveCalendarConnectionRequestSchema.safeParse({
        requestId: 'request_calendar_save',
        testId: 'calendar_test_demo',
        label: 'Family calendars',
        calendars: [
          { calendarId: 'calendar_option_family', ownerMemberId: null },
          { calendarId: 'calendar_option_family', ownerMemberId: 'member_ezra' },
        ],
      }).success,
    ).toBe(false);
  });

  it('accepts bounded JPEG avatar commands and rejects malformed image transport', () => {
    const valid = UpdateMemberAvatarRequestSchema.parse({
      requestId: 'request_avatar_001',
      mimeType: 'image/jpeg',
      dataBase64: '/9j/2Q==',
    });
    expect(valid.mimeType).toBe('image/jpeg');
    expect(
      UpdateMemberAvatarRequestSchema.safeParse({
        requestId: 'request_avatar_bad',
        mimeType: 'image/png',
        dataBase64: 'not base64',
      }).success,
    ).toBe(false);
  });

  it('requires a six-week Month projection with a valid month key', () => {
    const days = Array.from({ length: 42 }, (_, index) => {
      const date = new Date('2026-07-27T12:00:00.000Z');
      date.setUTCDate(date.getUTCDate() + index);
      const localDate = date.toISOString().slice(0, 10);
      return {
        localDate,
        dayNumber: date.getUTCDate(),
        inMonth: localDate.startsWith('2026-08-'),
        isToday: localDate === '2026-08-03',
      };
    });
    expect(
      MonthScheduleSchema.parse({
        householdId: 'household_demo',
        month: '2026-08',
        gridStartDate: '2026-07-27',
        gridEndDate: '2026-09-06',
        displayMonth: 'August',
        displayYear: '2026',
        freshness: 'current',
        statusMessage: null,
        days,
        calendars: [],
        events: [],
      }).days,
    ).toHaveLength(42);
    expect(MonthKeySchema.safeParse('2026-13').success).toBe(false);
  });

  it('keeps daily weather forecasts compact and presentation-safe', () => {
    expect(
      DailyForecastSchema.parse({
        temperatureCelsius: 16,
        condition: 'clear',
        label: 'Clear',
      }),
    ).toEqual({ temperatureCelsius: 16, condition: 'clear', label: 'Clear' });
    expect(
      DailyForecastSchema.safeParse({
        temperatureCelsius: 16,
        condition: 'provider-specific-code',
        label: 'Clear',
      }).success,
    ).toBe(false);
  });

  it('keeps Today photo previews same-origin and filesystem-safe', () => {
    expect(
      TodayPhotoSummarySchema.parse({
        url: '/demo/family-breakfast.webp',
        alt: 'Two fictional household members set the breakfast table together.',
      }).url,
    ).toBe('/demo/family-breakfast.webp');
    expect(
      TodayPhotoSummarySchema.safeParse({
        url: 'file:///volume1/photos/private/family.jpg',
        alt: 'Private family photograph.',
      }).success,
    ).toBe(false);
    expect(
      TodayPhotoSummarySchema.safeParse({
        url: '//remote.example/family.jpg',
        alt: 'Remote family photograph.',
      }).success,
    ).toBe(false);
  });

  it('validates opaque, orientation-aware photo galleries without source paths', () => {
    const parsed = PhotoGallerySchema.parse({
      householdId: 'household_demo',
      freshness: 'current',
      statusMessage: null,
      collection: {
        id: 'photo_collection_demo',
        name: 'Family favourites',
        photoCount: 1,
        updatedAt: '2026-08-02T23:30:00.000Z',
        source: {
          kind: 'demo',
          label: 'Demo album',
          status: 'ready',
          message: null,
        },
      },
      featuredPhotoId: 'photo_family_breakfast',
      photos: [
        {
          id: 'photo_family_breakfast',
          thumbnailUrl: '/demo/photos/thumbs/family-breakfast.webp',
          displayUrl: '/demo/family-breakfast.webp',
          alt: 'Ezra and Maya set the breakfast table together.',
          width: 1200,
          height: 800,
          orientation: 'landscape',
          capturedAt: null,
          favourite: true,
        },
      ],
    });
    expect(parsed.photos[0]?.orientation).toBe('landscape');
    expect(JSON.stringify(parsed)).not.toMatch(/volume1|filesystem|sourcePath/);
    expect(
      PhotoGallerySchema.safeParse({
        ...parsed,
        photos: [{ ...parsed.photos[0], displayUrl: '/demo/../private/family.jpg' }],
      }).success,
    ).toBe(false);
  });

  it('keeps native television media outside Hearth integration contracts', () => {
    expect(
      IntegrationStateSchema.parse({
        kind: 'home-assistant',
        status: 'not-configured',
        lastSuccessfulAt: null,
        message: 'Home controls are not configured.',
      }).kind,
    ).toBe('home-assistant');
    for (const kind of ['jellyfin', 'music-assistant']) {
      expect(
        IntegrationStateSchema.safeParse({
          kind,
          status: 'not-configured',
          lastSuccessfulAt: null,
          message: 'Media stays in the native Google TV app.',
        }).success,
      ).toBe(false);
    }
  });

  it('keeps command and error responses stable', () => {
    expect(ChoreCommandResultSchema.safeParse({}).success).toBe(false);
    expect(
      ApiErrorSchema.parse({
        error: {
          code: 'FORBIDDEN',
          message: 'Ask an adult to change this.',
          retryable: false,
          requestId: 'request_demo_002',
        },
      }).error.code,
    ).toBe('FORBIDDEN');
  });

  it('validates bounded notice windows and explicit Today visibility', () => {
    expect(
      CreateHouseholdNoticeRequestSchema.parse({
        requestId: 'request_notice_schema',
        message: 'Bins tonight',
        priority: 'important',
        startsAt: '2026-08-03T00:00:00.000Z',
        expiresAt: '2026-08-04T00:00:00.000Z',
      }).priority,
    ).toBe('important');
    expect(
      CreateHouseholdNoticeRequestSchema.safeParse({
        requestId: 'request_notice_bad_window',
        message: 'Invalid',
        priority: 'standard',
        startsAt: '2026-08-04T00:00:00.000Z',
        expiresAt: '2026-08-03T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      TodaySectionVisibilitySchema.parse({
        dinner: false,
        listSummary: true,
        notice: true,
        photo: false,
      }),
    ).toEqual({ dinner: false, listSummary: true, notice: true, photo: false });
  });

  it('keeps pairing codes compact and administrator capability adult-only', () => {
    expect(PairingCodeSchema.parse('HEARTH')).toBe('HEARTH');
    expect(() => PairingCodeSchema.parse('hearth')).toThrow();
    expect(
      CreateMemberRequestSchema.safeParse({
        requestId: 'request_member_schema',
        displayName: 'Alex',
        role: 'child',
        color: '#718778',
        administrator: true,
      }).success,
    ).toBe(false);
  });

  it('keeps the native pairing secret in the television request only', () => {
    const pairingSecret = 'a'.repeat(43);
    expect(
      CreateTvPairingSessionRequestSchema.parse({
        requestId: 'request_tv_pair_schema',
        deviceName: 'Living room Google TV',
        applicationVersion: '0.1.0-debug',
        pairingSecret,
      }).pairingSecret,
    ).toBe(pairingSecret);
    const publicSession = TvPairingSessionSchema.parse({
      pairing: {
        id: 'pairing_tv_schema',
        requestId: 'request_tv_pair_schema',
        code: 'HEARTH',
        deviceName: 'Living room Google TV',
        status: 'pending',
        expiresAt: '2026-08-04T08:00:00+08:00',
        approvedDeviceId: null,
      },
      pairingSecret,
    });
    expect(publicSession).not.toHaveProperty('pairingSecret');
  });

  it('keeps provider details behind opaque calendar projection contracts', () => {
    expect(
      CalendarSourceSchema.parse({
        id: 'calendar_family',
        displayName: 'Family',
        color: '#3f7251',
        owner: null,
        access: 'read-only',
      }),
    ).toMatchObject({ id: 'calendar_family', access: 'read-only' });
    expect(
      CalendarEventSchema.parse({
        id: 'event_family_day',
        calendarId: 'calendar_family',
        title: 'Family day',
        owner: null,
        sourceLabel: 'Family',
        color: '#3f7251',
        start: '2026-08-03T00:00:00+08:00',
        end: '2026-08-04T00:00:00+08:00',
        startLocalDate: '2026-08-03',
        endLocalDate: '2026-08-03',
        allDay: true,
        location: null,
        providerVersion: 'version_1',
        recurrenceMasterId: null,
        isRecurrenceException: false,
      }),
    ).toMatchObject({ allDay: true, startLocalDate: '2026-08-03' });
  });

  it('accepts curated Home Assistant state without raw entities or media metadata', () => {
    const parsed = HomeStatusSchema.parse({
      householdId: 'household_demo',
      roomLabel: 'Living room',
      generatedAt: '2026-08-03T07:42:00+08:00',
      freshness: 'current',
      statusMessage: null,
      integration: {
        kind: 'home-assistant',
        status: 'healthy',
        lastSuccessfulAt: '2026-08-03T07:42:00+08:00',
        message: 'Connected locally.',
      },
      occupancy: 'occupied',
      televisionPower: 'on',
      protectedMediaActive: false,
      powerProtectionLabel: 'Power protection clear',
      automaticScreenOff: {
        automaticScreenOffAllowed: false,
        reason: 'presence-detected',
      },
      actions: [
        {
          id: 'evening-mode',
          label: 'Evening',
          description: 'Warm lights for the evening',
          icon: 'sun',
          confirmation: 'none',
          enabled: true,
          unavailableReason: null,
        },
      ],
    });
    expect(parsed.actions[0]?.id).toBe('evening-mode');
    expect(JSON.stringify(parsed)).not.toMatch(/entityId|mediaTitle|service/);
  });

  it('validates the browser-safe list and voice command contracts', () => {
    expect(
      AssistAddListItemRequestSchema.parse({
        requestId: 'request_voice_apples',
        listName: '  grocery list ',
        text: ' Apples ',
        quantity: null,
      }),
    ).toMatchObject({ listName: 'grocery list', text: 'Apples' });
    expect(
      HouseholdListsSchema.parse({
        householdId: 'household_demo',
        lists: [
          {
            id: 'list_groceries',
            name: 'Groceries',
            type: 'grocery',
            color: '#3f7251',
            remainingCount: 1,
            totalCount: 1,
            items: [
              {
                id: 'item_milk',
                text: 'Milk',
                quantity: null,
                checked: false,
                checkedAt: null,
                checkedByActorId: null,
              },
            ],
          },
        ],
      }).lists[0]?.remainingCount,
    ).toBe(1);
  });

  it('requires seven provider-independent meal days and validates pocket-money progress', () => {
    const days = Array.from({ length: 7 }, (_, index) => ({
      localDate: `2026-08-${String(index + 3).padStart(2, '0')}`,
      dayLabel: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index],
      dateLabel: String(index + 3),
      isToday: index === 0,
      entries: [],
    }));
    expect(
      MealPlanSchema.parse({
        householdId: 'household_demo',
        startDate: '2026-08-03',
        endDate: '2026-08-09',
        displayRange: '3–9 August',
        days,
        savedMeals: [],
      }).days,
    ).toHaveLength(7);
    expect(
      PocketMoneyOverviewSchema.parse({
        householdId: 'household_demo',
        weekStart: '2026-08-03',
        weekEnd: '2026-08-09',
        asOfDate: '2026-08-03',
        displayRange: '3–9 Aug',
        children: [],
      }),
    ).toMatchObject({ householdId: 'household_demo', children: [] });
    expect(
      PocketMoneyPaymentSchema.safeParse({
        id: 'payment_invalid',
        memberId: 'member_child',
        weekStart: '2026-08-03',
        weekEnd: '2026-08-09',
        scheduledCount: 2,
        completedCount: 3,
        completionPercentage: 100,
        amountCents: 1200,
        paidAt: '2026-08-07T10:00:00+08:00',
        paidByActorId: 'member_parent',
        source: 'companion',
      }).success,
    ).toBe(false);
  });
});
