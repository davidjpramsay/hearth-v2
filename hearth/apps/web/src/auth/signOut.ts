import type { QueryClient } from '@tanstack/react-query';
import { runtimeApi } from '../api/runtime';
import { clearHearthClient } from '../api/core';

export async function signOutAndClear(queryClient: QueryClient): Promise<void> {
  await runtimeApi.signOut();
  await clearIdentityAndReload(queryClient, '/');
}

// After an explicit verified enrolment, the server has already replaced this browser's cookie.
// Do not call signOut here: that would revoke the newly established adult session.
export async function clearIdentityAndReload(
  queryClient: QueryClient,
  path: '/' | '/admin/televisions' | '/today',
): Promise<void> {
  document.documentElement.style.visibility = 'hidden';
  window.dispatchEvent(new Event('hearth:sign-out'));
  await queryClient.cancelQueries();
  queryClient.clear();
  clearHearthClient();
  // Do not let a back/forward-cache restoration briefly reveal the old document.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) window.location.reload();
  });
  // A new document also unmounts private views and closes retained realtime streams.
  window.location.replace(path);
}
