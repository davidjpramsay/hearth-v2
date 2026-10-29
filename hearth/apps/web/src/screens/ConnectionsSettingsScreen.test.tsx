import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHearthClient, configureHearthClient } from '../api/core';
import { homeAssistantBridgeApi } from '../api/homeAssistantBridge';
import { ConnectionsSettingsScreen } from './ConnectionsSettingsScreen';
import { indoorApi } from '../api/indoorClimate';
import { weatherApi } from '../api/weather';
import { photosApi } from '../api/photos';

vi.mock('../api/indoorClimate', () => ({ indoorApi: { settings: vi.fn() } }));
vi.mock('../api/weather', () => ({ weatherApi: { getLocation: vi.fn() } }));
vi.mock('../api/photos', () => ({ photosApi: { getPhotoSource: vi.fn() } }));

vi.mock('../hooks/useAdminQueries', () => ({
  useAdminQuery: () => ({ isPending: false, data: {} }),
}));
vi.mock('../hooks/useConnectionQueries', () => ({
  useCalendarConnectionQuery: () => ({ isPending: false, data: null }),
  useHomeAssistantConnectionQuery: () => ({ isPending: false, data: null }),
}));
vi.mock('../api/homeAssistantBridge', () => ({
  homeAssistantBridgeApi: { getConnection: vi.fn() },
}));
beforeEach(() => {
  vi.mocked(indoorApi.settings).mockResolvedValue({ configured: false, revision: 0, rooms: [] });
  vi.mocked(weatherApi.getLocation).mockResolvedValue(null);
  vi.mocked(photosApi.getPhotoSource).mockRejectedValue(new Error('Fixture photos offline'));
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
});
afterEach(() => {
  cleanup();
  clearHearthClient();
  vi.resetAllMocks();
});
function show() {
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ConnectionsSettingsScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
describe('Home Assistant connection direction summary', () => {
  it('shows approved inbound access rather than misleading Set up for an enabled bridge', async () => {
    vi.mocked(homeAssistantBridgeApi.getConnection).mockResolvedValue({
      id: 'bridge_fixture',
      moduleIds: [],
      createdAt: '2026-10-15T00:00:00Z',
      revokedAt: null,
      screenIds: ['screen_fixture'],
      shareChores: true,
      shareCalendar: true,
      controlChores: false,
      controlModules: false,
    });
    show();
    expect(
      await screen.findByRole(
        'link',
        { name: /Home Assistant.*Access enabled/ },
        { timeout: 5000 },
      ),
    ).toBeVisible();
    expect(screen.getByText('Approved Home Assistant access to Hearth.')).toBeVisible();
  });
  it('keeps a missing grant separate from an unconfirmed access read', async () => {
    vi.mocked(homeAssistantBridgeApi.getConnection).mockResolvedValue(null);
    show();
    expect(
      await screen.findByRole('link', { name: /Home Assistant.*Set up/ }, { timeout: 5000 }),
    ).toBeVisible();
  });
  it('leaves the existing connections menu usable if only the new summary read fails', async () => {
    vi.mocked(homeAssistantBridgeApi.getConnection).mockRejectedValue(
      new Error('Fixture unavailable'),
    );
    show();
    expect(
      await screen.findByRole('link', { name: /Home Assistant.*Check access/ }, { timeout: 5000 }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: /Calendar.*Set up/ })).toBeVisible();
    expect(await screen.findByRole('link', { name: /Family photos.*Check photos/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /Phones & screens/ })).toBeVisible();
  });
});
