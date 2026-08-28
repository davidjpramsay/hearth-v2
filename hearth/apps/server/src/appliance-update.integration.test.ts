import { describe, expect, it, vi } from 'vitest';

import type { ApplianceUpdateOperation } from '@hearth/shared';

import { InMemoryAdminRepository } from './admin-repository.js';
import {
  ApplianceUpdateService,
  GitHubVerifiedReleaseProvider,
  UnavailableApplianceUpdateService,
  createApplianceUpdateRepository,
  type ApplianceUpdateBridge,
  type VerifiedReleaseProvider,
} from './appliance-update.js';
import { InMemorySystemOperations } from './system-operations.js';
import { FixedClock } from './runtime-context.js';

const clock = new FixedClock('2026-08-28T08:30:00+08:00');
const installedVersion = 'a'.repeat(40);
const targetVersion = 'b'.repeat(40);

class FakeBridge implements ApplianceUpdateBridge {
  readonly enqueued: Array<{ requestId: string; targetVersion: string }> = [];
  requestId: string | null = null;
  operation: ApplianceUpdateOperation = {
    phase: 'idle',
    progress: 0,
    message: 'Ready to install a verified update.',
    targetVersion: null,
    startedAt: null,
    completedAt: null,
  };

  async status() {
    return {
      operation: this.operation,
      requestId: this.requestId,
      storage: { state: 'ready' as const, message: 'Storage check passed.' },
    };
  }

  async enqueue(input: { requestId: string; targetVersion: string }) {
    this.enqueued.push(input);
    this.requestId = input.requestId;
    this.operation = {
      phase: 'queued',
      progress: 10,
      message: 'Update queued.',
      targetVersion: input.targetVersion,
      startedAt: clock.now().toISOString(),
      completedAt: null,
    };
  }
}

describe('appliance updates', () => {
  it('backs up first, queues only the verified release and records an idempotent adult action', async () => {
    const admin = new InMemoryAdminRepository(() => clock.now());
    const backups = new InMemorySystemOperations(admin, {
      version: installedVersion,
      mode: 'private',
      clock,
    });
    const provider: VerifiedReleaseProvider = {
      latest: async () => ({
        version: targetVersion,
        publishedAt: '2026-08-28T00:15:00.000Z',
        summary: 'Verified household release',
      }),
    };
    const bridge = new FakeBridge();
    const service = new ApplianceUpdateService(admin, backups, provider, bridge, {
      installedVersion,
      platform: 'synology',
      clock,
    });

    const status = await service.getStatus('household_hearth_demo', 'member_maya');
    expect(status).toMatchObject({
      supported: true,
      platform: 'synology',
      updateAvailable: true,
      canInstall: true,
      availableRelease: { version: targetVersion },
    });
    await expect(service.getStatus('household_hearth_demo', 'member_ezra')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    const first = await service.install('household_hearth_demo', 'member_maya', {
      requestId: 'request_appliance_update_test',
      targetVersion,
    });
    expect(first).toMatchObject({
      replayed: false,
      backup: { state: 'ready' },
      audit: { action: 'system.update.install', actorId: 'member_maya' },
      status: { operation: { phase: 'queued', targetVersion } },
    });
    expect(bridge.enqueued).toEqual([
      { requestId: 'request_appliance_update_test', targetVersion },
    ]);

    const replay = await service.install('household_hearth_demo', 'member_maya', {
      requestId: 'request_appliance_update_test',
      targetVersion,
    });
    expect(replay.replayed).toBe(true);
    expect(bridge.enqueued).toHaveLength(1);
    expect((await admin.getActivity('household_hearth_demo', 'member_maya', 10))[0]).toMatchObject({
      action: 'system.update.install',
    });

    bridge.operation = {
      phase: 'succeeded',
      progress: 100,
      message: 'Update installed and checked.',
      targetVersion,
      startedAt: clock.now().toISOString(),
      completedAt: '2026-08-28T00:35:00.000Z',
    };
    await service.getStatus('household_hearth_demo', 'member_maya');
    await service.getStatus('household_hearth_demo', 'member_maya');
    expect(await admin.getActivity('household_hearth_demo', 'member_maya', 10)).toMatchObject([
      {
        actorType: 'system',
        action: 'system.update.complete',
        result: 'succeeded',
      },
      { action: 'system.update.install', actorId: 'member_maya' },
      { action: 'system.backup.create', actorId: 'member_maya' },
    ]);
  });

  it('rejects an arbitrary or stale release identifier', async () => {
    const admin = new InMemoryAdminRepository(() => clock.now());
    const backups = new InMemorySystemOperations(admin, {
      version: installedVersion,
      mode: 'private',
      clock,
    });
    const bridge = new FakeBridge();
    const service = new ApplianceUpdateService(
      admin,
      backups,
      {
        latest: async () => ({
          version: targetVersion,
          publishedAt: '2026-08-28T00:15:00.000Z',
          summary: 'Verified household release',
        }),
      },
      bridge,
      { installedVersion, platform: 'synology', clock },
    );

    await expect(
      service.install('household_hearth_demo', 'member_maya', {
        requestId: 'request_appliance_update_stale',
        targetVersion: 'c'.repeat(40),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(bridge.enqueued).toHaveLength(0);
  });

  it('discovers and caches only the newest successful push workflow release', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workflow_runs: [{ head_sha: targetVersion, updated_at: '2026-08-28T00:15:00Z' }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ commit: { message: 'Verified release\n\nDetails' } }), {
          status: 200,
        }),
      );
    const provider = new GitHubVerifiedReleaseProvider({
      repository: 'davidjpramsay/hearth-v2',
      workflow: 'verify.yml',
      branch: 'main',
      fetch: fetcher,
      now: () => clock.now(),
    });

    await expect(provider.latest()).resolves.toEqual({
      version: targetVersion,
      publishedAt: '2026-08-28T00:15:00Z',
      summary: 'Verified release',
    });
    await provider.latest();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      'branch=main&event=push&status=success&per_page=1',
    );
  });

  it('keeps development installs unsupported and fails partial configuration closed', async () => {
    const admin = new InMemoryAdminRepository(() => clock.now());
    const unavailable = new UnavailableApplianceUpdateService(admin, {
      installedVersion: 'development',
      clock,
    });
    await expect(
      unavailable.getStatus('household_hearth_demo', 'member_maya'),
    ).resolves.toMatchObject({ supported: false, platform: 'development' });

    expect(() =>
      createApplianceUpdateRepository({
        environment: { HEARTH_UPDATE_PLATFORM: 'synology' },
        adminRepository: admin,
        systemOperations: new InMemorySystemOperations(admin, {
          version: installedVersion,
          mode: 'private',
          clock,
        }),
        clock,
      }),
    ).toThrow(/configured together/);
  });
});
