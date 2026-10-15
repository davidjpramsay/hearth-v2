import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MODULE_FLAGS, type ModuleCommandResult, type ModuleFlags } from '@hearth/shared';
import { clearHearthClient, configureHearthClient } from '../api/core';
import { modulesApi } from '../api/modules';
import { ModulesProvider } from '../modules/ModulesProvider';
import { ModulesSettingsScreen } from './ModulesSettingsScreen';
import { useModulePathAvailable } from '../modules/context';

vi.mock('../api/modules', () => ({ modulesApi: { get: vi.fn(), update: vi.fn() } }));
let flags: ModuleFlags;
beforeEach(() => {
  flags = { ...DEFAULT_MODULE_FLAGS };
  configureHearthClient({
    mode: 'demo',
    generatedAt: '2026-10-15T00:00:00Z',
    household: {
      id: 'household_fixture',
      name: 'Fixture',
      timezone: 'Australia/Perth',
      locale: 'en-AU',
    },
    timezone: 'Australia/Perth',
    locale: 'en-AU',
    localDate: '2026-10-15',
    weekStart: '2026-10-12',
    currentMonth: '2026-10',
    requiresSetup: false,
  });
  vi.mocked(modulesApi.get).mockImplementation(async () => ({
    householdId: 'household_fixture',
    enabled: { ...flags },
  }));
});
afterEach(() => {
  cleanup();
  clearHearthClient();
  vi.resetAllMocks();
});
function RouteProbe() {
  const available = useModulePathAvailable();
  return (
    <output>
      {available('/photos') ? 'Photos available' : 'Photos hidden'} /{' '}
      {available('/admin/modules') ? 'Core available' : 'Core hidden'}
    </output>
  );
}
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ModulesProvider>
          <ModulesSettingsScreen />
          <RouteProbe />
        </ModulesProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return client;
}
function receipt(enabled: ModuleFlags): ModuleCommandResult {
  return {
    configuration: { householdId: 'household_fixture', enabled },
    replayed: false,
    audit: {
      id: 'audit_fixture',
      actorType: 'member',
      actorId: 'member_fixture',
      source: 'companion',
      action: 'module.update',
      targetId: 'module_photos',
      occurredAt: '2026-10-15T00:00:00Z',
      result: 'succeeded',
    },
  };
}
describe('simple Modules settings', () => {
  it('has eleven switches, preserves core controls and sends nothing until asked', async () => {
    show();
    expect(await screen.findAllByRole('switch')).toHaveLength(11);
    expect(screen.getByText(/Your data stays saved/)).toBeVisible();
    expect(screen.getByText('Photos available / Core available')).toBeVisible();
    expect(modulesApi.update).not.toHaveBeenCalled();
  });
  it('uses confirmed state instead of optimism and refetches after a receipt', async () => {
    let accept!: (value: ModuleCommandResult) => void;
    vi.mocked(modulesApi.update).mockImplementation(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
    );
    show();
    const photos = await screen.findByRole('switch', { name: 'Photos' });
    fireEvent.click(photos);
    expect(photos).toHaveAttribute('aria-checked', 'true');
    expect(photos).toHaveAttribute('aria-disabled', 'true');
    expect(modulesApi.update).toHaveBeenCalledWith('photos', {
      requestId: expect.stringMatching(/^request_module_/),
      enabled: false,
    });
    flags = { ...flags, photos: false };
    await act(async () => {
      accept(receipt(flags));
    });
    await waitFor(() => expect(photos).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByText('Photos hidden / Core available')).toBeVisible();
  });
  it('retains an uncertain exact command for retry without changing the displayed flags', async () => {
    vi.mocked(modulesApi.update)
      .mockRejectedValueOnce(new Error('Connection interrupted'))
      .mockImplementationOnce(async () => {
        flags.photos = false;
        return receipt(flags);
      });
    show();
    const photos = await screen.findByRole('switch', { name: 'Photos' });
    fireEvent.click(photos);
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
    expect(photos).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Calendar' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(photos).toHaveAttribute('aria-checked', 'false'));
    expect(vi.mocked(modulesApi.update).mock.calls[1]).toEqual(
      vi.mocked(modulesApi.update).mock.calls[0],
    );
  });
  it('does not revert newer flags to an old exact-replay receipt', async () => {
    vi.mocked(modulesApi.update).mockResolvedValue({
      ...receipt({ ...flags, photos: false }),
      replayed: true,
    });
    show();
    const photos = await screen.findByRole('switch', { name: 'Photos' });
    fireEvent.click(photos);
    await waitFor(() => expect(photos).not.toHaveAttribute('aria-disabled', 'true'));
    expect(photos).toHaveAttribute('aria-checked', 'true');
  });
  it('fails closed on initial settings failure and can recover without mounting features', async () => {
    vi.mocked(modulesApi.get).mockRejectedValueOnce(new Error('Offline'));
    show();
    expect(
      await screen.findByRole('heading', { name: 'Could not load Hearth modules' }),
    ).toBeVisible();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByRole('switch')).toHaveLength(11);
  });
});
