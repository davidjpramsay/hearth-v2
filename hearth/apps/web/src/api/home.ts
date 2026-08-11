import { HomeActionResultSchema, HomeStatusSchema, type HomeActionId } from '@hearth/shared';

import { householdApiBase, request } from './core';

export const homeApi = {
  getHome: () => request(`${householdApiBase()}/home`, HomeStatusSchema),
  executeHomeAction: (actionId: HomeActionId, requestId: string, confirmed: boolean) =>
    request(`${householdApiBase()}/home/actions/${actionId}`, HomeActionResultSchema, {
      method: 'POST',
      body: JSON.stringify({ requestId, confirmed }),
    }),
};
