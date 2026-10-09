import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminOverview, AdultAccessSummary, PairedDevice } from '@hearth/shared';

import { adminApi } from '../api/admin';
import { configureHearthClient } from '../api/core';
import { adultAccessApi } from '../api/adultAccess';
import { runtimeApi } from '../api/runtime';
import { AdminAuthBoundary } from '../auth/AdminAuthBoundary';
import { createAdditionalPasskey, passkeysAvailable } from '../auth/passkeys';
import { clearIdentityAndReload } from '../auth/signOut';
import { useAdminQuery } from '../hooks/useAdminQueries';
import { AdultAccessScreen } from './AdultAccessScreen';
import { TelevisionsSettingsScreen } from './TelevisionsSettingsScreen';

vi.mock('../hooks/useAdminQueries', () => ({ useAdminQuery: vi.fn() }));
vi.mock('../runtime/context', () => ({ useHearthRuntime: () => ({ mode: 'private' }) }));
vi.mock('../api/admin', () => ({ adminApi: { approvePairing: vi.fn(), revokeDevice: vi.fn() } }));
vi.mock('../api/adultAccess', () => ({
  adultAccessApi: { getAdultAccess: vi.fn(), revokePasskey: vi.fn() },
}));
vi.mock('../auth/passkeys', () => ({
  passkeysAvailable: vi.fn(),
  authenticateWithPasskey: vi.fn(),
  createAdditionalPasskey: vi.fn(),
  createConfirmedRecoveryCode: vi.fn(),
}));
vi.mock('../auth/signOut', () => ({ clearIdentityAndReload: vi.fn() }));
vi.mock('../api/runtime', () => ({ runtimeApi: { getAuthStatus: vi.fn() } }));

const overview: AdminOverview = {
  household: {
    id: 'household_test',
    name: 'Test family',
    timezone: 'Australia/Perth',
    locale: 'en-AU',
    mode: 'private',
    members: [
      {
        id: 'member_maya',
        displayName: 'Maya',
        color: '#214f43',
        avatarUrl: '/brand/hearth-mark.png',
        role: 'adult',
        capabilities: ['household.admin', 'household.view'],
      },
      {
        id: 'member_daniel',
        displayName: 'Daniel',
        color: '#214f43',
        avatarUrl: '/brand/hearth-mark.png',
        role: 'adult',
        capabilities: ['household.view'],
      },
      {
        id: 'member_child',
        displayName: 'Child',
        color: '#214f43',
        avatarUrl: '/brand/hearth-mark.png',
        role: 'child',
        capabilities: ['household.view'],
      },
    ],
  },
  actor: {
    id: 'member_maya',
    displayName: 'Maya',
    role: 'adult',
    capabilities: ['household.admin', 'household.view'],
  },
  pairedDevices: [],
  pendingPairings: [],
  integrations: [],
  recentAudit: [],
  localOnly: true,
};
const access: AdultAccessSummary = {
  householdId: overview.household.id,
  actorMemberId: overview.actor.id,
  adults: overview.household.members
    .filter((member) => member.role === 'adult')
    .map((member) => ({
      member,
      passkeys: [],
      recovery: { configured: false, createdAt: null, expiresAt: null },
    })),
};
const clients: QueryClient[] = [];

beforeEach(() => {
  configureHearthClient({
    mode: 'private',
    generatedAt: '2026-10-09T02:00:00.000Z',
    household: overview.household,
    timezone: 'Australia/Perth',
    locale: 'en-AU',
    localDate: '2026-10-09',
    weekStart: '2026-10-05',
    currentMonth: '2026-10',
    requiresSetup: false,
  });
  mockAdmin(overview);
  vi.mocked(passkeysAvailable).mockReturnValue(true);
  vi.mocked(adultAccessApi.getAdultAccess).mockResolvedValue(access);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.resetAllMocks();
});

