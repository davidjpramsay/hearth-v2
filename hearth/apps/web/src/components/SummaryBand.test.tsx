import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SummaryBand } from './SummaryBand';

afterEach(cleanup);

describe('SummaryBand', () => {
  it.each(['information', 'link', 'button'] as const)(
    'preserves a layout class on the %s variant',
    (variant) => {
      const { container } = render(
        <MemoryRouter>
          <SummaryBand
            className="today-daily-verse"
            icon="book-open"
            label="Daily verse"
            {...(variant === 'button' ? { onActivate: vi.fn() } : {})}
            {...(variant === 'link' ? { to: '/meals' } : {})}
          >
            A short excerpt
          </SummaryBand>
        </MemoryRouter>,
      );
      expect(container.querySelector('.today-daily-verse')).toHaveClass('summary-band');
    },
  );

  it('links an actionable summary to its real module', () => {
    render(
      <MemoryRouter>
        <SummaryBand ariaLabel="Open meals" icon="meal" label="Dinner" to="/meals">
          Lemon chicken
        </SummaryBand>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Open meals' })).toHaveAttribute('href', '/meals');
  });

  it('activates a local detail action without inventing a link', () => {
    const onActivate = vi.fn();
    render(
      <SummaryBand ariaLabel="Read the notice" icon="home" label="Notice" onActivate={onActivate}>
        Bins go out tonight
      </SummaryBand>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Read the notice' }));
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it('keeps unavailable content informational rather than pretending it is actionable', () => {
    render(
      <SummaryBand icon="home" label="Notice">
        No notices
      </SummaryBand>,
    );

    expect(screen.getByText('No notices').closest('section')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
