import { describe, expect, it, vi } from 'vitest';

import {
  OpenMeteoWeatherProvider,
  resolveOpenMeteoWeatherConfiguration,
} from './weather-provider.js';

const RESPONSE = {
  current: {
    time: '2026-08-17T20:30',
    temperature_2m: 14.7,
    apparent_temperature: 12.8,
    weather_code: 1,
    wind_speed_10m: 18.2,
    wind_gusts_10m: 29.7,
    wind_direction_10m: 214,
  },
  hourly: {
    time: ['2026-08-17T20:00', '2026-08-17T21:00', '2026-08-17T22:00', '2026-08-17T23:00'],
    temperature_2m: [15.1, 14.2, 13.6, 13],
    apparent_temperature: [13.2, 12.6, 12, 11.5],
    precipitation_probability: [20, 30, 40, 50],
    precipitation: [0, 0.1, 0.4, 0.8],
    weather_code: [1, 2, 61, 61],
    wind_speed_10m: [18, 17, 16, 15],
    wind_gusts_10m: [30, 29, 28, 27],
    wind_direction_10m: [214, 220, 225, 230],
  },
  daily: {
    time: ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20'],
    weather_code: [95, 3, 53, null],
    temperature_2m_min: [11.2, 10.4, 9.8, null],
    temperature_2m_max: [19, 17.1, 17.6, null],
    precipitation_probability_max: [80, 25, 55, null],
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
      {
        fetchImpl: fetchImpl as typeof fetch,
        now: () => Date.parse('2026-08-17T12:31:00.000Z'),
      },
    );

    const forecast = await provider.read('Australia/Perth');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestUrl.origin + requestUrl.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(requestUrl.searchParams.get('timezone')).toBe('Australia/Perth');
    expect(requestUrl.searchParams.get('forecast_days')).toBe('16');
    expect(requestUrl.searchParams.get('forecast_hours')).toBe('24');
    expect(requestUrl.searchParams.get('past_days')).toBe('7');
    expect(forecast.current).toEqual({
      localDate: '2026-08-17',
      details: {
        time: '2026-08-17T20:30',
        temperatureCelsius: 15,
        apparentTemperatureCelsius: 13,
        condition: 'partly-cloudy',
        label: 'Mostly clear',
        precipitationProbabilityPercent: 30,
        windSpeedKph: 18,
        windGustKph: 30,
        windDirectionDegrees: 214,
      },
      summary: { temperatureCelsius: 15, condition: 'Mostly clear', source: 'open-meteo' },
    });
    expect(forecast.hourly).toHaveLength(3);
    expect(forecast.hourly[1]).toMatchObject({
      time: '2026-08-17T22:00',
      precipitationProbabilityPercent: 40,
      precipitationMillimetres: 0.4,
      condition: 'rain',
    });
    expect(forecast.daily.get('2026-08-17')).toEqual({
      temperatureCelsius: 19,
      lowTemperatureCelsius: 11,
      highTemperatureCelsius: 19,
      precipitationProbabilityPercent: 80,
      condition: 'rain',
      label: 'Thunderstorms',
      source: 'open-meteo',
    });
    expect(forecast.daily.get('2026-08-18')).toEqual({
      temperatureCelsius: 17,
      lowTemperatureCelsius: 10,
      highTemperatureCelsius: 17,
      precipitationProbabilityPercent: 25,
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
    const stale = await provider.read('Australia/Perth');
    expect(stale).not.toBe(first);
    expect(stale.freshness).toBe('stale');
    expect(stale.daily).toBe(first.daily);
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
