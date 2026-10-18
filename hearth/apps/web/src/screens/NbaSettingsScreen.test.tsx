import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHearthClient, configureHearthClient } from '../api/core';
import { nbaApi } from '../api/nba';
import { NbaSettingsScreen } from './NbaSettingsScreen';

vi.mock('../api/nba', () => ({ nbaApi: { settings: vi.fn(), save: vi.fn() } }));
const clients: QueryClient[] = [];
beforeEach(() => {
  configureHearthClient({
    mode: 'demo',
    generatedAt: '2026-10-18T00:00:00Z',
    household: {
      id: 'household_fixture',
      name: 'Fixture',
      timezone: 'Australia/Perth',
      locale: 'en-AU',
    },
    timezone: 'Australia/Perth',
    locale: 'en-AU',
    localDate: '2026-10-18',
    weekStart: '2026-10-12',
    currentMonth: '2026-10',
    requiresSetup: false,
  });
  vi.mocked(nbaApi.settings).mockResolvedValue({ standoutTeamIds: [] });
  vi.mocked(nbaApi.save).mockResolvedValue({} as Awaited<ReturnType<typeof nbaApi.save>>);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  clearHearthClient();
  vi.resetAllMocks();
});
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <NbaSettingsScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
describe('NBA standout settings', () => {
  it('does not select teams automatically, caps five but permits unticking every team', async () => {
    show();
    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes).toHaveLength(30);
    expect(nbaApi.save).not.toHaveBeenCalled();
    boxes.slice(0, 5).forEach((box) => fireEvent.click(box));
    expect(boxes[5]).toBeDisabled();
    expect(boxes[0]).toBeEnabled();
    boxes.slice(0, 5).forEach((box) => fireEvent.click(box));
    fireEvent.click(screen.getByRole('button', { name: 'Save teams' }));
    await screen.findByText('Standout teams saved.');
    expect(nbaApi.save).toHaveBeenCalledWith({
      requestId: expect.any(String),
      standoutTeamIds: [],
    });
  });
  it('preserves exact command after an uncertain failure, freezes edits, then unlocks after success', async () => {
    vi.mocked(nbaApi.save).mockRejectedValueOnce(new Error('Connection interrupted'));
    show();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Boston Celtics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save teams' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('checkbox', { name: 'Boston Celtics' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Standout teams saved.');
    expect(vi.mocked(nbaApi.save).mock.calls[1]?.[0]).toEqual(
      vi.mocked(nbaApi.save).mock.calls[0]?.[0],
    );
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Boston Celtics' })).toBeEnabled(),
    );
  });
  it('shows a useful load failure without rendering an editable empty setting', async () => {
    vi.mocked(nbaApi.settings).mockRejectedValue(new Error('Settings unavailable'));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Settings unavailable');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});
