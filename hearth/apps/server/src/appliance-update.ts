import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { z } from 'zod';

import {
  ApplianceUpdateCommandResultSchema,
  ApplianceUpdateOperationSchema,
  ApplianceUpdateStatusSchema,
  AuditSummarySchema,
  type ApplianceUpdateCommandResult,
  type ApplianceUpdateOperation,
  type ApplianceUpdateStatus,
  type InstallApplianceUpdateRequest,
} from '@hearth/shared';

import type { AdminRepository } from './admin-repository.js';
import { RepositoryError } from './repository.js';
import type { HearthClock } from './runtime-context.js';
import type { SystemOperationsRepository } from './system-operations.js';

const UPDATE_COMMAND = 'system.update.install';
const ACTIVE_PHASES = new Set(['queued', 'installing', 'checking-health', 'rolling-back']);
const RELEASE_CACHE_MS = 5 * 60 * 1000;

const AgentStatusSchema = z.object({
  requestId: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{1,95}$/)
    .nullable(),
  phase: ApplianceUpdateOperationSchema.shape.phase,
  progress: ApplianceUpdateOperationSchema.shape.progress,
  message: ApplianceUpdateOperationSchema.shape.message,
  targetVersion: ApplianceUpdateOperationSchema.shape.targetVersion,
  startedAt: ApplianceUpdateOperationSchema.shape.startedAt,
  completedAt: ApplianceUpdateOperationSchema.shape.completedAt,
  storage: z.object({
    state: z.enum(['ready', 'attention']),
    message: z.string().trim().min(1).max(160),
  }),
});

const GitHubRunsSchema = z.object({
  workflow_runs: z
    .array(
      z.object({
        head_sha: z.string().regex(/^[a-f0-9]{40}$/),
        updated_at: z.iso.datetime({ offset: true }),
      }),
    )
    .min(1),
});

const GitHubCommitSchema = z.object({
  commit: z.object({ message: z.string().min(1) }),
});

export interface VerifiedRelease {
  version: string;
  publishedAt: string;
  summary: string;
}

export interface VerifiedReleaseProvider {
  latest(): Promise<VerifiedRelease>;
}

export interface ApplianceUpdateBridge {
  status(): Promise<{
    operation: ApplianceUpdateOperation;
    requestId: string | null;
    storage: AgentStatus['storage'];
  }>;
  enqueue(input: { requestId: string; targetVersion: string }): Promise<void>;
}

export interface ApplianceUpdateRepository {
  getStatus(householdId: string, actorId: string): Promise<ApplianceUpdateStatus>;
  install(
    householdId: string,
    actorId: string,
    input: InstallApplianceUpdateRequest,
  ): Promise<ApplianceUpdateCommandResult>;
}

type AgentStatus = z.infer<typeof AgentStatusSchema>;

export class GitHubVerifiedReleaseProvider implements VerifiedReleaseProvider {
  private cached: { release: VerifiedRelease; expiresAt: number } | null = null;

  constructor(
    private readonly options: {
      repository: string;
      workflow: string;
      branch: string;
      fetch?: typeof fetch;
      now?: () => Date;
    },
  ) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repository)) {
      throw new Error('HEARTH_UPDATE_REPOSITORY must be an owner/repository name.');
    }
    if (!/^[A-Za-z0-9_.-]+$/.test(options.workflow)) {
      throw new Error('HEARTH_UPDATE_WORKFLOW must be a workflow file name.');
    }
    if (!/^[A-Za-z0-9._/-]+$/.test(options.branch)) {
      throw new Error('HEARTH_UPDATE_BRANCH contains unsupported characters.');
    }
  }

  async latest(): Promise<VerifiedRelease> {
    const now = (this.options.now ?? (() => new Date()))();
    if (this.cached !== null && this.cached.expiresAt > now.getTime()) {
      return this.cached.release;
    }
    const fetcher = this.options.fetch ?? fetch;
    const base = `https://api.github.com/repos/${this.options.repository}`;
    const runsUrl = new URL(`${base}/actions/workflows/${this.options.workflow}/runs`);
    runsUrl.searchParams.set('branch', this.options.branch);
    runsUrl.searchParams.set('event', 'push');
    runsUrl.searchParams.set('status', 'success');
    runsUrl.searchParams.set('per_page', '1');
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Hearth-appliance-updater',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const runsResponse = await fetcher(runsUrl, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    if (!runsResponse.ok) throw new Error('Verified release service is unavailable.');
    const runs = GitHubRunsSchema.parse(await runsResponse.json());
    const run = runs.workflow_runs[0]!;
    const commitResponse = await fetcher(`${base}/commits/${run.head_sha}`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    if (!commitResponse.ok) throw new Error('Verified release notes are unavailable.');
    const commit = GitHubCommitSchema.parse(await commitResponse.json());
    const release = {
      version: run.head_sha,
      publishedAt: run.updated_at,
      summary: commit.commit.message.split('\n', 1)[0]!.trim().slice(0, 180),
    };
    this.cached = { release, expiresAt: now.getTime() + RELEASE_CACHE_MS };
    return release;
  }
}

