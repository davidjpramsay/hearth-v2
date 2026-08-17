import { z } from 'zod';

import {
  DailyForecastSchema,
  WeatherSummarySchema,
  type DailyForecast,
  type WeatherSummary,
} from '@hearth/shared';

const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const DEFAULT_CACHE_MILLISECONDS = 30 * 60 * 1_000;
const DEFAULT_TIMEOUT_MILLISECONDS = 4_000;

const OpenMeteoResponseSchema = z.object({
  current: z.object({
    time: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    temperature_2m: z.number().finite(),
    weather_code: z.number().int().min(0).max(99),
  }),
  daily: z.object({
    time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
    weather_code: z.array(z.number().int().min(0).max(99)).min(1),
    temperature_2m_max: z.array(z.number().finite()).min(1),
  }),
});

export interface WeatherForecastSnapshot {
  current: { localDate: string; summary: WeatherSummary } | null;
  daily: ReadonlyMap<string, DailyForecast>;
}

export interface WeatherProvider {
  readonly configured: boolean;
  read(timezone: string): Promise<WeatherForecastSnapshot>;
}

export interface OpenMeteoWeatherConfiguration {
  latitude: number;
  longitude: number;
}

export class WeatherUnavailableError extends Error {
  constructor(message = 'Weather is unavailable.') {
    super(message);
    this.name = 'WeatherUnavailableError';
  }
}

export class UnconfiguredWeatherProvider implements WeatherProvider {
  readonly configured = false;

  async read(_timezone: string): Promise<WeatherForecastSnapshot> {
    return emptyWeatherSnapshot();
  }
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  readonly configured = true;
  private cache: {
    timezone: string;
    expiresAt: number;
    snapshot: WeatherForecastSnapshot;
  } | null = null;
  private inFlight: { timezone: string; promise: Promise<WeatherForecastSnapshot> } | null = null;

  constructor(
    private readonly configuration: OpenMeteoWeatherConfiguration,
    private readonly options: {
      fetchImpl?: typeof fetch;
      now?: () => number;
      cacheMilliseconds?: number;
      timeoutMilliseconds?: number;
      endpoint?: string;
    } = {},
  ) {}

  async read(timezone: string): Promise<WeatherForecastSnapshot> {
    const now = (this.options.now ?? Date.now)();
    if (this.cache !== null && this.cache.timezone === timezone && this.cache.expiresAt > now) {
      return this.cache.snapshot;
    }
    if (this.inFlight?.timezone === timezone) return this.inFlight.promise;

    const staleSnapshot = this.cache?.timezone === timezone ? this.cache.snapshot : null;
    const promise = this.fetchForecast(timezone)
      .then((snapshot) => {
        this.cache = {
          timezone,
          expiresAt:
            (this.options.now ?? Date.now)() +
            (this.options.cacheMilliseconds ?? DEFAULT_CACHE_MILLISECONDS),
          snapshot,
        };
        return snapshot;
      })
      .catch((error: unknown) => {
        if (staleSnapshot !== null) return staleSnapshot;
        if (error instanceof WeatherUnavailableError) throw error;
        throw new WeatherUnavailableError();
      })
      .finally(() => {
        if (this.inFlight?.promise === promise) this.inFlight = null;
      });
    this.inFlight = { timezone, promise };
    return promise;
  }

  private async fetchForecast(timezone: string): Promise<WeatherForecastSnapshot> {
    const url = new URL(this.options.endpoint ?? OPEN_METEO_FORECAST_URL);
    url.searchParams.set('latitude', String(this.configuration.latitude));
    url.searchParams.set('longitude', String(this.configuration.longitude));
    url.searchParams.set('current', 'temperature_2m,weather_code');
    url.searchParams.set('daily', 'weather_code,temperature_2m_max');
    url.searchParams.set('temperature_unit', 'celsius');
    url.searchParams.set('timezone', timezone);
    url.searchParams.set('forecast_days', '16');
    url.searchParams.set('past_days', '7');

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS,
    );
    try {
      const response = await (this.options.fetchImpl ?? fetch)(url, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new WeatherUnavailableError();
      const parsed = OpenMeteoResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new WeatherUnavailableError();
      return mapOpenMeteoResponse(parsed.data);
    } catch (error) {
      if (error instanceof WeatherUnavailableError) throw error;
      throw new WeatherUnavailableError();
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function resolveOpenMeteoWeatherConfiguration(
  environment: NodeJS.ProcessEnv,
): OpenMeteoWeatherConfiguration | null {
  const latitudeValue = environment.HEARTH_WEATHER_LATITUDE?.trim() ?? '';
  const longitudeValue = environment.HEARTH_WEATHER_LONGITUDE?.trim() ?? '';
  if (latitudeValue === '' && longitudeValue === '') return null;
  if (latitudeValue === '' || longitudeValue === '') {
    throw new Error('HEARTH_WEATHER_LATITUDE and HEARTH_WEATHER_LONGITUDE must be set together.');
  }
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('HEARTH_WEATHER_LATITUDE must be a number from -90 to 90.');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('HEARTH_WEATHER_LONGITUDE must be a number from -180 to 180.');
  }
  return { latitude, longitude };
}

export function emptyWeatherSnapshot(): WeatherForecastSnapshot {
  return { current: null, daily: new Map() };
}

function mapOpenMeteoResponse(
  response: z.infer<typeof OpenMeteoResponseSchema>,
): WeatherForecastSnapshot {
  const daily = new Map<string, DailyForecast>();
  for (const [index, localDate] of response.daily.time.entries()) {
    const weatherCode = response.daily.weather_code[index];
    const temperature = response.daily.temperature_2m_max[index];
    if (weatherCode === undefined || temperature === undefined) continue;
    const condition = describeWeatherCode(weatherCode);
    daily.set(
      localDate,
      DailyForecastSchema.parse({
        temperatureCelsius: Math.round(temperature),
        condition: condition.normalized,
        label: condition.label,
        source: 'open-meteo',
      }),
    );
  }
  const currentCondition = describeWeatherCode(response.current.weather_code);
  return {
    current: {
      localDate: response.current.time.slice(0, 10),
      summary: WeatherSummarySchema.parse({
        temperatureCelsius: Math.round(response.current.temperature_2m),
        condition: currentCondition.label,
        source: 'open-meteo',
      }),
    },
    daily,
  };
}

function describeWeatherCode(code: number): {
  normalized: DailyForecast['condition'];
  label: string;
} {
  if (code === 0) return { normalized: 'clear', label: 'Clear' };
  if (code === 1) return { normalized: 'partly-cloudy', label: 'Mostly clear' };
  if (code === 2) return { normalized: 'partly-cloudy', label: 'Partly cloudy' };
  if (code === 3) return { normalized: 'cloudy', label: 'Cloudy' };
  if (code === 45 || code === 48) return { normalized: 'cloudy', label: 'Fog' };
  if (code >= 51 && code <= 57) return { normalized: 'rain', label: 'Drizzle' };
  if (code >= 61 && code <= 67) return { normalized: 'rain', label: 'Rain' };
  if (code >= 71 && code <= 77) return { normalized: 'rain', label: 'Snow' };
  if (code >= 80 && code <= 82) return { normalized: 'rain', label: 'Showers' };
  if (code >= 85 && code <= 86) return { normalized: 'rain', label: 'Snow showers' };
  if (code >= 95) return { normalized: 'rain', label: 'Thunderstorms' };
  return { normalized: 'cloudy', label: 'Cloudy' };
}
