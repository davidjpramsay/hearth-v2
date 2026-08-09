import { describe, expect, it } from 'vitest';

import {
  ApiErrorSchema,
  CalendarEventSchema,
  CalendarConnectionTestRequestSchema,
  HomeAssistantConnectionTestRequestSchema,
  SaveCalendarConnectionRequestSchema,
  SaveHomeAssistantConnectionRequestSchema,
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
  SavedMealLibrarySchema,
  UpdateMealPlanWeekRequestSchema,
  MonthKeySchema,
  MonthScheduleSchema,
  UpdateMemberAvatarRequestSchema,
  PhotoGallerySchema,
  PhotoSourceIndexStatusSchema,
  PhotoSourceRefreshResultSchema,
  PocketMoneyOverviewSchema,
  PocketMoneyPaymentSchema,
  RecordPocketMoneyPaymentRequestSchema,
  RuntimeContextSchema,
  PairingCodeSchema,
  CreateTvPairingSessionRequestSchema,
  TvPairingSessionSchema,
  TodayPhotoSummarySchema,
  AssistAddListItemRequestSchema,
  CreateHouseholdListRequestSchema,
  HouseholdListSettingsSchema,
  ReorderHouseholdListsRequestSchema,
  ReorderChoreTemplatesRequestSchema,
  CreateHouseholdNoticeRequestSchema,
  TodaySectionVisibilitySchema,
  ChoreTemplateSchema,
  CreateChoreTemplateRequestSchema,
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

  it('distinguishes one-off chores from recurring schedules at the wire boundary', () => {
    const once = CreateChoreTemplateRequestSchema.parse({
      requestId: 'request_chore_once_001',
      title: 'Bring bins in',
      description: null,
      assigneeId: 'member_ezra',
      routineLabel: 'Extra jobs',
      dueTime: '16:30',
      repeat: 'once',
      repeatDays: [],
      activeFrom: '2026-08-04',
    });
    expect(once).toMatchObject({
      assigneeIds: ['member_ezra'],
      repeat: 'once',
      repeatDays: [],
    });
    const template = {
      id: 'template_bins_once',
      title: once.title,
      description: null,
      assignee: {
        id: 'member_ezra',
        displayName: 'Ezra',
        color: '#1668b7',
        avatarUrl: '/demo/ezra.png',
        role: 'child',
        capabilities: ['household.view', 'chores.complete'],
      },
      routineLabel: once.routineLabel,
      dueTime: once.dueTime,
      repeat: once.repeat,
      repeatDays: once.repeatDays,
      activeFrom: once.activeFrom,
      activeUntil: once.activeFrom,
      archived: false,
    };
    const normalizedTemplate = ChoreTemplateSchema.parse(template);
    expect(normalizedTemplate.activeUntil).toBe('2026-08-04');
    expect(normalizedTemplate.availableFromTime).toBeNull();
    expect(normalizedTemplate.sortOrder).toBe(0);
    expect(normalizedTemplate.assignees.map((member) => member.id)).toEqual(['member_ezra']);
    expect(
      CreateChoreTemplateRequestSchema.parse({
        ...once,
        requestId: 'request_chore_multi_001',
        assigneeIds: ['member_ezra', 'member_maya'],
      }).assigneeIds,
    ).toEqual(['member_ezra', 'member_maya']);
    expect(CreateChoreTemplateRequestSchema.safeParse({ ...once, assigneeIds: [] }).success).toBe(
      false,
    );
    expect(
      CreateChoreTemplateRequestSchema.safeParse({
        ...once,
        assigneeIds: ['member_ezra', 'member_ezra'],
      }).success,
    ).toBe(false);
    expect(
      ChoreTemplateSchema.safeParse({
        ...normalizedTemplate,
        assignees: [normalizedTemplate.assignees[0], normalizedTemplate.assignees[0]],
      }).success,
    ).toBe(false);
    expect(ChoreTemplateSchema.safeParse({ ...template, activeUntil: null }).success).toBe(false);
    expect(
      CreateChoreTemplateRequestSchema.safeParse({ ...once, dueTime: '4:30 pm' }).success,
    ).toBe(false);
    expect(
      CreateChoreTemplateRequestSchema.parse({
        ...once,
        availableFromTime: '15:30',
        dueTime: '16:30',
      }),
    ).toMatchObject({ availableFromTime: '15:30', dueTime: '16:30' });
    expect(
      CreateChoreTemplateRequestSchema.safeParse({
        ...once,
        availableFromTime: '16:30',
        dueTime: '16:30',
      }).success,
    ).toBe(false);
    expect(
      CreateChoreTemplateRequestSchema.safeParse({
        ...once,
        availableFromTime: '17:00',
        dueTime: '16:30',
      }).success,
    ).toBe(false);
    expect(
      ReorderChoreTemplatesRequestSchema.safeParse({
        requestId: 'request_chore_order_001',
        orderedTemplateIds: ['template_one', 'template_one'],
      }).success,
    ).toBe(false);
    expect(
      CreateChoreTemplateRequestSchema.safeParse({ ...once, repeat: 'weekly', repeatDays: [] })
        .success,
    ).toBe(false);
    expect(
      CreateChoreTemplateRequestSchema.safeParse({ ...once, repeatDays: ['MO'] }).success,
    ).toBe(false);
  });

  it('validates list administration fields and exact-order command shapes', () => {
    expect(
      CreateHouseholdListRequestSchema.parse({
        requestId: 'request_list_create_001',
        name: '  School camp  ',
        type: 'packing',
        color: '#3f7251',
      }),
    ).toMatchObject({ name: 'School camp', type: 'packing' });
    expect(
      ReorderHouseholdListsRequestSchema.safeParse({
        requestId: 'request_list_order_001',
        orderedListIds: ['list_one', 'list_one'],
      }).success,
    ).toBe(false);
    expect(
      HouseholdListSettingsSchema.parse({
        householdId: 'household_demo',
        activeLists: [],
        archivedLists: [
          {
            id: 'list_old',
            name: 'Old list',
            type: 'custom',
            color: '#1668b7',
            archivedAt: '2026-08-03T07:42:00+08:00',
          },
        ],
      }).archivedLists,
    ).toHaveLength(1);
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

  it('accepts private Home Assistant roots and rejects unsafe or ambiguous mappings', () => {
    for (const serverUrl of [
      'http://homeassistant.local:8123',
      'http://192.168.1.24:8123',
      'http://100.100.20.30:8123',
      'http://[fd12:3456::1]:8123',
      'http://[febf::1]:8123',
      'https://ha.hearth.example',
    ]) {
      expect(
        HomeAssistantConnectionTestRequestSchema.parse({
          serverUrl,
          accessToken: 'long-lived-demo-token',
        }).serverUrl,
      ).toBe(serverUrl);
    }
    for (const serverUrl of [
      'http://home-assistant.example.com:8123',
      'http://fcastle.example:8123',
      'http://[fec0::1]:8123',
      'https://ha.hearth.example/api',
      'https://user:secret@ha.hearth.example',
      'ftp://homeassistant.local',
    ]) {
      expect(
        HomeAssistantConnectionTestRequestSchema.safeParse({
          serverUrl,
          accessToken: 'long-lived-demo-token',
        }).success,
      ).toBe(false);
    }
    expect(
      SaveHomeAssistantConnectionRequestSchema.safeParse({
        requestId: 'request_home_assistant_save',
        testId: 'home_assistant_test_demo',
        label: 'Living room',
        mappings: {
          occupancyId: 'home_assistant_state_one',
          televisionPowerId: 'home_assistant_state_one',
          hearthForegroundId: 'home_assistant_state_three',
          protectedMediaId: 'home_assistant_state_four',
          eveningScriptId: 'home_assistant_script_one',
          goodnightScriptId: 'home_assistant_script_two',
          screenOffScriptId: 'home_assistant_script_three',
        },
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

  it('validates path-free photo index and audited refresh results', () => {
    const status = PhotoSourceIndexStatusSchema.parse({
      householdId: 'household_demo',
      collection: {
        id: 'photo_collection_demo',
        name: 'Family photos',
        photoCount: 12,
        updatedAt: '2026-08-09T10:00:00.000Z',
        source: {
          kind: 'synology-folder',
          label: 'Synology photos',
          status: 'ready',
          message: '12 approved photos are indexed locally.',
        },
      },
      scanInProgress: false,
      indexedFileCount: 14,
      visiblePhotoCount: 12,
      hiddenPhotoCount: 0,
      unsupportedFileCount: 1,
      corruptFileCount: 1,
    });
    const result = PhotoSourceRefreshResultSchema.parse({
      status,
      replayed: false,
      audit: {
        id: 'audit_photo_refresh',
        actorType: 'member',
        actorId: 'member_adult',
        source: 'companion',
        action: 'photo.source.refresh',
        targetId: 'photo_collection_demo',
        occurredAt: '2026-08-09T10:00:00.000Z',
        result: 'succeeded',
      },
    });
    expect(result.status.visiblePhotoCount).toBe(12);
    expect(JSON.stringify(result)).not.toMatch(/volume1|sourceDirectory|derivativeDirectory/);
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
      SavedMealLibrarySchema.parse({
        householdId: 'household_demo',
        activeMeals: [
          {
            id: 'saved_meal_tacos',
            name: 'Tacos',
            description: 'Everyone builds their own',
            preparationMinutes: 25,
            favourite: true,
            archivedAt: null,
          },
        ],
        archivedMeals: [],
      }).activeMeals[0],
    ).toMatchObject({ name: 'Tacos', preparationMinutes: 25 });
    expect(
      UpdateMealPlanWeekRequestSchema.safeParse({
        requestId: 'request_meal_week_valid',
        startDate: '2026-08-03',
        entries: [
          {
            localDate: '2026-08-04',
            slot: 'dinner',
            mealName: 'Tacos',
            savedMealId: 'saved_meal_tacos',
            note: null,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      UpdateMealPlanWeekRequestSchema.safeParse({
        requestId: 'request_meal_week_invalid',
        startDate: '2026-08-03',
        entries: [
          {
            localDate: '2026-08-11',
            slot: 'dinner',
            mealName: 'Too late',
            savedMealId: null,
            note: null,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      UpdateMealPlanWeekRequestSchema.safeParse({
        requestId: 'request_meal_week_empty',
        startDate: '2026-08-03',
        entries: [],
      }).success,
    ).toBe(false);
    expect(
      PocketMoneyOverviewSchema.parse({
        householdId: 'household_demo',
        weekStart: '2026-08-03',
        weekEnd: '2026-08-09',
        asOfDate: '2026-08-03',
        displayRange: '3–9 Aug',
        children: [],
        recentPayments: [],
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
        note: null,
        paidAt: '2026-08-07T10:00:00+08:00',
        paidByActorId: 'member_parent',
        source: 'companion',
        void: null,
      }).success,
    ).toBe(false);
    expect(
      RecordPocketMoneyPaymentRequestSchema.safeParse({
        requestId: 'request_zero_payment',
        memberId: 'member_child',
        weekStart: '2026-08-03',
        asOfDate: '2026-08-03',
        amountCents: 0,
      }).success,
    ).toBe(false);
  });
});