export class FileApplianceUpdateBridge implements ApplianceUpdateBridge {
  private readonly commandPath: string;
  private readonly statusPath: string;

  constructor(controlDirectory: string) {
    if (!isAbsolute(controlDirectory) || resolve(controlDirectory) === '/') {
      throw new Error('HEARTH_UPDATE_CONTROL_DIR must be a dedicated absolute directory.');
    }
    this.commandPath = join(resolve(controlDirectory), 'commands');
    this.statusPath = join(resolve(controlDirectory), 'status.json');
  }

  async status(): Promise<{
    operation: ApplianceUpdateOperation;
    requestId: string | null;
    storage: AgentStatus['storage'];
  }> {
    try {
      const parsed = AgentStatusSchema.parse(JSON.parse(await readFile(this.statusPath, 'utf8')));
      const { requestId, storage, ...operation } = parsed;
      return { operation, requestId, storage };
    } catch {
      return {
        operation: idleOperation('Update service is not ready.'),
        requestId: null,
        storage: {
          state: 'attention',
          message: 'Finish the one-time appliance update setup.',
        },
      };
    }
  }

  async enqueue(input: { requestId: string; targetVersion: string }): Promise<void> {
    let handle;
    try {
      handle = await open(this.commandPath, constants.O_WRONLY | constants.O_NONBLOCK);
      await handle.writeFile(`${input.requestId} ${input.targetVersion}\n`);
    } catch {
      throw new RepositoryError(
        'INTEGRATION_UNAVAILABLE',
        'The appliance update service is not running.',
        true,
      );
    } finally {
      await handle?.close();
    }
  }
}

export class ApplianceUpdateService implements ApplianceUpdateRepository {
  private readonly receipts = new Map<string, ApplianceUpdateCommandResult>();

  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly systemOperations: SystemOperationsRepository,
    private readonly provider: VerifiedReleaseProvider,
    private readonly bridge: ApplianceUpdateBridge,
    private readonly options: {
      installedVersion: string;
      platform: 'synology' | 'termux';
      clock: HearthClock;
    },
  ) {}

  async getStatus(householdId: string, actorId: string): Promise<ApplianceUpdateStatus> {
    await this.adminRepository.getOverview(householdId, actorId);
    const bridge = await this.bridge.status();
    this.recordTerminalResult(householdId, bridge.requestId, bridge.operation);
    try {
      const release = await this.provider.latest();
      const updateAvailable = release.version !== this.options.installedVersion;
      const idle = !ACTIVE_PHASES.has(bridge.operation.phase);
      return ApplianceUpdateStatusSchema.parse({
        supported: true,
        platform: this.options.platform,
        installedVersion: this.options.installedVersion,
        checkedAt: this.options.clock.now().toISOString(),
        availableRelease: release,
        updateAvailable,
        canInstall: updateAvailable && idle && bridge.storage.state === 'ready',
        checks: {
          internet: { state: 'ready', message: 'Verified release service is reachable.' },
          storage: bridge.storage,
          power: {
            state: 'unavailable',
            message: 'Power protection cannot be checked on this appliance.',
          },
        },
        operation: bridge.operation,
      });
    } catch {
      return ApplianceUpdateStatusSchema.parse({
        supported: true,
        platform: this.options.platform,
        installedVersion: this.options.installedVersion,
        checkedAt: this.options.clock.now().toISOString(),
        availableRelease: null,
        updateAvailable: false,
        canInstall: false,
        checks: {
          internet: {
            state: 'attention',
            message: 'Hearth cannot check verified releases right now.',
          },
          storage: bridge.storage,
          power: {
            state: 'unavailable',
            message: 'Power protection cannot be checked on this appliance.',
          },
        },
        operation: bridge.operation,
      });
    }
  }

  private recordTerminalResult(
    householdId: string,
    requestId: string | null,
    operation: ApplianceUpdateOperation,
  ): void {
    if (
      requestId === null ||
      operation.targetVersion === null ||
      operation.completedAt === null ||
      (operation.phase !== 'succeeded' && operation.phase !== 'failed')
    ) {
      return;
    }
    const result = operation.phase === 'succeeded' ? 'succeeded' : 'failed';
    this.adminRepository.recordActivity(
      householdId,
      AuditSummarySchema.parse({
        id: `audit_${digest(`${householdId}:${requestId}:result:${result}`).slice(0, 40)}`,
        actorType: 'system',
        actorId: 'system_appliance_updater',
        source: 'system',
        action: 'system.update.complete',
        targetId: `release_${operation.targetVersion.slice(0, 32)}`,
        occurredAt: operation.completedAt,
        result,
      }),
      `${requestId}_result`,
    );
  }

  async install(
    householdId: string,
    actorId: string,
    input: InstallApplianceUpdateRequest,
  ): Promise<ApplianceUpdateCommandResult> {
    await this.adminRepository.getOverview(householdId, actorId);
    const receiptKey = `${householdId}:${input.requestId}`;
    const replay = this.receipts.get(receiptKey);
    if (replay !== undefined) return { ...replay, replayed: true };
    const status = await this.getStatus(householdId, actorId);
    if (status.availableRelease?.version !== input.targetVersion || !status.updateAvailable) {
      throw new RepositoryError('CONFLICT', 'Refresh System health before installing this update.');
    }
    if (!status.canInstall) {
      throw new RepositoryError(
        'INTEGRATION_UNAVAILABLE',
        'Hearth is not ready to install an update yet.',
        true,
      );
    }
    const backup = await this.systemOperations.createBackup(
      householdId,
      actorId,
      `${input.requestId}_backup`,
    );
    await this.bridge.enqueue(input);
    const occurredAt = this.options.clock.now().toISOString();
    const queuedStatus = ApplianceUpdateStatusSchema.parse({
      ...status,
      checkedAt: occurredAt,
      canInstall: false,
      operation: {
        phase: 'queued',
        progress: 10,
        message: 'Update queued.',
        targetVersion: input.targetVersion,
        startedAt: occurredAt,
        completedAt: null,
      },
    });
    const audit = AuditSummarySchema.parse({
      id: `audit_${digest(`${householdId}:${input.requestId}:${occurredAt}`).slice(0, 40)}`,
      actorType: 'member',
      actorId,
      source: 'companion',
      action: UPDATE_COMMAND,
      targetId: `release_${input.targetVersion.slice(0, 32)}`,
      occurredAt,
      result: 'succeeded',
    });
    this.adminRepository.recordActivity(householdId, audit, input.requestId);
    const result = ApplianceUpdateCommandResultSchema.parse({
      status: queuedStatus,
      backup: backup.status.backup,
      audit,
      replayed: false,
    });
    this.receipts.set(receiptKey, result);
    return result;
  }
}

