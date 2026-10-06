import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { adminApi as hearthApi } from '../api/admin';
import { useCommandMutation } from '../hooks/useCommandMutation';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminPage, AdminQueryState } from '../components/AdminPage';
import { WeatherLocationSettings } from '../components/WeatherLocationSettings';
import { useAdminQuery } from '../hooks/useAdminQueries';

export function HouseholdSettingsScreen() {
  const admin = useAdminQuery();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<{ name: string; timezone: string } | null>(null);
  useUnsavedChanges(draft !== null);
  const save = useCommandMutation('household', {
    mutationFn: (input: { name: string; timezone: string }, requestId: string) =>
      hearthApi.updateHousehold({ ...input, requestId }),
    onSuccess: async (overview, input) => {
      setDraft((current) =>
        current?.name === input.name && current.timezone === input.timezone ? null : current,
      );
      queryClient.setQueryData(queryKeys.admin, overview);
      await queryClient.invalidateQueries({ queryKey: ['hearth-runtime'] });
    },
  });
  if (admin.isPending) return <AdminQueryState title="Household" />;
  if (admin.data === undefined)
    return (
      <AdminQueryState
        title="Household"
        error={admin.error ?? new Error('Couldn’t load these settings.')}
        onRetry={() => void admin.refetch()}
      />
    );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate({
      name: String(form.get('name') ?? ''),
      timezone: String(form.get('timezone') ?? ''),
    });
  }

  return (
    <AdminPage title="Household">
      <form className="admin-form" onSubmit={submit}>
        <label>
          Household name
          <input
            disabled={save.isPending}
            value={draft?.name ?? admin.data.household.name}
            onChange={(event) =>
              setDraft({
                name: event.target.value,
                timezone: draft?.timezone ?? admin.data.household.timezone,
              })
            }
            maxLength={100}
            name="name"
            required
          />
        </label>
        <label>
          Home timezone
          <select
            disabled={save.isPending}
            value={draft?.timezone ?? admin.data.household.timezone}
            onChange={(event) =>
              setDraft({
                name: draft?.name ?? admin.data.household.name,
                timezone: event.target.value,
              })
            }
            name="timezone"
          >
            <option value="Australia/Perth">Perth · Western Australia</option>
            <option value="Australia/Adelaide">Adelaide · South Australia</option>
            <option value="Australia/Brisbane">Brisbane · Queensland</option>
            <option value="Australia/Sydney">Sydney, Melbourne or Hobart</option>
          </select>
        </label>
        <p className="field-help">Used for chores, routines and each new day.</p>
        {save.isError ? (
          <AdminError message={save.error.message} onRetry={save.retryCommand} />
        ) : null}
        {save.isSuccess ? (
          <p className="save-confirmation" role="status">
            Household saved.
          </p>
        ) : null}
        <button className="admin-submit" disabled={save.isPending} type="submit">
          {save.isPending ? 'Saving…' : 'Save household'}
        </button>
      </form>
      <WeatherLocationSettings />
    </AdminPage>
  );
}
