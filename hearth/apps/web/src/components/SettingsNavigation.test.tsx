import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { AdminPage, AdminQueryState } from './AdminPage';
import { SettingsLink } from './SettingsNavigation';

afterEach(cleanup);

function settingsRouter(initialEntries: Parameters<typeof createMemoryRouter>[1] = {}) {
  const router = createMemoryRouter(
    [
      {
        path: '/more',
        element: (
          <>
            <h1>More</h1>
            <SettingsLink to="/admin/household">Household details</SettingsLink>
            <SettingsLink to="/admin/connections">Connections</SettingsLink>
            <SettingsLink to="/admin/activity">Recent activity</SettingsLink>
            <SettingsLink to="/photos">Photos</SettingsLink>
          </>
        ),
      },
      {
        path: '/admin',
        element: (
          <>
            <h1>Hearth settings</h1>
            <SettingsLink to="/admin/photos">Manage photos</SettingsLink>
          </>
        ),
      },
      {
        path: '/admin/household',
        element: <AdminPage title="Household">Household form</AdminPage>,
      },
      {
        path: '/admin/connections',
        element: (
          <AdminPage title="Connections">
            <SettingsLink to="/admin/connections/calendar">Calendar</SettingsLink>
          </AdminPage>
        ),
      },
      {
        path: '/admin/connections/calendar',
        element: (
          <AdminPage title="Calendar" backTo="/admin/connections" backLabel="Back to Connections">
            Calendar form
          </AdminPage>
        ),
      },
      {
        path: '/admin/activity',
        element: (
          <AdminPage
            title="Recent activity"
            backTo="/admin/system"
            backLabel="Back to System health"
          >
            Activity
          </AdminPage>
        ),
      },
      {
        path: '/admin/photos',
        element: (
          <AdminPage title="Manage photos" backTo="/more" backLabel="Back to More">
            Photo settings
          </AdminPage>
        ),
      },
      { path: '/photos', element: <h1>Family photos</h1> },
    ],
    { initialEntries: ['/more'], ...initialEntries },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('settings return navigation', () => {
  it('returns to the exact More entry, without adding a Back/history loop', async () => {
    const user = userEvent.setup();
    const router = settingsRouter();
    const moreKey = router.state.location.key;
    await user.click(screen.getByRole('link', { name: 'Household details' }));
    const householdKey = router.state.location.key;
    const back = screen.getByRole('link', { name: 'Back to More' });
    expect(back).toHaveAttribute('href', '/more');
    await user.click(back);
    expect(await screen.findByRole('heading', { name: 'More' })).toBeVisible();
    expect(router.state.location.key).toBe(moreKey);
    await router.navigate(1);
    expect(await screen.findByRole('heading', { name: 'Household' })).toBeVisible();
    expect(router.state.location.key).toBe(householdKey);
  });

  it('retains the opener through nested settings and ordinary history Back', async () => {
    const user = userEvent.setup();
    const router = settingsRouter();
    await user.click(screen.getByRole('link', { name: 'Connections' }));
    await user.click(screen.getByRole('link', { name: 'Calendar' }));
    await user.click(screen.getByRole('link', { name: 'Back to Connections' }));
    expect(await screen.findByRole('heading', { name: 'Connections' })).toBeVisible();
    await router.navigate(-1);
    expect(await screen.findByRole('heading', { name: 'More' })).toBeVisible();
    await router.navigate(1);
    await user.click(await screen.findByRole('link', { name: 'Back to More' }));
    expect(await screen.findByRole('heading', { name: 'More' })).toBeVisible();
  });

  it('uses More rather than System health when activity was opened directly from More', async () => {
    const user = userEvent.setup();
    settingsRouter();
    await user.click(screen.getByRole('link', { name: 'Recent activity' }));
    await user.click(screen.getByRole('link', { name: 'Back to More' }));
    expect(await screen.findByRole('heading', { name: 'More' })).toBeVisible();
  });

  it('returns to the desktop settings root when that was the photo-settings opener', async () => {
    const user = userEvent.setup();
    settingsRouter({ initialEntries: ['/admin'] });
    await user.click(screen.getByRole('link', { name: 'Manage photos' }));
    await user.click(screen.getByRole('link', { name: 'Back to Hearth settings' }));
    expect(await screen.findByRole('heading', { name: 'Hearth settings' })).toBeVisible();
  });

  it('keeps the existing safe parent fallback for a directly opened setting', async () => {
    const user = userEvent.setup();
    settingsRouter({ initialEntries: ['/admin/connections/calendar'] });
    await user.click(screen.getByRole('link', { name: 'Back to Connections' }));
    expect(await screen.findByRole('heading', { name: 'Connections' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to Hearth settings' })).toHaveAttribute(
      'href',
      '/admin',
    );
  });

  it('does not carry settings return state into family destinations', async () => {
    const user = userEvent.setup();
    const router = settingsRouter();
    await user.click(screen.getByRole('link', { name: 'Photos' }));
    expect(await screen.findByRole('heading', { name: 'Family photos' })).toBeVisible();
    expect(router.state.location.state).toBeNull();
  });

  for (const settingsReturnTo of [
    'https://example.com',
    '//example.com',
    '/unknown',
    '/admin/household',
    '__proto__',
  ]) {
    it(`rejects an unknown, external or self-return opener: ${settingsReturnTo}`, () => {
      settingsRouter({
        initialEntries: [{ pathname: '/admin/household', state: { settingsReturnTo } }],
      });
      expect(screen.getByRole('link', { name: 'Back to Hearth settings' })).toHaveAttribute(
        'href',
        '/admin',
      );
    });
  }

  it('retains native modified-link behaviour rather than popping app history', () => {
    const router = settingsRouter({
      initialEntries: [
        '/more',
        { pathname: '/admin/household', state: { settingsReturnTo: '/more' } },
      ],
    });
    const key = router.state.location.key;
    // Observe the native default after React's handler, then suppress jsdom's
    // unimplemented new-document navigation only in this test.
    let appPreventedDefault = true;
    document.addEventListener(
      'click',
      (event) => {
        appPreventedDefault = event.defaultPrevented;
        event.preventDefault();
      },
      { once: true },
    );
    fireEvent.click(screen.getByRole('link', { name: 'Back to More' }), { ctrlKey: true });
    expect(router.state.location.key).toBe(key);
    expect(appPreventedDefault).toBe(false);
  });

  for (const error of [undefined, new Error('Settings unavailable')]) {
    it(`uses the same contextual Back while ${error === undefined ? 'loading' : 'failed'}`, () => {
      const router = createMemoryRouter(
        [
          {
            path: '/admin/household',
            element: <AdminQueryState title="Household" error={error ?? null} />,
          },
        ],
        {
          initialEntries: [{ pathname: '/admin/household', state: { settingsReturnTo: '/more' } }],
        },
      );
      render(<RouterProvider router={router} />);
      expect(screen.getByRole('link', { name: 'Back to More' })).toHaveAttribute('href', '/more');
    });
  }
});
