import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { useRemoteNavigation } from './useRemoteNavigation';

function NavigationFixture({ ready = true }: { ready?: boolean }) {
  useRemoteNavigation('screen-entry');
  const { pathname } = useLocation();
  return (
    <>
      <nav data-focus-navigation="rail" key={pathname.startsWith('/admin') ? 'admin' : 'family'}>
        {[
          ['/today', 'Today'],
          ['/admin/two', 'Two'],
        ].map(([path, label]) => (
          <Link
            key={path}
            to={path!}
            data-focus-id={`nav-${label}`}
            aria-current={pathname === path ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <main id="main-content">
        <Routes>
          <Route
            path="/today"
            element={
              <Link to="/detail" data-focus-id="open-detail" data-focus-entry="true">
                Open detail
              </Link>
            }
          />
          <Route
            path="/admin/two"
            element={
              ready ? (
                <button data-focus-id="two-entry" data-focus-entry="true">
                  Two action
                </button>
              ) : (
                <section data-focus-loading="true">Loading Two</section>
              )
            }
          />
          <Route
            path="/detail"
            element={
              <button data-focus-id="detail-entry" data-focus-entry="true">
                Detail action
              </button>
            }
          />
        </Routes>
      </main>
    </>
  );
}

function fixture(ready = true) {
  return (
    <MemoryRouter initialEntries={['/today']}>
      <NavigationFixture ready={ready} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return DOMRect.fromRect({ x: this.closest('nav') ? 0 : 200, y: 100, width: 100, height: 40 });
  });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
    this: HTMLElement,
  ) {
    return [this.getBoundingClientRect()] as unknown as DOMRectList;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('remote menu entry', () => {
  it('keeps menu focus across a shell replacement until explicit Right enters the page', async () => {
    const user = userEvent.setup();
    render(fixture());
    await waitFor(() => expect(screen.getByRole('link', { name: 'Open detail' })).toHaveFocus());
    await user.click(screen.getByRole('link', { name: 'Two' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Two action' })).toBeVisible());
    expect(screen.getByRole('link', { name: 'Two' })).toHaveFocus();
    expect(document.querySelector('#main-content :focus')).toBeNull();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Two action' })).toHaveFocus();
  });

  it('does not steal menu focus when delayed content and later updates arrive', async () => {
    const user = userEvent.setup();
    const view = render(fixture(false));
    await user.click(screen.getByRole('link', { name: 'Two' }));
    expect(screen.getByText('Loading Two')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Two' })).toHaveFocus();
    view.rerender(fixture(true));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Two action' })).toBeVisible());
    expect(screen.getByRole('link', { name: 'Two' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Two action' })).toHaveFocus();
    view.rerender(fixture(true));
    expect(screen.getByRole('button', { name: 'Two action' })).toHaveFocus();
  });

  it('honours explicit Right when the chosen page finishes loading', async () => {
    const user = userEvent.setup();
    const view = render(fixture(false));
    await user.click(screen.getByRole('link', { name: 'Two' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('link', { name: 'Two' })).toHaveFocus();
    view.rerender(fixture(true));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Two action' })).toHaveFocus());
  });

  it('cancels delayed page entry when the user chooses the menu again', async () => {
    const user = userEvent.setup();
    const view = render(fixture(false));
    const menu = screen.getByRole('link', { name: 'Two' });
    await user.click(menu);
    await user.keyboard('{ArrowRight}');
    await user.click(screen.getByRole('link', { name: 'Two' }));
    view.rerender(fixture(true));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Two action' })).toBeVisible());
    expect(screen.getByRole('link', { name: 'Two' })).toHaveFocus();
  });

  it('clears the page highlight when the current menu item is chosen again', async () => {
    const user = userEvent.setup();
    render(fixture());
    const action = screen.getByRole('link', { name: 'Open detail' });
    await waitFor(() => expect(action).toHaveFocus());
    await user.click(screen.getByRole('link', { name: 'Today' }));
    expect(screen.getByRole('link', { name: 'Today' })).toHaveFocus();
    expect(action).not.toHaveFocus();
  });

  it('does not use rail entry to escape a modal rendered within navigation', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/today']}>
        <NavigationFixture />
        <aside data-focus-navigation="rail">
          <div role="dialog" aria-modal="true" aria-label="Navigation dialog">
            <button>Close navigation dialog</button>
          </div>
        </aside>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('link', { name: 'Open detail' })).toHaveFocus());
    const close = screen.getByRole('button', { name: 'Close navigation dialog' });
    await user.click(close);
    await user.keyboard('{ArrowRight}');
    expect(close).toHaveFocus();
  });

  it('preserves direct entry, detail entry and exact opener restoration on Back', async () => {
    const user = userEvent.setup();
    render(fixture());
    await waitFor(() => expect(screen.getByRole('link', { name: 'Open detail' })).toHaveFocus());
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Detail action' })).toHaveFocus(),
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('link', { name: 'Open detail' })).toHaveFocus());
  });
});
