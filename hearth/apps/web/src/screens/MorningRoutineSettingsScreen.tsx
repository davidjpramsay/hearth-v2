import { useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MorningConfigurationSchema,
  type MorningConfiguration,
  type MorningSettings,
  type UpdateMorningSettings,
} from '@hearth/shared';
import { morningRoutineApi } from '../api/morningRoutine';
import { createRequestId, HearthApiError } from '../api/core';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminPage, AdminQueryState } from '../components/AdminPage';
import { useUnsavedChanges, confirmDiscardChanges } from '../hooks/useUnsavedChanges';
import './MorningRoutineSettingsScreen.css';

export function MorningRoutineSettingsScreen() {
  const query = useQuery({
    queryKey: queryKeys.morningSettings,
    queryFn: ({ signal }) => morningRoutineApi.settings(signal),
    retry: false,
  });
  if (!query.data)
    return (
      <AdminQueryState
        title="Morning Routine"
        backTo="/more"
        backLabel="Back to More"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  return (
    <MorningForm
      latest={query.data}
      readError={query.isError}
      refresh={() => void query.refetch()}
    />
  );
}

function MorningForm({
  latest,
  readError,
  refresh,
}: {
  latest: MorningSettings;
  readError: boolean;
  refresh: () => void;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<{
    configuration: MorningConfiguration;
    revision: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const pending = useRef<UpdateMorningSettings | null>(null);
  const running = useRef(false);
  useUnsavedChanges(draft !== null || frozen);
  const configuration = draft?.configuration ?? latest.configuration;
  const conflict = draft !== null && draft.revision !== latest.revision;
  function change(update: (current: MorningConfiguration) => MorningConfiguration) {
    setDraft((current) => ({
      revision: current?.revision ?? latest.revision,
      configuration: update(current?.configuration ?? latest.configuration),
    }));
    setNotice('');
    setError(null);
  }
  function stepsFor(id: string) {
    return configuration.routines.find((routine) => routine.memberId === id)?.steps ?? [];
  }
  function editSteps(
    id: string,
    update: (
      steps: MorningConfiguration['routines'][number]['steps'],
    ) => MorningConfiguration['routines'][number]['steps'],
  ) {
    change((current) => ({
      ...current,
      routines: current.routines.some((routine) => routine.memberId === id)
        ? current.routines.map((routine) =>
            routine.memberId === id ? { ...routine, steps: update(routine.steps) } : routine,
          )
        : [...current.routines, { memberId: id, steps: update([]) }],
    }));
  }
  function selectPerson(id: string, checked: boolean) {
    change((current) => ({
      ...current,
      selectedMemberIds: checked
        ? [...current.selectedMemberIds, id]
        : current.selectedMemberIds.filter((person) => person !== id),
      routines: current.routines.some((routine) => routine.memberId === id)
        ? current.routines
        : [...current.routines, { memberId: id, steps: [] }],
    }));
  }
  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (running.current) return;
    const parsed = MorningConfigurationSchema.safeParse(configuration);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the routine settings.');
      return;
    }
    pending.current ??= {
      requestId: createRequestId('morning_settings'),
      expectedRevision: draft?.revision ?? latest.revision,
      configuration: parsed.data,
    };
    running.current = true;
    setBusy(true);
    setFrozen(true);
    setError(null);
    setNotice('');
    try {
      await morningRoutineApi.save(pending.current);
      pending.current = null;
      setDraft(null);
      setFrozen(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.morningSettings }),
        client.invalidateQueries({ queryKey: queryKeys.morningRoutine }),
      ]);
      setNotice('Morning Routine saved.');
    } catch (failure) {
      if (
        failure instanceof HearthApiError &&
        [
          'VALIDATION_ERROR',
          'CONFLICT',
          'NOT_FOUND',
          'FORBIDDEN',
          'UNAUTHENTICATED',
          'MODULE_DISABLED',
        ].includes(failure.payload.error.code)
      ) {
        pending.current = null;
        setFrozen(false);
        if (failure.payload.error.code === 'CONFLICT') refresh();
      }
      setError(failure instanceof Error ? failure.message : 'Could not confirm these settings.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <AdminPage title="Morning Routine" backTo="/more" backLabel="Back to More">
      <p>
        Weekday checklists, with a fresh start each morning. These checks are separate from chores
        and pocket money.
      </p>
      {readError ? (
        <AdminError
          message="Could not refresh settings. Your draft is still here."
          onRetry={refresh}
        />
      ) : null}
      {error ? (
        <AdminError message={error} onRetry={frozen && !busy ? () => void save() : undefined} />
      ) : null}
      {conflict ? (
        <div className="admin-feedback" role="alert">
          Another device changed these settings. Your draft is still here.{' '}
          <button
            className="admin-secondary"
            type="button"
            onClick={() => {
              if (confirmDiscardChanges(true)) {
                setDraft(null);
                setError(null);
              }
            }}
          >
            Load latest settings
          </button>
        </div>
      ) : null}
      <form className="morning-settings" onSubmit={(event) => void save(event)}>
        <fieldset disabled={busy || frozen}>
          <legend>Morning countdown</legend>
          <div className="morning-settings__times">
            <label>
              Start time
              <input
                type="time"
                required
                value={configuration.startTime}
                onChange={(event) =>
                  change((current) => ({ ...current, startTime: event.target.value }))
                }
              />
            </label>
            <label>
              Ready by
              <input
                type="time"
                required
                value={configuration.endTime}
                onChange={(event) =>
                  change((current) => ({ ...current, endTime: event.target.value }))
                }
              />
            </label>
          </div>
          <p className="field-help">
            Monday–Friday · Uses your home’s timezone. The bar drains down until Ready by.
          </p>
        </fieldset>
        <fieldset disabled={busy || frozen}>
          <legend>Who’s getting ready?</legend>
          <div className="morning-settings__people">
            {latest.people.map((person) => (
              <label key={person.id}>
                <input
                  type="checkbox"
                  checked={configuration.selectedMemberIds.includes(person.id)}
                  onChange={(event) => selectPerson(person.id, event.target.checked)}
                />
                <img src={person.avatarUrl} alt="" width={40} height={40} />
                <span>{person.displayName}</span>
              </label>
            ))}
          </div>
          <p className="field-help">Unselecting someone keeps their list for later.</p>
        </fieldset>
        <fieldset disabled={busy || frozen}>
          <legend>Steps for each person</legend>
          {configuration.selectedMemberIds.length === 0 ? (
            <p>Select someone above to edit their list.</p>
          ) : (
            latest.people
              .filter((person) => configuration.selectedMemberIds.includes(person.id))
              .map((person, personIndex) => (
                <details
                  className="morning-editor"
                  key={person.id}
                  open={personIndex === 0 ? true : undefined}
                >
                  <summary>
                    {person.displayName}
                    <span>{stepsFor(person.id).length} steps</span>
                  </summary>
                  <div className="morning-editor__body">
                    <ol>
                      {stepsFor(person.id).map((step, index, steps) => (
                        <li key={step.id}>
                          <label>
                            <span>Step {index + 1}</span>
                            <input
                              aria-label={`${person.displayName} step ${index + 1}`}
                              maxLength={80}
                              required
                              value={step.title}
                              onChange={(event) =>
                                editSteps(person.id, (items) =>
                                  items.map((item) =>
                                    item.id === step.id
                                      ? { ...item, title: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <div className="morning-editor__actions">
                            <button
                              type="button"
                              className="admin-secondary"
                              disabled={index === 0}
                              aria-label={`Move ${person.displayName} step ${index + 1} up`}
                              onClick={() =>
                                editSteps(person.id, (items) => {
                                  const next = [...items];
                                  [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                                  return next;
                                })
                              }
                            >
                              ↑ Up
                            </button>
                            <button
                              type="button"
                              className="admin-secondary"
                              disabled={index === steps.length - 1}
                              aria-label={`Move ${person.displayName} step ${index + 1} down`}
                              onClick={() =>
                                editSteps(person.id, (items) => {
                                  const next = [...items];
                                  [next[index + 1], next[index]] = [next[index]!, next[index + 1]!];
                                  return next;
                                })
                              }
                            >
                              ↓ Down
                            </button>
                            <button
                              type="button"
                              className="admin-secondary"
                              aria-label={`Remove ${person.displayName} step ${index + 1}`}
                              onClick={() =>
                                editSteps(person.id, (items) =>
                                  items.filter((item) => item.id !== step.id),
                                )
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <button
                      type="button"
                      className="admin-secondary"
                      disabled={stepsFor(person.id).length >= 12}
                      onClick={() =>
                        editSteps(person.id, (steps) => [
                          ...steps,
                          { id: createRequestId('step'), title: '' },
                        ])
                      }
                    >
                      Add step for {person.displayName}
                    </button>
                  </div>
                </details>
              ))
          )}
          <p className="field-help">
            Suggested order only—children can tick any step. Up to 12 steps each.
          </p>
        </fieldset>
        <p role="status">{busy ? 'Saving…' : notice}</p>
        <button className="admin-primary" type="submit" disabled={busy || conflict || readError}>
          {frozen ? 'Retry save' : 'Save Morning Routine'}
        </button>
      </form>
    </AdminPage>
  );
}