export class UnavailableApplianceUpdateService implements ApplianceUpdateRepository {
  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly options: { installedVersion: string; clock: HearthClock },
  ) {}

  async getStatus(householdId: string, actorId: string): Promise<ApplianceUpdateStatus> {
    await this.adminRepository.getOverview(householdId, actorId);
    return ApplianceUpdateStatusSchema.parse({
      supported: false,
      platform: 'development',
      installedVersion: this.options.installedVersion,
      checkedAt: this.options.clock.now().toISOString(),
      availableRelease: null,
      updateAvailable: false,
      canInstall: false,
      checks: {
        internet: { state: 'unavailable', message: 'Not used for this installation.' },
        storage: { state: 'unavailable', message: 'Not used for this installation.' },
        power: { state: 'unavailable', message: 'Not used for this installation.' },
      },
      operation: idleOperation('Updates are managed outside this development installation.'),
    });
  }

  async install(): Promise<ApplianceUpdateCommandResult> {
    throw new RepositoryError(
      'INTEGRATION_UNAVAILABLE',
      'Appliance updates are not available on this installation.',
    );
  }
}

export function createApplianceUpdateRepository(input: {
  environment: NodeJS.ProcessEnv;
  adminRepository: AdminRepository;
  systemOperations: SystemOperationsRepository;
  clock: HearthClock;
}): ApplianceUpdateRepository {
  const installedVersion = input.environment.HEARTH_VERSION?.trim() || 'development';
  const platform = input.environment.HEARTH_UPDATE_PLATFORM?.trim();
  const controlDirectory = input.environment.HEARTH_UPDATE_CONTROL_DIR?.trim();
  const repository = input.environment.HEARTH_UPDATE_REPOSITORY?.trim();
  if (platform === undefined && controlDirectory === undefined && repository === undefined) {
    return new UnavailableApplianceUpdateService(input.adminRepository, {
      installedVersion,
      clock: input.clock,
    });
  }
  if (
    (platform !== 'synology' && platform !== 'termux') ||
    controlDirectory === undefined ||
    repository === undefined
  ) {
    throw new Error(
      'HEARTH_UPDATE_PLATFORM, HEARTH_UPDATE_CONTROL_DIR and HEARTH_UPDATE_REPOSITORY must be configured together.',
    );
  }
  const provider = new GitHubVerifiedReleaseProvider({
    repository,
    workflow: input.environment.HEARTH_UPDATE_WORKFLOW?.trim() || 'verify.yml',
    branch: input.environment.HEARTH_UPDATE_BRANCH?.trim() || 'main',
  });
  return new ApplianceUpdateService(
    input.adminRepository,
    input.systemOperations,
    provider,
    new FileApplianceUpdateBridge(controlDirectory),
    { installedVersion, platform, clock: input.clock },
  );
}

function idleOperation(message: string): ApplianceUpdateOperation {
  return ApplianceUpdateOperationSchema.parse({
    phase: 'idle',
    progress: 0,
    message,
    targetVersion: null,
    startedAt: null,
    completedAt: null,
  });
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
