import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApplianceUpdateStatus, RuntimeContext, SystemStatus } from '@hearth/shared';

import { adminApi } from '../api/admin';
import { configureHearthClient, HearthApiError } from '../api/core';
import { authenticateWithPasskey } from '../auth/passkeys';
import { useApplianceUpdateQuery, useSystemStatusQuery } from '../hooks/useAdminQueries';
import {
  useCalendarConnectionQuery,
  useHomeAssistantConnectionQuery,
} from '../hooks/useConnectionQueries';
import { usePhotoSourceQuery } from '../hooks/usePhotoQueries';
import { RuntimeContextValue } from '../runtime/context';
import { SystemHealthScreen } from './SystemHealthScreen';

vi.mock('../auth/passkeys', () => ({ authenticateWithPasskey: vi.fn() }));
vi.mock('../hooks/useAdminQueries', () => ({
  useApplianceUpdateQuery: vi.fn(),
  useSystemStatusQuery: vi.fn(),
}));
vi.mock('../hooks/useConnectionQueries', () => ({
  useCalendarConnectionQuery: vi.fn(),
  useHomeAssistantConnectionQuery: vi.fn(),
}));
vi.mock('../hooks/usePhotoQueries', () => ({ usePhotoSourceQuery: vi.fn() }));

const installedVersion = 'a'.repeat(40);
const targetVersion = 'b'.repeat(40);

const updateStatus: ApplianceUpdateStatus = {
  supported: true,
  platform: 'synology',
  installedVersion,
  checkedAt: '2026-08-28T00:30:00.000Z',
  availableRelease: {
    version: targetVersion,
    publishedAt: '2026-08-28T00:15:00.000Z',
    summary: 'Verified household release',
  },
  updateAvailable: true,
  canInstall: true,
  checks: {
    internet: { state: 'ready', message: 'Ready.' },
    storage: { state: 'ready', message: 'Ready.' },
    power: { state: 'unavailable', message: 'Not available.' },
  },
  operation: {
    phase: 'idle',
    progress: 0,
    message: 'Ready.',
    targetVersion: null,
    startedAt: null,
    completedAt: null,
  },
};

const systemStatus: SystemStatus = {
  generatedAt: '2026-08-28T00:30:00.000Z',
  mode: 'private',
  version: installedVersion,
  database: { state: 'ready', migrationVersion: 27, message: 'Ready.' },
  backup: {
    state: 'ready',
    scheduled: true,
    retentionCount: 14,
    lastSuccessfulAt: '2026-08-28T00:15:00.000Z',
    sizeBytes: 2_000_000,
    message: 'Ready.',
  },
};

