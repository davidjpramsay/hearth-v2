import { describe, expect, it } from 'vitest';

import { getTodayRailCapacity } from './todayRailCapacity';

describe('getTodayRailCapacity', () => {
  it('reserves a readable lower rail on short logical TV canvases', () => {
    for (const photoOrientation of ['none', 'landscape', 'square', 'portrait'] as const) {
      for (let summaryCount = 0; summaryCount <= 5; summaryCount += 1)
        expect(
          getTodayRailCapacity({ photoOrientation, summaryCount, viewportClass: 'short-tv' }),
        ).toBe(summaryCount >= 5 ? 1 : 2);
    }
  });
  it('keeps the scrolling companion presentation concise', () => {
    for (const photoOrientation of ['none', 'landscape', 'square', 'portrait'] as const) {
      expect(getTodayRailCapacity({ photoOrientation, viewportClass: 'companion' })).toBe(3);
    }
  });

  it('uses five rows where the photo composition can absorb their height', () => {
    expect(getTodayRailCapacity({ photoOrientation: 'portrait', viewportClass: 'full-tv' })).toBe(
      5,
    );
    expect(
      getTodayRailCapacity({ photoOrientation: 'portrait', viewportClass: 'compact-tv' }),
    ).toBe(5);
    expect(getTodayRailCapacity({ photoOrientation: 'square', viewportClass: 'full-tv' })).toBe(5);
    expect(getTodayRailCapacity({ photoOrientation: 'none', viewportClass: 'compact-tv' })).toBe(5);
  });

  it('uses a fourth landscape row only when a full-height TV can preserve the photo', () => {
    expect(getTodayRailCapacity({ photoOrientation: 'landscape', viewportClass: 'full-tv' })).toBe(
      4,
    );
    expect(
      getTodayRailCapacity({ photoOrientation: 'landscape', viewportClass: 'compact-tv' }),
    ).toBe(3);
    expect(getTodayRailCapacity({ photoOrientation: 'square', viewportClass: 'compact-tv' })).toBe(
      3,
    );
  });

  it('reserves height for five enabled summary modules', () => {
    expect(
      getTodayRailCapacity({
        photoOrientation: 'portrait',
        summaryCount: 5,
        viewportClass: 'full-tv',
      }),
    ).toBe(4);
    expect(
      getTodayRailCapacity({
        photoOrientation: 'none',
        summaryCount: 5,
        viewportClass: 'compact-tv',
      }),
    ).toBe(3);
  });
});
