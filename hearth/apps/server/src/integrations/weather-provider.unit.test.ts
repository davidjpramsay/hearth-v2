import { describe, expect, it, vi } from 'vitest';

import {
  OpenMeteoWeatherProvider,
  resolveOpenMeteoWeatherConfiguration,
} from './weather-provider.js';

const RESPONSE = {
  current: {
    time: '2026-08-17T20:30',
    temperature_2m: 14.7,
    weather_code: 1,
  },
  daily: {
    time: ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20'],
    weather_code: [95, 3, 53, null],
    temperature_2m_max: [19, 17.1, 17.6, null],
  },
};

describe('Open-Meteo weather provider', () => {
  it('requests bounded current and daily data and maps it into the public contract', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      void input;
      return Response.json(RESPONSE);
    });
    const provider = new OpenMeteoWeatherProvider(
      { latitude: -31.9523, longitude: 115.8613 },
      { fetchImpl: fetchImpl as typeof fetch },
    );

    const forecast = await provider.read('Australia/Perth');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestUrl.origin + requestUrl.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(requestUrl.searchParams.get('timezone')).toBe('Australia/Perth');
    expect(requestUrl.searchParams.get('forecast_days')).toBe('16');
    expect(requestUrl.searchParams.get('past_days')).toBe('7');
    expect(forecast.current).toEqual({
      localDate: '2026-08-17',
      summary: { temperatureCelsius: 15, condition: 'Mostly clear', source: 'open-meteo' },
    });
    expect(forecast.daily.get('2026-08-17')).toEqual({
      temperatureCelsius: 19,
      condition: 'rain',
      label: 'Thunderstorms',
      source: 'open-meteo',
    });
    expect(forecast.daily.get('2026-08-18')).toEqual({
      temperatureCelsius: 17,
      condition: 'cloudy',
      label: 'Cloudy',
      source: 'open-meteo',
    });
    expect(forecast.daily.has('2026-08-20')).toBe(false);
  });

  it('coalesces reads, caches briefly and retains the last safe forecast during outage', async () => {
    let now = 0;
    let unavailable = false;
    const fetchImpl = vi.fn(async () => {
      if (unavailable) throw new Error('offline');
      return Response.json(RESPONSE);
    });
    const provider = new OpenMeteoWeatherProvider(
      { latitude: -31.9523, longitude: 115.8613 },
      {
        fetchImpl: fetchImpl as typeof fetch,
        now: () => now,
        cacheMilliseconds: 1,
      },
    );

    const [first, coalesced] = await Promise.all([
      provider.read('Australia/Perth'),
      provider.read('Australia/Perth'),
    ]);
    expect(coalesced).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now = 2;
    unavailable = true;
    expect(await provider.read('Australia/Perth')).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('requires a complete, bounded coordinate pair', () => {
    expect(resolveOpenMeteoWeatherConfiguration({})).toBeNull();
    expect(
      resolveOpenMeteoWeatherConfiguration({
        HEARTH_WEATHER_LATITUDE: '-31.9523',
        HEARTH_WEATHER_LONGITUDE: '115.8613',
      }),
    ).toEqual({ latitude: -31.9523, longitude: 115.8613 });
    expect(() =>
      resolveOpenMeteoWeatherConfiguration({ HEARTH_WEATHER_LATITUDE: '-31.9523' }),
    ).toThrow('must be set together');
    expect(() =>
      resolveOpenMeteoWeatherConfiguration({
        HEARTH_WEATHER_LATITUDE: '-91',
        HEARTH_WEATHER_LONGITUDE: '115.8613',
      }),
    ).toThrow('from -90 to 90');
  });
});
