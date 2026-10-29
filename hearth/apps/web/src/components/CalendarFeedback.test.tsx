import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarIssue, CalendarRefreshIndicator } from './CalendarFeedback';

afterEach(cleanup);

describe('quiet calendar feedback', () => {
  it('shows a labelled, non-live spinner only while active', () => {
    const { rerender } = render(<CalendarRefreshIndicator active={false} />);
    expect(screen.queryByRole('img')).toBeNull();
    rerender(<CalendarRefreshIndicator active />);
    expect(screen.getByRole('img', { name: 'Refreshing calendar' })).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<CalendarRefreshIndicator active={false} />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('stays quiet for normal refreshes but retains provider and cached-read failures', () => {
    const { rerender } = render(
      <CalendarIssue online failed={false} freshness="stale" message={null} />,
    );
    expect(screen.queryByRole('status')).toBeNull();
    rerender(
      <CalendarIssue
        online
        failed={false}
        freshness="stale"
        message="Calendar needs attention · Showing saved plans."
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Calendar needs attention');
    rerender(<CalendarIssue online failed freshness="current" message={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('Couldn’t update the calendar');
    rerender(<CalendarIssue online={false} failed freshness="stale" message="Saved plans" />);
    expect(screen.queryByRole('status')).toBeNull(); // The screen retains its separate offline banner.
  });
});