describe('adult phones and shared screens', () => {
  it('shows the current adult and permissions without claiming phones are paired or ready', () => {
    renderPage(<TelevisionsSettingsScreen />);
    expect(screen.getByText(/Signed in as/)).toHaveTextContent('Maya');
    const adults = screen.getByRole('list', { name: 'Adult control permissions' });
    expect(within(adults).getByText('Maya').closest('li')).toHaveTextContent(
      'Household controller',
    );
    expect(within(adults).getByText('Daniel').closest('li')).toHaveTextContent(
      'Family access · no household settings',
    );
    expect(within(adults).queryByText('Child')).not.toBeInTheDocument();
    expect(screen.getByText(/No TV code needed/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Set up Daniel’s phone' })).toHaveAttribute(
      'href',
      '/admin/access?adult=member_daniel',
    );
    expect(adminApi.approvePairing).not.toHaveBeenCalled();
  });

  it('keeps revoked connections in collapsed history, not in the connected list', () => {
    mockAdmin({
      ...overview,
      pairedDevices: [device('device_current'), device('device_old', 'revoked')],
    });
    renderPage(<TelevisionsSettingsScreen />);
    expect(screen.getByText('device_current')).toBeVisible();
    expect(screen.getByText('device_old')).not.toBeVisible();
    fireEvent.click(screen.getByText('Disconnected screen history (1)'));
    expect(screen.getByText('device_old')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Disconnect' })).toHaveLength(1);
    expect(adminApi.revokeDevice).not.toHaveBeenCalled();
  });

  it('does not disconnect a retained connection just because its last contact is old', () => {
    mockAdmin({ ...overview, pairedDevices: [device('device_current')] });
    renderPage(<TelevisionsSettingsScreen />);
    expect(screen.getByText(/Last contact/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(adminApi.revokeDevice).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep connected' }));
    expect(adminApi.revokeDevice).not.toHaveBeenCalled();
  });

  it('disconnects only the confirmed screen and restores focus to the retained list heading', async () => {
    mockAdmin({ ...overview, pairedDevices: [device('device_current')] });
    vi.mocked(adminApi.revokeDevice).mockResolvedValue(device('device_current', 'revoked'));
    renderPage(<TelevisionsSettingsScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() =>
      expect(adminApi.revokeDevice).toHaveBeenCalledWith('device_current', expect.any(String)),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('device_current disconnected');
    expect(screen.getByRole('heading', { name: 'Connected screens' })).toHaveFocus();
  });

  it('makes empty and revoked-only lists honest without suggesting another phone pairing', () => {
    mockAdmin({ ...overview, pairedDevices: [device('device_old', 'revoked')] });
    renderPage(<TelevisionsSettingsScreen />);
    expect(screen.getByText('No screens connected. Add a TV below.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
  });
});

describe('new adult sign-in guidance', () => {
  it('does not confuse a shared-screen connection with adult controller access', async () => {
    vi.mocked(runtimeApi.getAuthStatus).mockResolvedValue({
      mode: 'private',
      configured: true,
      secureOrigin: true,
      requiresSetup: false,
      authenticated: false,
      actor: null,
    });
    renderPage(
      <AdminAuthBoundary>
        <p>Protected controls</p>
      </AdminAuthBoundary>,
    );
    expect(await screen.findByText(/A shared-screen connection does not give/)).toBeVisible();
    expect(screen.queryByText('Protected controls')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeEnabled();
  });

  it('retains the existing authenticated-adult boundary without a display-code bypass', async () => {
    vi.mocked(runtimeApi.getAuthStatus).mockResolvedValue({
      mode: 'private',
      configured: true,
      secureOrigin: true,
      requiresSetup: false,
      authenticated: true,
      actor: { id: 'member_maya', displayName: 'Maya', role: 'adult' },
    });
    renderPage(
      <AdminAuthBoundary>
        <p>Protected controls</p>
      </AdminAuthBoundary>,
    );
    expect(await screen.findByText('Protected controls')).toBeVisible();
    expect(adminApi.approvePairing).not.toHaveBeenCalled();
  });

  it('requires the adult’s own device and separates permissions, credentials and recovery', async () => {
    renderPage(<AdultAccessScreen />);
    expect(await screen.findByRole('heading', { name: 'Set up this phone' })).toBeVisible();
    expect(screen.getByText(/Signed in as/)).toHaveTextContent('Maya');
    expect(screen.getByText(/This phone will then sign in/)).toHaveTextContent('Maya’s phone');
    fireEvent.change(screen.getByLabelText('Adult'), { target: { value: 'member_daniel' } });
    expect(screen.getByText(/This phone will then sign in/)).toHaveTextContent('Daniel’s phone');
    expect(screen.queryByText('Recovery needed')).not.toBeInTheDocument();
    expect(screen.getByText(/Optional safety net/)).not.toBeVisible();
    expect(createAdditionalPasskey).not.toHaveBeenCalled();
  });

  it('requests an explicit verified sign-in for the selected adult and clears the helper identity', async () => {
    vi.mocked(createAdditionalPasskey).mockResolvedValue({
      credential: {
        id: 'passkey_new',
        memberId: 'member_daniel',
        label: 'Daniel phone',
        deviceType: 'multiDevice',
        backedUp: true,
        createdAt: '2026-10-09T02:00:00.000Z',
        lastUsedAt: null,
      },
      audit: {
        id: 'audit_new',
        actorId: 'member_maya',
        actorType: 'member',
        source: 'companion',
        action: 'auth.passkey.register',
        targetId: 'passkey_new',
        occurredAt: '2026-10-09T02:00:00.000Z',
        result: 'succeeded',
      },
    });
    renderPage(<AdultAccessScreen />);
    await screen.findByRole('heading', { name: 'Adult access' });
    fireEvent.change(screen.getByLabelText('Adult'), { target: { value: 'member_daniel' } });
    fireEvent.change(screen.getByLabelText('Passkey name'), { target: { value: 'Daniel phone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set up this phone' }));
    await waitFor(() =>
      expect(createAdditionalPasskey).toHaveBeenCalledWith(
        { memberId: 'member_daniel', passkeyLabel: 'Daniel phone', signInOnThisDevice: true },
        expect.anything(),
      ),
    );
    await waitFor(() =>
      expect(clearIdentityAndReload).toHaveBeenCalledWith(expect.any(QueryClient), '/'),
    );
  });

  it('preserves the final-passkey recovery guard', async () => {
    vi.mocked(adultAccessApi.getAdultAccess).mockResolvedValue({
      ...access,
      adults: [
        {
          ...access.adults[0]!,
          passkeys: [
            {
              id: 'passkey_final',
              memberId: 'member_maya',
              label: 'Existing key',
              deviceType: 'multiDevice',
              backedUp: true,
              createdAt: '2026-10-09T02:00:00.000Z',
              lastUsedAt: null,
            },
          ],
        },
      ],
    });
    renderPage(<AdultAccessScreen />);
    await screen.findByText(
      'Only sign-in key. Add another key or create recovery before removing it.',
    );
    fireEvent.click(screen.getByText('Advanced sign-in & recovery'));
    expect(screen.getByText(/Only sign-in key/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(adultAccessApi.revokePasskey).not.toHaveBeenCalled();
  });
});

function device(id: string, status: PairedDevice['status'] = 'connected'): PairedDevice {
  return {
    id,
    name: id,
    type: 'television',
    status,
    scopes: ['household.read'],
    pairedAt: '2026-08-01T02:00:00.000Z',
    lastSeenAt: '2026-08-01T02:00:00.000Z',
    revokedAt: status === 'revoked' ? '2026-08-02T02:00:00.000Z' : null,
  };
}
function mockAdmin(data: AdminOverview) {
  vi.mocked(useAdminQuery).mockReturnValue({ data, isPending: false, isError: false } as ReturnType<
    typeof useAdminQuery
  >);
}
function renderPage(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{element}</QueryClientProvider>
    </MemoryRouter>,
  );
}
