import {
  ChoreCommandResultSchema,
  ChoreListSchema,
  ChoreOccurrenceChangeResultSchema,
  ChoreOccurrenceDetailSchema,
  ChoreSkipResultSchema,
  ChoreTemplateCommandResultSchema,
  ChoreTemplateListSchema,
  ChoreTemplateOrderCommandResultSchema,
} from '@hearth/shared';
import type { RoutineTimeOfDay } from '@hearth/shared';

import { demoAdminHeaders, getHearthRuntime, householdApiBase, request } from './core';

export interface ChoreTemplateInput {
  title: string;
  description: string | null;
  assigneeIds: string[];
  routineLabel: RoutineTimeOfDay;
  availableFromTime: string | null;
  dueTime: string | null;
  repeat: 'once' | 'daily' | 'weekdays' | 'weekly';
  repeatDays: Array<'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'>;
  activeFrom: string;
}

export const choresApi = {
  getChores: () =>
    request(
      `${householdApiBase()}/chore-occurrences?date=${getHearthRuntime().localDate}`,
      ChoreListSchema,
    ),
  completeChore: (occurrenceId: string, requestId: string) =>
    request(
      `${householdApiBase()}/chore-occurrences/${occurrenceId}/completions`,
      ChoreCommandResultSchema,
      { method: 'POST', body: JSON.stringify({ requestId }) },
    ),
  undoChore: (occurrenceId: string, requestId: string, completionId: string) =>
    request(
      `${householdApiBase()}/chore-occurrences/${occurrenceId}/completion-reversals`,
      ChoreCommandResultSchema,
      { method: 'POST', body: JSON.stringify({ requestId, completionId }) },
    ),
  getChoreOccurrenceDetail: (occurrenceId: string) =>
    request(
      `${householdApiBase()}/chore-occurrences/${occurrenceId}`,
      ChoreOccurrenceDetailSchema,
      { headers: demoAdminHeaders },
    ),
  skipChore: (occurrenceId: string, requestId: string, reason: string) =>
    request(
      `${householdApiBase()}/chore-occurrences/${occurrenceId}/skips`,
      ChoreSkipResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId, reason }),
      },
    ),
  excuseChore: (occurrenceId: string, requestId: string, reason: string) =>
    request(
      `${householdApiBase()}/chore-occurrences/${occurrenceId}/excuses`,
      ChoreOccurrenceChangeResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId, reason }),
      },
    ),
  reassignChore: (occurrenceId: string, requestId: string, assigneeId: string, reason: string) =>
    request(
      `${householdApiBase()}/chore-occurrences/${occurrenceId}/reassignments`,
      ChoreOccurrenceChangeResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId, assigneeId, reason }),
      },
    ),
  getChoreTemplates: () =>
    request(`${householdApiBase()}/chore-templates`, ChoreTemplateListSchema, {
      headers: demoAdminHeaders,
    }),
  createChoreTemplate: (input: ChoreTemplateInput & { requestId: string }) =>
    request(`${householdApiBase()}/chore-templates`, ChoreTemplateCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  updateChoreTemplate: (templateId: string, input: ChoreTemplateInput & { requestId: string }) =>
    request(
      `${householdApiBase()}/chore-templates/${templateId}`,
      ChoreTemplateCommandResultSchema,
      { method: 'PATCH', headers: demoAdminHeaders, body: JSON.stringify(input) },
    ),
  reorderChoreTemplates: (orderedTemplateIds: string[], requestId: string) =>
    request(`${householdApiBase()}/chore-template-order`, ChoreTemplateOrderCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId, orderedTemplateIds }),
    }),
  archiveChoreTemplate: (templateId: string, requestId: string) =>
    request(
      `${householdApiBase()}/chore-templates/${templateId}/archivals`,
      ChoreTemplateCommandResultSchema,
      { method: 'POST', headers: demoAdminHeaders, body: JSON.stringify({ requestId }) },
    ),
  restoreChoreTemplate: (templateId: string, requestId: string, resumeFrom: string) =>
    request(
      `${householdApiBase()}/chore-templates/${templateId}/restorations`,
      ChoreTemplateCommandResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId, resumeFrom }),
      },
    ),
};
