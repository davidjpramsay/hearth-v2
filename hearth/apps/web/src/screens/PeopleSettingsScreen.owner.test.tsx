import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PeopleSettingsScreen } from './PeopleSettingsScreen';
import { phoneApi } from '../api/phoneConnections';
import { adminApi } from '../api/admin';
import { authStatusQueryKey } from '../auth/queryKeys';

const owner = {
  id: 'member_david',
  displayName: 'David',
  role: 'adult',
  color: '#2f766d',
  avatarUrl: '/brand/hearth-mark.png',
  capabilities: ['household.admin', 'household.view'],
};
vi.mock('../hooks/useAdminQueries', () => ({
  useAdminQuery: () => ({
    isPending: false,
    data: {
      actor: { id: 'member_rachael' },
      household: {
        members: [
          {
            id: 'member_david',
            displayName: 'David',
            role: 'adult',
            color: '#2f766d',
            avatarUrl: '/brand/hearth-mark.png',
            capabilities: ['household.admin', 'household.view'],
          },
        ],
      },
    },
  }),
}));
vi.mock('../api/phoneConnections', () => ({ phoneApi: { list: vi.fn() } }));
vi.mock('../api/admin', () => ({ adminApi: { updateMember: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe('owner administrator in People', () => {
  it('protects David while Rachael edits People, without blocking safe profile edits', async () => {
    const stamp = '2026-10-12T00:00:00Z';
    vi.mocked(phoneApi.list).mockResolvedValue({
      connections: [
        {
          id: 'phone_david',
          memberId: owner.id,
          adultName: owner.displayName,
          phoneName: 'David’s iPhone',
          source: 'owner',
          createdAt: stamp,
          lastSeenAt: stamp,
          expiresAt: '2027-01-01T00:00:00Z',
          current: false,
        },
      ],
      adults: [],
    });
    vi.mocked(adminApi.updateMember).mockResolvedValue({
      ...owner,
      role: 'adult',
      capabilities: ['household.admin', 'household.view'],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(authStatusQueryKey, { accessMethod: 'phone' });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <PeopleSettingsScreen />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    const notice = await screen.findByText(
      'Owner phone administrator · protected by the server key',
    );
    const form = within(notice.closest('form')!);
    expect(form.getByRole('combobox', { name: 'Role' })).toBeDisabled();
    expect(form.getByRole('checkbox', { name: 'Household administrator' })).toBeDisabled();
    expect(form.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(form.getByRole('textbox', { name: 'Display name' })).toBeEnabled();
    fireEvent.click(form.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(adminApi.updateMember).toHaveBeenCalledWith(
        owner.id,
        expect.objectContaining({ role: 'adult', administrator: true }),
      ),
    );
  });
});
