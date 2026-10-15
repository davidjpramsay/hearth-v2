import {
  ModuleCommandResultSchema,
  ModulesConfigurationSchema,
  type ModuleId,
  type UpdateModuleRequest,
} from '@hearth/shared';
import { demoAdminHeaders, householdApiBase, request } from './core';

export const modulesApi = {
  get: (signal?: AbortSignal) =>
    request(`${householdApiBase()}/modules`, ModulesConfigurationSchema, {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    }),
  update: (id: ModuleId, input: UpdateModuleRequest) =>
    request(`${householdApiBase()}/modules/${id}`, ModuleCommandResultSchema, {
      method: 'PUT',
      cache: 'no-store',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
};