const runtime: RuntimeContext = {
  mode: 'private',
  generatedAt: '2026-08-28T00:30:00.000Z',
  household: {
    id: 'household_hearth_demo',
    name: 'Ramsay',
    timezone: 'Australia/Perth',
    locale: 'en-AU',
  },
  timezone: 'Australia/Perth',
  locale: 'en-AU',
  localDate: '2026-08-28',
  weekStart: '2026-08-24',
  currentMonth: '2026-08',
  requiresSetup: false,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('SystemHealthScreen appliance update', () => {
  it('clears the reconnect warning once the appliance confirms the requested update', async () => {
    const refetch = mockQueries(updateStatus);
    refetch.mockResolvedValue({
      isSuccess: true,
      data: {
        ...updateStatus,
        operation: { ...updateStatus.operation, phase: 'queued', targetVersion },
      },
    });
    vi.mocked(authenticateWithPasskey).mockResolvedValue({
      authenticated: true,
      householdId: 'household_hearth_demo',
      memberId: 'member_maya',
      displayName: 'Maya',
      expiresAt: '2026-09-28T00:30:00.000Z',
    });
    vi.spyOn(adminApi, 'installApplianceUpdate').mockRejectedValue(
      new TypeError('Failed to fetch'),
    );
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Install update' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Reconnecting…'));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument(), {
      timeout: 4_000,
    });
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('reports the database fault when recovery storage is healthy', () => {
    mockQueries(updateStatus);
    vi.mocked(useSystemStatusQuery).mockReturnValue({
      data: {
        ...systemStatus,
        database: {
          ...systemStatus.database,
          state: 'needs-attention',
          message: 'Household data needs attention.',
        },
      },
      isPending: false,
      isError: false,
    } as ReturnType<typeof useSystemStatusQuery>);
    renderScreen();
    expect(screen.getAllByText('Household data needs attention.')).toHaveLength(2);
  });

  it('recovers from a lost response and retries the same release with the same request ID', async () => {
    const refetch = mockQueries(updateStatus);
    refetch.mockResolvedValue({ isSuccess: true, data: updateStatus });
    vi.mocked(authenticateWithPasskey).mockResolvedValue({
      authenticated: true,
      householdId: 'household_hearth_demo',
      memberId: 'member_maya',
      displayName: 'Maya',
      expiresAt: '2026-09-28T00:30:00.000Z',
    });
    const install = vi
      .spyOn(adminApi, 'installApplianceUpdate')
      .mockRejectedValue(new TypeError('Failed to fetch'));
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Install update' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Reconnecting…'));
    expect(screen.getByRole('button', { name: 'Updating…' })).toBeDisabled();
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Install update' })).toBeEnabled(),
      { timeout: 4_000 },
    );
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not confirm the update. Try again.');
    fireEvent.click(screen.getByRole('button', { name: 'Install update' }));
    await waitFor(() => expect(install).toHaveBeenCalledTimes(2));
    expect(install.mock.calls[1]).toEqual(install.mock.calls[0]);
  });

  it('keeps a newer release installable after the previous update succeeded', () => {
    mockQueries({
      ...updateStatus,
      operation: {
        ...updateStatus.operation,
        phase: 'succeeded',
        progress: 100,
        targetVersion: installedVersion,
        message: 'Update installed and checked.',
      },
    });
    renderScreen();
    expect(screen.getByText('Available')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Install update' })).toBeEnabled();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('replaces the completed progress bar with a concise installed state', () => {
    mockQueries({
      ...updateStatus,
      installedVersion: targetVersion,
      canInstall: false,
      updateAvailable: false,
      operation: {
        ...updateStatus.operation,
        phase: 'succeeded',
        progress: 100,
        targetVersion,
        message: 'Update installed and checked.',
      },
    });
    renderScreen();
    expect(screen.getByText('Update installed and checked.')).toBeVisible();
    expect(screen.getByText('Installed bbbbbbbb')).toBeVisible();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install update' })).not.toBeInTheDocument();
  });

  it('allows retry after passkey cancellation without sending an update command', async () => {
    mockQueries(updateStatus);
    vi.mocked(authenticateWithPasskey).mockRejectedValue(
      new DOMException('The operation was not allowed.', 'NotAllowedError'),
    );
    const install = vi.spyOn(adminApi, 'installApplianceUpdate');
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Install update' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Passkey confirmation cancelled. Try again.',
      ),
    );
    expect(install).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Install update' })).toBeEnabled();
    expect(screen.queryByText(/Reconnecting/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Install update' }));
    await waitFor(() => expect(authenticateWithPasskey).toHaveBeenCalledTimes(2));
  });

  it('keeps a rejected update retryable instead of waiting for a restart', async () => {
    mockQueries(updateStatus);
    vi.mocked(authenticateWithPasskey).mockResolvedValue({
      authenticated: true,
      householdId: 'household_hearth_demo',
      memberId: 'member_maya',
      displayName: 'Maya',
      expiresAt: '2026-09-28T00:30:00.000Z',
    });
    vi.spyOn(adminApi, 'installApplianceUpdate').mockRejectedValue(
      new HearthApiError({
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: 'Confirm again.',
          retryable: true,
          requestId: null,
        },
      }),
    );
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Install update' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Confirm again with an adult passkey.'),
    );
    expect(screen.getByRole('button', { name: 'Install update' })).toBeEnabled();
    expect(screen.queryByText(/Reconnecting/)).not.toBeInTheDocument();
  });

  it('shows only the verified release and requires a passkey before requesting installation', async () => {
    mockQueries(updateStatus);
    vi.mocked(authenticateWithPasskey).mockResolvedValue({
      authenticated: true,
      householdId: 'household_hearth_demo',
      memberId: 'member_maya',
      displayName: 'Maya',
      expiresAt: '2026-09-28T00:30:00.000Z',
    });
    const install = vi.spyOn(adminApi, 'installApplianceUpdate').mockResolvedValue({
      status: {
        ...updateStatus,
        canInstall: false,
        operation: {
          ...updateStatus.operation,
          phase: 'queued',
          progress: 10,
          message: 'Update queued.',
          targetVersion,
        },
      },
      backup: systemStatus.backup,
      audit: {
        id: 'audit_update_test',
        actorType: 'member',
        actorId: 'member_maya',
        source: 'companion',
        action: 'system.update.install',
        targetId: 'release_update_test',
        occurredAt: '2026-08-28T00:30:00.000Z',
        result: 'succeeded',
      },
      replayed: false,
    });

    renderScreen();
    expect(screen.getByRole('heading', { name: 'Hearth update' })).toBeVisible();
    expect(screen.getByText('Verified household release')).toBeVisible();
    expect(screen.getByText('Installed aaaaaaaa · Ready bbbbbbbb')).toBeVisible();
    expect(screen.queryByText(installedVersion, { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('Backup and rollback are automatic.')).toBeVisible();
    expect(screen.queryByText('Power')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Recovery copies' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Install update' }));
    await waitFor(() => expect(authenticateWithPasskey).toHaveBeenCalledOnce());
    await waitFor(() => expect(install).toHaveBeenCalledOnce());
    expect(install.mock.calls[0]?.[1]).toBe(targetVersion);
  });

  it('shows the appliance setup blocker instead of a button that cannot work', () => {
    mockQueries({
      ...updateStatus,
      canInstall: false,
      checks: {
        ...updateStatus.checks,
        storage: {
          state: 'attention',
          message: 'Finish the one-time appliance update setup.',
        },
      },
      operation: {
        ...updateStatus.operation,
        message: 'Update service is not ready.',
      },
    });

    renderScreen();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Finish the one-time appliance update setup.',
    );
    expect(screen.queryByRole('button', { name: 'Install update' })).not.toBeInTheDocument();
    expect(screen.queryByText('Storage')).not.toBeInTheDocument();
  });

  it('does not render an update action when the platform capability is absent', () => {
    mockQueries({ ...updateStatus, supported: false, platform: 'development' });
    renderScreen();
    expect(screen.queryByRole('heading', { name: 'Hearth update' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install update' })).not.toBeInTheDocument();
  });
});

function mockQueries(applianceUpdate: ApplianceUpdateStatus) {
  const refetch = vi.fn();
  vi.mocked(useSystemStatusQuery).mockReturnValue({
    data: systemStatus,
    isPending: false,
    isError: false,
  } as ReturnType<typeof useSystemStatusQuery>);
  vi.mocked(useApplianceUpdateQuery).mockReturnValue({
    data: applianceUpdate,
    isPending: false,
    isError: false,
    refetch,
  } as unknown as ReturnType<typeof useApplianceUpdateQuery>);
  vi.mocked(useCalendarConnectionQuery).mockReturnValue({
    data: null,
    isPending: false,
    isError: false,
  } as ReturnType<typeof useCalendarConnectionQuery>);
  vi.mocked(useHomeAssistantConnectionQuery).mockReturnValue({
    data: null,
    isPending: false,
    isError: false,
  } as ReturnType<typeof useHomeAssistantConnectionQuery>);
  vi.mocked(usePhotoSourceQuery).mockReturnValue({
    data: {
      collection: { name: 'Family photos', source: { status: 'ready' } },
      visiblePhotoCount: 5,
    },
    isPending: false,
    isError: false,
  } as ReturnType<typeof usePhotoSourceQuery>);
  return refetch;
}

function renderScreen() {
  configureHearthClient(runtime);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={['/admin/system']}>
      <QueryClientProvider client={queryClient}>
        <RuntimeContextValue.Provider value={runtime}>
          <SystemHealthScreen />
        </RuntimeContextValue.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
