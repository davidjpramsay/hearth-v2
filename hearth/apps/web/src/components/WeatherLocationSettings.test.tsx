import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPhoneCoordinates } from '../utils/browserLocation';

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'geolocation');
});

describe('phone weather location', () => {
  it('returns only latitude and longitude from a successful browser location request', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: -32.328, longitude: 115.82 } } as GeolocationPosition),
    );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition } as unknown as Geolocation,
    });

    await expect(getPhoneCoordinates()).resolves.toEqual({
      latitude: -32.328,
      longitude: 115.82,
    });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it('turns a denied permission into a useful fallback message', async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) =>
      error({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
    );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition } as unknown as Geolocation,
    });

    await expect(getPhoneCoordinates()).rejects.toThrow(
      'Location permission was not allowed. You can still search by suburb or postcode.',
    );
  });
});
