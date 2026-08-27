import { createHash, randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';
import { z } from 'zod';

import {
  WeatherLocationCommandResultSchema,
  WeatherLocationSchema,
  WeatherLocationSearchResultsSchema,
  WeatherLocationTestResultSchema,
  type AuditSummary,
  type SaveWeatherLocationRequest,
  type WeatherLocation,
  type WeatherLocationCommandResult,
  type WeatherLocationSearchResult,
  type WeatherLocationTestRequest,
  type WeatherLocationTestResult,
  type WeatherSummary,
} from '@hearth/shared';

import type { AdminRepository } from './admin-repository.js';
import {
  OpenMeteoWeatherProvider,
  WeatherUnavailableError,
  type OpenMeteoWeatherConfiguration,
} from './integrations/weather-provider.js';
import { RepositoryError } from './repository.js';

const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

const SearchResponseSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number().int(),
        name: z.string().min(1),
        latitude: z.number().finite(),
        longitude: z.number().finite(),
        country_code: z.string().optional(),
        admin1: z.string().optional(),
        country: z.string().optional(),
        postcodes: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

const ReverseResponseSchema = z.object({
  display_name: z.string().min(1),
  address: z
    .object({
      suburb: z.string().optional(),
      town: z.string().optional(),
      city: z.string().optional(),
      municipality: z.string().optional(),
      village: z.string().optional(),
      state: z.string().optional(),
      country_code: z.string().optional(),
    })
    .optional(),
});

interface WeatherLocationRow {
  label: string;
  latitude: number;
  longitude: number;
  source: 'search' | 'device';
  updated_at: string;
}

interface PendingWeatherTest {
  householdId: string;
  result: WeatherLocationTestResult;
}

export interface WeatherLocationVerifier {
  search(query: string): Promise<WeatherLocationSearchResult[]>;
  reverse(latitude: number, longitude: number): Promise<string>;
  test(configuration: OpenMeteoWeatherConfiguration, timezone: string): Promise<WeatherSummary>;
}

export interface WeatherLocationRepository {
  get(householdId: string, actorId: string): Promise<WeatherLocation | null>;
  getDisplayLabel(householdId: string): string | null;
  search(
    householdId: string,
    actorId: string,
    query: string,
  ): Promise<{ results: WeatherLocationSearchResult[] }>;
  test(
    householdId: string,
    actorId: string,
    input: WeatherLocationTestRequest,
  ): Promise<WeatherLocationTestResult>;
  save(
    householdId: string,
    actorId: string,
    input: SaveWeatherLocationRequest,
  ): Promise<WeatherLocationCommandResult>;
  reset(): void;
  close(): void;
}

export class OpenMeteoWeatherLocationVerifier implements WeatherLocationVerifier {
  constructor(
    private readonly options: {
      fetchImpl?: typeof fetch;
      searchEndpoint?: string;
      reverseEndpoint?: string;
    } = {},
  ) {}

  async search(query: string): Promise<WeatherLocationSearchResult[]> {
    const url = new URL(this.options.searchEndpoint ?? OPEN_METEO_GEOCODING_URL);
    url.searchParams.set('name', query);
    url.searchParams.set('count', '8');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');
    const response = await this.fetch(url, { headers: { accept: 'application/json' } });
    const parsed = SearchResponseSchema.safeParse(await response.json());
    if (!parsed.success)
      throw new RepositoryError('INTEGRATION_UNAVAILABLE', 'Place search is unavailable.', true);
    const results = (parsed.data.results ?? []).map((place) => ({
      id: opaqueId('weather_place', String(place.id)),
      label: placeLabel(place),
      latitude: place.latitude,
      longitude: place.longitude,
    }));
    return WeatherLocationSearchResultsSchema.parse({ results }).results;
  }

  async reverse(latitude: number, longitude: number): Promise<string> {
    const url = new URL(this.options.reverseEndpoint ?? NOMINATIM_REVERSE_URL);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('zoom', '13');
    url.searchParams.set('addressdetails', '1');
    const response = await this.fetch(url, {
      headers: {
        accept: 'application/json',
        'accept-language': 'en-AU,en;q=0.8',
        'user-agent': 'Hearth/2 private-household-weather-setup',
      },
    });
    const parsed = ReverseResponseSchema.safeParse(await response.json());
    if (!parsed.success) return 'Phone location';
    const address = parsed.data.address;
    const locality =
      address?.suburb ??
      address?.town ??
      address?.city ??
      address?.municipality ??
      address?.village;
    if (locality === undefined) return parsed.data.display_name.slice(0, 120);
    const region = abbreviateAustralianState(address?.state);
    return region === undefined ? locality : `${locality}, ${region}`;
  }

  async test(
    configuration: OpenMeteoWeatherConfiguration,
    timezone: string,
  ): Promise<WeatherSummary> {
    try {
      const snapshot = await new OpenMeteoWeatherProvider(configuration, {
        cacheMilliseconds: 0,
        ...(this.options.fetchImpl === undefined ? {} : { fetchImpl: this.options.fetchImpl }),
      }).read(timezone);
      if (snapshot.current === null) throw new WeatherUnavailableError();
      return snapshot.current.summary;
    } catch {
      throw new RepositoryError(
        'INTEGRATION_UNAVAILABLE',
        'Weather could not be checked for this location. Try again.',
        true,
      );
    }
  }

  private async fetch(url: URL, init: RequestInit): Promise<Response> {
    try {
      const response = await (this.options.fetchImpl ?? fetch)(url, init);
      if (!response.ok) throw new Error('Weather location request failed.');
      return response;
    } catch {
      throw new RepositoryError('INTEGRATION_UNAVAILABLE', 'Place search is unavailable.', true);
    }
  }
}

export class FakeWeatherLocationVerifier implements WeatherLocationVerifier {
  async search(query: string): Promise<WeatherLocationSearchResult[]> {
    if (query.toLowerCase().includes('missing')) return [];
    return [
      {
        id: 'weather_place_baldivis',
        label: 'Baldivis, WA',
        latitude: -32.328,
        longitude: 115.82,
      },
    ];
  }

  async reverse(_latitude: number, _longitude: number): Promise<string> {
    return 'Baldivis, WA';
  }

  async test(
    _configuration: OpenMeteoWeatherConfiguration,
    _timezone: string,
  ): Promise<WeatherSummary> {
    return { temperatureCelsius: 18, condition: 'Partly cloudy', source: 'open-meteo' };
  }
}

export class WeatherLocationService implements WeatherLocationRepository {
  private readonly pending = new Map<string, PendingWeatherTest>();
  private readonly receipts = new Map<string, WeatherLocationCommandResult>();
  private memoryRow: WeatherLocationRow | null = null;
  private sequence = 1;

  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly verifier: WeatherLocationVerifier,
    private readonly options: {
      database?: InstanceType<typeof Database>;
      fallback?: OpenMeteoWeatherConfiguration;
      onSaved?: (configuration: OpenMeteoWeatherConfiguration) => void;
      now?: () => Date;
    } = {},
  ) {}

  async get(householdId: string, actorId: string): Promise<WeatherLocation | null> {
    await this.adminRepository.getOverview(householdId, actorId);
    const row = this.readRow(householdId);
    if (row !== null) return locationFromRow(row);
    if (this.options.fallback === undefined) return null;
    return WeatherLocationSchema.parse({
      label: 'Server fallback location',
      ...this.options.fallback,
      source: 'environment',
      updatedAt: null,
    });
  }

  getDisplayLabel(householdId: string): string | null {
    const row = this.readRow(householdId);
    if (row !== null) return row.label;
    return this.options.fallback === undefined ? null : 'Local weather';
  }

  async search(
    householdId: string,
    actorId: string,
    query: string,
  ): Promise<{ results: WeatherLocationSearchResult[] }> {
    await this.adminRepository.getOverview(householdId, actorId);
    return WeatherLocationSearchResultsSchema.parse({ results: await this.verifier.search(query) });
  }

  async test(
    householdId: string,
    actorId: string,
    input: WeatherLocationTestRequest,
  ): Promise<WeatherLocationTestResult> {
    const overview = await this.adminRepository.getOverview(householdId, actorId);
    const label =
      input.label ??
      (await this.verifier.reverse(input.latitude, input.longitude).catch(() => 'Phone location'));
    const current = await this.verifier.test(
      { latitude: input.latitude, longitude: input.longitude },
      overview.household.timezone,
    );
    const now = this.now();
    const testId = `weather_test_${randomUUID().replaceAll('-', '_')}`;
    const result = WeatherLocationTestResultSchema.parse({
      testId,
      location: {
        label,
        latitude: input.latitude,
        longitude: input.longitude,
        source: input.source,
        updatedAt: now.toISOString(),
      },
      current,
      expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
    });
    this.pending.set(testId, { householdId, result });
    return result;
  }

  async save(
    householdId: string,
    actorId: string,
    input: SaveWeatherLocationRequest,
  ): Promise<WeatherLocationCommandResult> {
    await this.adminRepository.getOverview(householdId, actorId);
    const replay = this.readReceipt(householdId, input.requestId);
    if (replay !== null) return { ...replay, replayed: true };
    const pending = this.pending.get(input.testId);
    if (
      pending === undefined ||
      pending.householdId !== householdId ||
      Date.parse(pending.result.expiresAt) <= this.now().getTime()
    ) {
      throw new RepositoryError('CONFLICT', 'Test this weather location again before saving.');
    }
    const occurredAt = this.now().toISOString();
    const location = WeatherLocationSchema.parse({
      ...pending.result.location,
      updatedAt: occurredAt,
    });
    const row: WeatherLocationRow = {
      label: location.label,
      latitude: location.latitude,
      longitude: location.longitude,
      source: location.source === 'device' ? 'device' : 'search',
      updated_at: occurredAt,
    };
    const audit: AuditSummary = {
      id: `audit_weather_${this.sequence++}_${randomUUID().slice(0, 8)}`,
      actorType: 'member',
      actorId,
      source: 'companion',
      action: 'weather.location.update',
      targetId: opaqueId('weather_location', householdId),
      occurredAt,
      result: 'succeeded',
    };
    const result = WeatherLocationCommandResultSchema.parse({ location, audit, replayed: false });
    this.commit(() => {
      this.persistRow(householdId, row, occurredAt);
      this.writeAudit(householdId, audit, input.requestId);
      this.writeReceipt(householdId, input.requestId, result, occurredAt);
    });
    this.options.onSaved?.({ latitude: location.latitude, longitude: location.longitude });
    this.pending.delete(input.testId);
    return result;
  }

  reset(): void {
    this.pending.clear();
    this.receipts.clear();
    this.memoryRow = null;
    this.options.database?.prepare('DELETE FROM weather_locations').run();
  }

  close(): void {}

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private commit(operation: () => void): void {
    if (this.options.database === undefined) operation();
    else this.options.database.transaction(operation)();
  }

  private readRow(householdId: string): WeatherLocationRow | null {
    if (this.options.database === undefined)
      return this.memoryRow === null ? null : { ...this.memoryRow };
    return (
      (this.options.database
        .prepare(
          `SELECT label, latitude, longitude, source, updated_at
           FROM weather_locations WHERE household_id = ?`,
        )
        .get(householdId) as WeatherLocationRow | undefined) ?? null
    );
  }

  private persistRow(householdId: string, row: WeatherLocationRow, occurredAt: string): void {
    if (this.options.database === undefined) {
      this.memoryRow = { ...row };
      return;
    }
    this.options.database
      .prepare(
        `INSERT INTO weather_locations
          (household_id, label, latitude, longitude, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(household_id) DO UPDATE SET
           label = excluded.label, latitude = excluded.latitude,
           longitude = excluded.longitude, source = excluded.source,
           updated_at = excluded.updated_at`,
      )
      .run(householdId, row.label, row.latitude, row.longitude, row.source, occurredAt, occurredAt);
  }

  private readReceipt(householdId: string, requestId: string): WeatherLocationCommandResult | null {
    if (this.options.database === undefined) {
      return this.receipts.get(`${householdId}:${requestId}`) ?? null;
    }
    const row = this.options.database
      .prepare(
        `SELECT response_json FROM command_receipts
         WHERE household_id = ? AND request_id = ? AND command_type = 'weather.location.update'`,
      )
      .get(householdId, requestId) as { response_json: string } | undefined;
    return row === undefined
      ? null
      : WeatherLocationCommandResultSchema.parse(JSON.parse(row.response_json) as unknown);
  }

  private writeReceipt(
    householdId: string,
    requestId: string,
    result: WeatherLocationCommandResult,
    occurredAt: string,
  ): void {
    if (this.options.database === undefined) {
      this.receipts.set(`${householdId}:${requestId}`, result);
      return;
    }
    this.options.database
      .prepare(
        `INSERT INTO command_receipts
          (household_id, request_id, command_type, response_json, created_at)
         VALUES (?, ?, 'weather.location.update', ?, ?)`,
      )
      .run(householdId, requestId, JSON.stringify(result), occurredAt);
  }

  private writeAudit(householdId: string, audit: AuditSummary, requestId: string): void {
    this.options.database
      ?.prepare(
        `INSERT INTO audit_events
          (id, occurred_at, household_id, actor_type, actor_id, source_channel, action_type,
           target_type, target_id, request_id, result, safe_summary_json)
         VALUES (?, ?, ?, 'member', ?, 'companion', ?, 'weather_location', ?, ?, ?, ?)`,
      )
      .run(
        audit.id,
        audit.occurredAt,
        householdId,
        audit.actorId,
        audit.action,
        audit.targetId,
        requestId,
        audit.result,
        JSON.stringify({ label: this.readRow(householdId)?.label ?? 'Weather location' }),
      );
  }
}

