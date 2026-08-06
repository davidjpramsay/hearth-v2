import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRequestId } from './client';

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
