import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { z } from 'zod';

import { HomeAssistantConnectionTestRequestSchema } from '@hearth/shared';

import {
  HomeAssistantUnavailableError,
  UnconfiguredHomeAssistantProvider,
  type AllowedHomeAssistantScript,
  type HomeAssistantProvider,
  type HomeAssistantSnapshot,
} from './home-assistant-provider.js';

const EntityIdSchema = z
  .string()
  .max(255)
  .regex(/^[a-z0-9_]+\.[a-z0-9_]+$/);
const ScriptEntityIdSchema = EntityIdSchema.refine((value) => value.startsWith('script.'));

export const HomeAssistantRuntimeConfigSchema = z
  .object({
    version: z.literal(1),
    provider: z.literal('home-assistant'),
    serverUrl: HomeAssistantConnectionTestRequestSchema.shape.serverUrl,
    accessToken: HomeAssistantConnectionTestRequestSchema.shape.accessToken,
    stateMappings: z
      .object({
        occupancy: EntityIdSchema,
        televisionPower: EntityIdSchema,
        hearthForeground: EntityIdSchema,
        protectedMedia: EntityIdSchema,
      })
      .strict(),
    actionMappings: z
      .object({
        evening: ScriptEntityIdSchema,
        goodnight: ScriptEntityIdSchema,
        screenOff: ScriptEntityIdSchema,
      })
      .strict(),
  })
  .strict();

const HomeAssistantConfigurationSchema = z
  .object({
    location_name: z.string().trim().min(1).max(100),
    version: z.string().trim().min(1).max(40),
  })
  .passthrough();