export function readStoredWeatherConfiguration(
  database: InstanceType<typeof Database>,
  householdId: string | null,
): OpenMeteoWeatherConfiguration | null {
  if (householdId === null) return null;
  const row = database
    .prepare('SELECT latitude, longitude FROM weather_locations WHERE household_id = ?')
    .get(householdId) as { latitude: number; longitude: number } | undefined;
  return row ?? null;
}

function locationFromRow(row: WeatherLocationRow): WeatherLocation {
  return WeatherLocationSchema.parse({
    label: row.label,
    latitude: row.latitude,
    longitude: row.longitude,
    source: row.source,
    updatedAt: row.updated_at,
  });
}

type SearchPlace = NonNullable<z.infer<typeof SearchResponseSchema>['results']>[number];

function placeLabel(place: SearchPlace): string {
  const region = abbreviateAustralianState(place.admin1);
  if (place.country_code?.toUpperCase() === 'AU' && region !== undefined) {
    return `${place.name}, ${region}`;
  }
  return [place.name, place.admin1, place.country].filter(Boolean).join(', ').slice(0, 120);
}

function abbreviateAustralianState(state: string | undefined): string | undefined {
  if (state === undefined) return undefined;
  return (
    (
      {
        'Western Australia': 'WA',
        'South Australia': 'SA',
        Queensland: 'QLD',
        'New South Wales': 'NSW',
        Victoria: 'VIC',
        Tasmania: 'TAS',
        'Northern Territory': 'NT',
        'Australian Capital Territory': 'ACT',
      } as Record<string, string>
    )[state] ?? state
  );
}

function opaqueId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 20)}`;
}
