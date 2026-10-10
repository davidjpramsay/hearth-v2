import { describe, expect, it } from 'vitest';
import { isTelevisionUserAgent } from './display-context.js';

describe('television negative-capability hints', () => {
  it('recognizes supported TV markers without using viewport width or generic Android', () => {
    for (const agent of [
      'HearthTV/0.1',
      'SMART-TV',
      'Tizen 8.0',
      'Android TV',
      'GoogleTV',
      'Web0S',
      'NetCast',
    ])
      expect(isTelevisionUserAgent(agent)).toBe(true);
    for (const agent of [
      'Mozilla iPhone Safari',
      'Mozilla Android Chrome',
      'Mozilla Windows',
      'Mozilla Macintosh',
    ])
      expect(isTelevisionUserAgent(agent)).toBe(false);
  });
});