const HomeAssistantStateSchema = z
  .object({
    entity_id: EntityIdSchema,
    state: z.string().max(255),
    last_changed: z.iso.datetime({ offset: true }),
    last_updated: z.iso.datetime({ offset: true }).optional(),
    attributes: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

const HomeAssistantStatesSchema = z.array(HomeAssistantStateSchema).max(20_000);

export interface HomeAssistantDiscoveryCandidate {
  externalId: string;
  displayName: string;
  kindLabel: string;
}

export interface HomeAssistantDiscovery {
  instanceName: string;
  version: string;
  options: {
    occupancy: HomeAssistantDiscoveryCandidate[];
    televisionPower: HomeAssistantDiscoveryCandidate[];
    hearthForeground: HomeAssistantDiscoveryCandidate[];
    protectedMedia: HomeAssistantDiscoveryCandidate[];
    scripts: HomeAssistantDiscoveryCandidate[];
  };
}

export type HomeAssistantRuntimeConfig = z.infer<typeof HomeAssistantRuntimeConfigSchema>;
export type HomeAssistantFetch = typeof fetch;

class HomeAssistantRuntimeReadError extends Error {
  constructor(readonly missing: boolean) {
    super('Hearth could not read the Home Assistant secret configuration.');
  }
}

export class ManagedHomeAssistantProvider implements HomeAssistantProvider {
  private provider: HomeAssistantProvider = new UnconfiguredHomeAssistantProvider();

  get configured(): boolean {
    return this.provider.configured;
  }

  configure(provider: HomeAssistantProvider): void {
    this.provider = provider;
  }

  disconnect(): void {
    this.provider = new UnconfiguredHomeAssistantProvider();
  }

  readHouseholdState(): Promise<HomeAssistantSnapshot> {
    return this.provider.readHouseholdState();
  }

  runScript(script: AllowedHomeAssistantScript): Promise<void> {
    return this.provider.runScript(script);
  }
}

export class HomeAssistantRestProvider implements HomeAssistantProvider {
  readonly configured = true;

  constructor(
    private readonly config: HomeAssistantRuntimeConfig,
    private readonly fetcher: HomeAssistantFetch = fetch,
  ) {}

  async readHouseholdState(): Promise<HomeAssistantSnapshot> {
    const mappings = this.config.stateMappings;
    const [occupancy, televisionPower, hearthForeground, protectedMedia] = await Promise.all([
      this.readState(mappings.occupancy),
      this.readState(mappings.televisionPower),
      this.readState(mappings.hearthForeground),
      this.readState(mappings.protectedMedia),
    ]);
    return {
      occupied: activeState(occupancy.state),
      televisionPower: televisionPowerState(televisionPower.state),
      hearthForeground: activeState(hearthForeground.state),
      protectedMediaActive: activeState(protectedMedia.state),
      observedAt: latestTimestamp([
        occupancy.last_updated ?? occupancy.last_changed,
        televisionPower.last_updated ?? televisionPower.last_changed,
        hearthForeground.last_updated ?? hearthForeground.last_changed,
        protectedMedia.last_updated ?? protectedMedia.last_changed,
      ]),
    };
  }

  async runScript(script: AllowedHomeAssistantScript): Promise<void> {
    const entityId = this.actionEntityId(script);
    await homeAssistantRequest(this.config, '/api/services/script/turn_on', this.fetcher, {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    });
  }

  private async readState(entityId: string) {
    const response = await homeAssistantRequest(
      this.config,
      `/api/states/${encodeURIComponent(entityId)}`,
      this.fetcher,
    );
    return parseHomeAssistantJson(HomeAssistantStateSchema, response);
  }

  private actionEntityId(script: AllowedHomeAssistantScript): string {
    if (script === 'script.hearth_evening') return this.config.actionMappings.evening;
    if (script === 'script.hearth_goodnight') return this.config.actionMappings.goodnight;
    return this.config.actionMappings.screenOff;
  }
}

export async function discoverHomeAssistant(
  input: z.infer<typeof HomeAssistantConnectionTestRequestSchema>,
  fetcher: HomeAssistantFetch = fetch,
): Promise<HomeAssistantDiscovery> {
  const config = HomeAssistantConnectionTestRequestSchema.parse(input);
  const runtime = {
    version: 1 as const,
    provider: 'home-assistant' as const,
    ...config,
    stateMappings: {
      occupancy: 'input_boolean.placeholder',
      televisionPower: 'input_boolean.placeholder',
      hearthForeground: 'input_boolean.placeholder',
      protectedMedia: 'input_boolean.placeholder',
    },
    actionMappings: {
      evening: 'script.placeholder_evening',
      goodnight: 'script.placeholder_goodnight',
      screenOff: 'script.placeholder_screen_off',
    },
  } satisfies HomeAssistantRuntimeConfig;
  const [configurationResponse, statesResponse] = await Promise.all([
    homeAssistantRequest(runtime, '/api/config', fetcher),
    homeAssistantRequest(runtime, '/api/states', fetcher),
  ]);
  const configuration = await parseHomeAssistantJson(
    HomeAssistantConfigurationSchema,
    configurationResponse,
  );
  const states = await parseHomeAssistantJson(HomeAssistantStatesSchema, statesResponse);
  return {
    instanceName: configuration.location_name,
    version: configuration.version,
    options: discoveryOptions(states),
  };
}

export async function resolveHomeAssistantProvider(input: {
  demoMode: boolean;
  configPath: string | undefined;
  fetcher?: HomeAssistantFetch;
}): Promise<HomeAssistantProvider | null> {
  if (input.demoMode) {
    if (input.configPath !== undefined) {
      throw new Error('HEARTH_HOME_ASSISTANT_CONFIG_PATH is disabled while HEARTH_MODE=demo.');
    }
    return null;
  }
  if (input.configPath === undefined) return new UnconfiguredHomeAssistantProvider();
  try {
    return await loadHomeAssistantProvider(input.configPath, input.fetcher);
  } catch (error) {
    if (error instanceof HomeAssistantRuntimeReadError && error.missing) {
      return new UnconfiguredHomeAssistantProvider();
    }
    throw error;
  }
}

export async function loadHomeAssistantProvider(
  configPath: string,
  fetcher?: HomeAssistantFetch,
): Promise<HomeAssistantProvider> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(configPath, 'utf8')) as unknown;
  } catch (error) {
    const missing =
      typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
    throw new HomeAssistantRuntimeReadError(missing);
  }
  return createHomeAssistantProvider(value, fetcher);
}

export function createHomeAssistantProvider(
  value: unknown,
  fetcher?: HomeAssistantFetch,
): HomeAssistantProvider {
  const parsed = HomeAssistantRuntimeConfigSchema.safeParse(value);
  if (!parsed.success) {
    const paths = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].filter(
      Boolean,
    );
    throw new Error(
      `Home Assistant secret configuration is invalid${paths.length === 0 ? '' : ` at ${paths.join(', ')}`}.`,
    );
  }
  return new HomeAssistantRestProvider(parsed.data, fetcher);
}

