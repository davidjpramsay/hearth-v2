import { DailyVerseSummarySchema } from '@hearth/shared';
import { householdApiBase, request } from './core';

export const dailyVerseApi = {
  get: (signal?: AbortSignal) =>
    request(
      `${householdApiBase()}/daily-verse`,
      DailyVerseSummarySchema.nullable(),
      signal ? { signal } : undefined,
    ),
};
