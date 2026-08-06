import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EmptyState, FailureState, InlineError, LoadingState, StatusBanner } from './Status';

describe('intentional application states', () => {
  it('renders a family-readable loading state', () => {
    render(<LoadingState />);
    expect(screen.getByRole('heading', { name: 'Gathering today’s plans…' })).toBeVisible();
  });

  it('renders the empty bootstrap action', () => {
    const bootstrap = vi.fn();
    render(<EmptyState onBootstrap={bootstrap} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show demo household' }));
    expect(bootstrap).toHaveBeenCalledOnce();
  });

  it('renders stale and offline status without provider jargon', () => {
    const { rerender } = render(
      <StatusBanner kind="stale">
        Calendar last updated at 6:45 · Trying again quietly.
      </StatusBanner>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Calendar last updated at 6:45');
    rerender(<StatusBanner kind="offline">You’re offline · Showing saved plans.</StatusBanner>);
    expect(screen.getByRole('status')).toHaveTextContent('Showing saved plans');
    rerender(
      <StatusBanner kind="unavailable">
        Calendar is unavailable · Showing saved plans.
      </StatusBanner>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Calendar is unavailable');
  });

  it('offers retry for full-screen and inline failures', () => {
    const retry = vi.fn();
    const { rerender } = render(<FailureState onRetry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    rerender(<InlineError message="Couldn’t mark this done." onRetry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(2);
  });
});
