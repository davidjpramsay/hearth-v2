import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureHearthClient, createRequestId, hearthApi, queryKeys } from './client';

const runtime = {
  mode: 'test' as const,
  generatedAt: '2026-12-31T16:15:00.000Z',
  household: {
    id: 'household_runtime_test',
    name: 'Runtime Home',
    timezone: 'Australia/Perth',
    locale: 'en-AU',
  },
  timezone: 'Australia/Perth',
  locale: 'en-AU',
  localDate: '2027-01-01',
  weekStart: '2026-12-28',
  currentMonth: '2027-01',
  requiresSetup: false,
};

describe('createRequestId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses random values when randomUUID is unavailable on a cleartext LAN origin', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint32Array) => {
        values.set([1, 2, 3, 4]);
        return values;
      },
      randomUUID: undefined,
    });

    expect(createRequestId('chore_complete')).toBe(
      'request_chore_complete_00000001_00000002_00000003_00000004',
    );
  });
});

describe('runtime-configured client', () => {
  it('derives household paths and date-sensitive query keys from runtime context', () => {
    configureHearthClient(runtime);
    expect(queryKeys.today).toEqual(['household_runtime_test', 'today', '2027-01-01']);
    expect(queryKeys.week()).toEqual(['household_runtime_test', 'week', '2026-12-28']);
    expect(queryKeys.week('2027-01-04')).toEqual(['household_runtime_test', 'week', '2027-01-04']);
    expect(queryKeys.month()).toEqual(['household_runtime_test', 'month', '2027-01']);
    expect(hearthApi.realtimeUrl).toBe('/api/v1/households/household_runtime_test/events');
  });
});
