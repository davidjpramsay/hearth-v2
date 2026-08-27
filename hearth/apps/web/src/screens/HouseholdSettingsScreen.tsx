import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';

import { adminApi as hearthApi } from '../api/admin';
import { createRequestId } from '../api/core';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { WeatherLocationSettings } from '../components/WeatherLocationSettings';
import { useAdminQuery } from '../hooks/useAdminQueries';

export function HouseholdSettingsScreen() {
  const admin = useAdminQuery();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: hearthApi.updateHousehold,
    onSuccess: async (overview) => {
      queryClient.setQueryData(queryKeys.admin, overview);
      await queryClient.invalidateQueries({ queryKey: ['hearth-runtime'] });
    },
  });
  if (admin.isPending) return <AdminLoading />;
  if (admin.isError) return <AdminError message={admin.error.message} />;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate({
      requestId: createRequestId('household'),
      name: String(form.get('name') ?? ''),
      timezone: String(form.get('timezone') ?? ''),
    });
  }

  return (
    <AdminPage title="Household">
      <form
        className="admin-form"
        key={`${admin.data.household.name}:${admin.data.household.timezone}`}
        onSubmit={submit}
      >
        <label>
          Household name
          <input defaultValue={admin.data.household.name} maxLength={100} name="name" required />
        </label>
        <label>
          Home timezone
          <select defaultValue={admin.data.household.timezone} name="timezone">
            <option value="Australia/Perth">Perth · Western Australia</option>
            <option value="Australia/Adelaide">Adelaide · South Australia</option>
            <option value="Australia/Brisbane">Brisbane · Queensland</option>
            <option value="Australia/Sydney">Sydney, Melbourne or Hobart</option>
          </select>
        </label>
        <p className="field-help">Used for chores, routines and each new day.</p>
        {save.isError ? <AdminError message={save.error.message} /> : null}
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