export async function writeHomeAssistantRuntimeConfig(
  configPath: string,
  value: HomeAssistantRuntimeConfig,
): Promise<void> {
  const parsed = HomeAssistantRuntimeConfigSchema.parse(value);
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${configPath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, configPath);
    await chmod(configPath, 0o600);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function removeHomeAssistantRuntimeConfig(configPath: string): Promise<void> {
  await rm(configPath, { force: true });
}

async function homeAssistantRequest(
  config: Pick<HomeAssistantRuntimeConfig, 'serverUrl' | 'accessToken'>,
  path: string,
  fetcher: HomeAssistantFetch,
  init: RequestInit = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(new URL(path, config.serverUrl), {
      ...init,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(8_000),
    });
  } catch {
    throw new HomeAssistantUnavailableError(
      'Home Assistant could not be reached on the local network.',
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new HomeAssistantUnavailableError('Home Assistant did not accept that access token.');
  }
  if (!response.ok) {
    throw new HomeAssistantUnavailableError('Home Assistant did not accept the connection.');
  }
  return response;
}

async function parseHomeAssistantJson<T>(schema: z.ZodType<T>, response: Response): Promise<T> {
  try {
    return schema.parse(await response.json());
  } catch {
    throw new HomeAssistantUnavailableError('Home Assistant returned an unexpected response.');
  }
}

function discoveryOptions(states: z.infer<typeof HomeAssistantStatesSchema>) {
  const candidates = states.map(toCandidate);
  const withDomains = (domains: Set<string>) =>
    candidates.filter((candidate) => domains.has(candidate.domain));
  return {
    occupancy: publicCandidates(
      withDomains(new Set(['person', 'device_tracker', 'binary_sensor', 'input_boolean'])),
    ),
    televisionPower: publicCandidates(
      withDomains(new Set(['media_player', 'remote', 'input_boolean'])),
    ),
    hearthForeground: publicCandidates(withDomains(new Set(['input_boolean', 'binary_sensor']))),
    protectedMedia: publicCandidates(
      withDomains(new Set(['input_boolean', 'binary_sensor', 'media_player'])),
    ),
    scripts: publicCandidates(withDomains(new Set(['script']))),
  };
}

function toCandidate(state: z.infer<typeof HomeAssistantStateSchema>) {
  const [domain = '', objectId = state.entity_id] = state.entity_id.split('.', 2);
  const friendlyName = state.attributes.friendly_name;
  return {
    domain,
    externalId: state.entity_id,
    displayName:
      typeof friendlyName === 'string' && friendlyName.trim() !== ''
        ? friendlyName.trim().slice(0, 100)
        : objectId
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
            .slice(0, 100),
    kindLabel: domainLabel(domain),
  };
}

function publicCandidates(
  candidates: Array<{
    externalId: string;
    displayName: string;
    kindLabel: string;
  }>,
): HomeAssistantDiscoveryCandidate[] {
  return candidates
    .map(({ externalId, displayName, kindLabel }) => ({ externalId, displayName, kindLabel }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .slice(0, 80);
}

function domainLabel(domain: string): string {
  const labels: Record<string, string> = {
    person: 'Person presence',
    device_tracker: 'Device presence',
    binary_sensor: 'Binary sensor',
    input_boolean: 'Helper toggle',
    media_player: 'Media player',
    remote: 'Television remote',
    script: 'Script',
  };
  return labels[domain] ?? 'Home Assistant state';
}

function activeState(state: string): boolean {
  const normalized = state.toLowerCase();
  if (['unavailable', 'unknown', 'none', 'null'].includes(normalized)) {
    throw new HomeAssistantUnavailableError('A mapped Home Assistant state is unavailable.');
  }
  return ['on', 'home', 'true', 'occupied', 'playing', 'paused'].includes(normalized);
}

function televisionPowerState(state: string): 'on' | 'standby' {
  const normalized = state.toLowerCase();
  if (['unavailable', 'unknown', 'none', 'null'].includes(normalized)) {
    throw new HomeAssistantUnavailableError('The mapped television state is unavailable.');
  }
  return ['off', 'standby'].includes(normalized) ? 'standby' : 'on';
}

function latestTimestamp(timestamps: string[]): string {
  return timestamps.reduce((latest, candidate) =>
    Date.parse(candidate) > Date.parse(latest) ? candidate : latest,
  );
}
