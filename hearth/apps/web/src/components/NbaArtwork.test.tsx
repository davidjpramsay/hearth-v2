import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearHearthClient, configureHearthClient } from '../api/core';
import { NbaPlayerPortrait, NbaTeamMark } from './NbaArtwork';
beforeEach(() =>
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
  }),
);
afterEach(() => {
  cleanup();
  clearHearthClient();
});
describe('NBA artwork degrades without shifting or replacing labels', () => {
  it('uses same-origin decorative team images and recovers to an abbreviation', () => {
    const { container } = render(<NbaTeamMark teamId="2" />);
    const image = container.querySelector('img')!;
    expect(image.getAttribute('src')).toBe(
      '/api/v1/households/household_fixture/nba/media/teams/2',
    );
    expect(image).toHaveAttribute('alt', '');
    fireEvent.error(image);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('BOS')).toBeInTheDocument();
  });
  it('never invents a photo for a fictional/missing player and recovers per source', () => {
    const { container, rerender } = render(
      <NbaPlayerPortrait playerId={null} name="Jordan Example" />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('JE')).toBeInTheDocument();
    rerender(<NbaPlayerPortrait playerId="1966" name="Real Player" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    rerender(<NbaPlayerPortrait playerId="3975" name="Another Player" />);
    expect(container.querySelector('img')?.getAttribute('src')).toContain('/players/3975');
  });
});
