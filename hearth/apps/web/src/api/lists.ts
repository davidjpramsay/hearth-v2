import {
  HouseholdListSettingsSchema,
  HouseholdListsSchema,
  ListItemCommandResultSchema,
  ListSettingsCommandResultSchema,
  type HouseholdListSettings,
  type HouseholdListType,
  type ListSettingsCommandResult,
} from '@hearth/shared';

import { demoAdminHeaders, householdApiBase, request } from './core';

export const listsApi = {
  getLists: () => request(`${householdApiBase()}/lists`, HouseholdListsSchema),
  getListSettings: (): Promise<HouseholdListSettings> =>
    request(`${householdApiBase()}/list-settings`, HouseholdListSettingsSchema, {
      headers: demoAdminHeaders,
    }),
  createList: (input: {
    requestId: string;
    name: string;
    type: HouseholdListType;
    color: string;
  }): Promise<ListSettingsCommandResult> =>
    request(`${householdApiBase()}/lists`, ListSettingsCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  updateList: (
    listId: string,
    input: { requestId: string; name: string; type: HouseholdListType; color: string },
  ): Promise<ListSettingsCommandResult> =>
    request(`${householdApiBase()}/lists/${listId}`, ListSettingsCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  archiveList: (listId: string, requestId: string): Promise<ListSettingsCommandResult> =>
    request(`${householdApiBase()}/lists/${listId}/archives`, ListSettingsCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId }),
    }),
  restoreList: (listId: string, requestId: string): Promise<ListSettingsCommandResult> =>
    request(`${householdApiBase()}/lists/${listId}/restorations`, ListSettingsCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId }),
    }),
  reorderLists: (orderedListIds: string[], requestId: string): Promise<ListSettingsCommandResult> =>
    request(`${householdApiBase()}/list-order`, ListSettingsCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId, orderedListIds }),
    }),
  updateListItem: (
    itemId: string,
    input: { requestId: string; text: string; quantity: string | null },
  ): Promise<ListSettingsCommandResult> =>
    request(`${householdApiBase()}/list-items/${itemId}`, ListSettingsCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  archiveListItem: (itemId: string, requestId: string): Promise<ListSettingsCommandResult> =>
    request(
      `${householdApiBase()}/list-items/${itemId}/archives`,
      ListSettingsCommandResultSchema,
      { method: 'POST', headers: demoAdminHeaders, body: JSON.stringify({ requestId }) },
    ),
  reorderListItems: (
    listId: string,
    orderedItemIds: string[],
    requestId: string,
  ): Promise<ListSettingsCommandResult> =>
    request(`${householdApiBase()}/lists/${listId}/item-order`, ListSettingsCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId, orderedItemIds }),
    }),
  clearCheckedListItems: (listId: string, requestId: string): Promise<ListSettingsCommandResult> =>
    request(
      `${householdApiBase()}/lists/${listId}/checked-item-clears`,
      ListSettingsCommandResultSchema,
      { method: 'POST', headers: demoAdminHeaders, body: JSON.stringify({ requestId }) },
    ),
  addListItem: (
    listId: string,
    input: { requestId: string; text: string; quantity: string | null },
    source: 'companion' | 'voice' = 'companion',
  ) =>
    request(`${householdApiBase()}/lists/${listId}/items`, ListItemCommandResultSchema, {
      method: 'POST',
      headers:
        source === 'voice'
          ? { ...demoAdminHeaders, 'X-Hearth-Demo-Source': 'voice' }
          : demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  assistAddListItem: (input: {
    requestId: string;
    listName: string;
    text: string;
    quantity: string | null;
  }) =>
    request(`${householdApiBase()}/assist/list-items`, ListItemCommandResultSchema, {
      method: 'POST',
      headers: { ...demoAdminHeaders, 'X-Hearth-Demo-Source': 'voice' },
      body: JSON.stringify(input),
    }),
  completeListItem: (itemId: string, requestId: string, source: 'tv' | 'companion') =>
    request(`${householdApiBase()}/list-items/${itemId}/completions`, ListItemCommandResultSchema, {
      method: 'POST',
      ...(source === 'companion' ? { headers: demoAdminHeaders } : {}),
      body: JSON.stringify({ requestId }),
    }),
  undoListItem: (itemId: string, requestId: string, source: 'tv' | 'companion') =>
    request(
      `${householdApiBase()}/list-items/${itemId}/completion-reversals`,
      ListItemCommandResultSchema,
      {
        method: 'POST',
        ...(source === 'companion' ? { headers: demoAdminHeaders } : {}),
        body: JSON.stringify({ requestId }),
      },
    ),
};
