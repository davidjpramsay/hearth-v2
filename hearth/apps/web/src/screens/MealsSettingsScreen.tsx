import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ChevronDown, Clock3, Copy, RotateCcw, Search, Star } from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import type { MealPlan, MealPlanEntryInput, SavedMeal } from '@hearth/shared';

import { createRequestId } from '../api/core';
import { mealsApi as hearthApi } from '../api/meals';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { useMealPlanQuery, useSavedMealLibraryQuery } from '../hooks/useMealQueries';
import { useHearthRuntime } from '../runtime/context';

interface SavedMealFields {
  name: string;
  description: string | null;
  preparationMinutes: number | null;
  favourite: boolean;
}

type MealManagementAction = { requestId: string } & (
  | { kind: 'save-week'; startDate: string; entries: MealPlanEntryInput[] }
  | { kind: 'clear-week'; startDate: string }
  | { kind: 'copy-week'; sourceStartDate: string; targetStartDate: string }
  | { kind: 'create-meal'; fields: SavedMealFields }
  | { kind: 'update-meal'; mealId: string; fields: SavedMealFields }
  | { kind: 'archive-meal'; mealId: string; name: string }
  | { kind: 'restore-meal'; mealId: string; name: string }
);

export function MealsSettingsScreen() {
  const { weekStart } = useHearthRuntime();
  const [startDate, setStartDate] = useState(() => weekStart);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [copyConfirmation, setCopyConfirmation] = useState(false);
  const [clearConfirmation, setClearConfirmation] = useState(false);
  const [archiveConfirmation, setArchiveConfirmation] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const plan = useMealPlanQuery(startDate);
  const library = useSavedMealLibraryQuery();
  const queryClient = useQueryClient();

  const management = useMutation({
    mutationFn: runMealManagementAction,
    onSuccess: async ({ plan: updatedPlan, message }, action) => {
      if (updatedPlan !== undefined) {
        queryClient.setQueryData(queryKeys.meals(updatedPlan.startDate), updatedPlan);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.savedMealLibrary }),
        queryClient.invalidateQueries({ queryKey: queryKeys.meals(startDate) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.today }),
      ]);
      if (action.kind === 'create-meal') setShowCreate(false);
      setCopyConfirmation(false);
      setClearConfirmation(false);
      setArchiveConfirmation(null);
      setConfirmation(message);
    },
  });

  if (plan.isPending || library.isPending) return <AdminLoading />;
  if (plan.isError) return <AdminError message={plan.error.message} />;
  if (library.isError) return <AdminError message={library.error.message} />;

  const currentPlan = plan.data;
  const savedMealLibrary = library.data;
  const normalisedSearch = search.trim().toLocaleLowerCase('en-AU');
  const visibleMeals = savedMealLibrary.activeMeals.filter(
    (meal) =>
      normalisedSearch.length === 0 ||
      meal.name.toLocaleLowerCase('en-AU').includes(normalisedSearch) ||
      (meal.description?.toLocaleLowerCase('en-AU').includes(normalisedSearch) ?? false),
  );
  const planRevision = mealPlanRevision(currentPlan);

  function saveWeek(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const entries = currentPlan.days.flatMap<MealPlanEntryInput>((day) => {
      const mealName = String(data.get(`mealName:${day.localDate}`) ?? '').trim();
      if (mealName.length === 0) return [];
      const savedMealId = String(data.get(`savedMealId:${day.localDate}`) ?? '');
      return [
        {
          localDate: day.localDate,
          slot: 'dinner',
          mealName,
          savedMealId: savedMealId.length === 0 ? null : savedMealId,
          note: String(data.get(`note:${day.localDate}`) ?? '').trim() || null,
        },
      ];
    });
    if (entries.length === 0) {
      setClearConfirmation(true);
      setConfirmation('No dinners are entered. Confirm clearing the week below.');
      return;
    }
    management.mutate({
      kind: 'save-week',
      requestId: createRequestId('meal_week_save'),
      startDate,
      entries,
    });
  }

  function createMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    management.mutate({
      kind: 'create-meal',
      requestId: createRequestId('saved_meal_create'),
      fields: savedMealFields(new FormData(event.currentTarget)),
    });
  }

  return (
    <AdminPage
      backLabel="Back to Family planning"
      backTo="/admin/planning"
      title="Meal planning"
      subtitle="Plan the week quickly and keep reusable family favourites"
    >
      <div className="meal-settings-intro">
        <Icon name="meal" />
        <div>
          <strong>Dinner stays simple on the television</strong>
          <p>
            Edit several nights together here. Breakfast and lunch remain available later if needed.
          </p>
        </div>
      </div>

      {confirmation === null ? null : (
        <p className="save-confirmation" role="status">
          {confirmation}
        </p>
      )}
      {management.isError ? (
        <div className="meal-settings-error">
          <AdminError message={management.error.message} />
          {management.variables === undefined ? null : (
            <button
              className="admin-secondary"
              onClick={() => management.mutate(management.variables)}
              type="button"
            >
              Try again
            </button>
          )}
        </div>
      ) : null}

      <section className="meal-week-settings" aria-labelledby="meal-week-settings-heading">
        <header>
          <div>
            <p className="admin-kicker">Seven-night plan</p>
            <h2 id="meal-week-settings-heading">{currentPlan.displayRange}</h2>
          </div>
          <div className="meal-settings-week-nav">
            <button
              aria-label="Earlier week"
              className="admin-secondary"
              onClick={() => setStartDate((current) => addDays(current, -7))}
              type="button"
            >
              <Icon name="chevron-left" />
            </button>
            {startDate === weekStart ? null : (
              <button
                className="admin-secondary"
                onClick={() => setStartDate(weekStart)}
                type="button"
              >
                This week
              </button>
            )}
            <button
              aria-label="Later week"
              className="admin-secondary"
              onClick={() => setStartDate((current) => addDays(current, 7))}
              type="button"
            >
              <Icon name="chevron-right" />
            </button>
          </div>
        </header>

        <form className="meal-week-settings__form" key={planRevision} onSubmit={saveWeek}>
          <div className="meal-week-settings__days">
            {currentPlan.days.map((day) => {
              const dinner = day.entries.find((entry) => entry.slot === 'dinner') ?? null;
              const hasNote = dinner?.note !== null && dinner?.note !== undefined;
              return (
                <article className="meal-night-editor" key={day.localDate}>
                  <div className="meal-night-editor__date">
                    <strong>{day.dayLabel}</strong>
                    <span>{day.dateLabel}</span>
                  </div>
                  <label className="meal-night-editor__dinner">
                    <span>Dinner</span>
                    <input
                      aria-label={`${day.dayLabel} dinner`}
                      defaultValue={dinner?.mealName ?? ''}
                      maxLength={160}
                      name={`mealName:${day.localDate}`}
                      placeholder="Nothing planned"
                    />
                  </label>
                  <details className="meal-night-editor__options" open={hasNote}>
                    <summary aria-label={`${day.dayLabel} dinner details`}>
                      <span>{hasNote ? 'Note added' : 'Details'}</span>
                      <ChevronDown aria-hidden="true" />
                    </summary>
                    <div className="meal-night-editor__option-fields">
                      <label>
                        <span>Saved meal</span>
                        <select
                          aria-label={`${day.dayLabel} saved meal`}
                          defaultValue={dinner?.savedMealId ?? ''}
                          name={`savedMealId:${day.localDate}`}
                          onChange={(event) =>
                            applySavedMealToDinner(
                              event,
                              day.localDate,
                              savedMealLibrary.activeMeals,
                            )
                          }
                        >
                          <option value="">Custom dinner</option>
                          {savedMealLibrary.activeMeals.map((meal) => (
                            <option key={meal.id} value={meal.id}>
                              {meal.favourite ? '★ ' : ''}
                              {meal.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Note</span>
                        <input
                          aria-label={`${day.dayLabel} dinner note`}
                          defaultValue={dinner?.note ?? ''}
                          maxLength={240}
                          name={`note:${day.localDate}`}
                          placeholder="Optional"
                        />
                      </label>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
          <button className="admin-submit" disabled={management.isPending} type="submit">
            {management.isPending && management.variables?.kind === 'save-week'
              ? 'Saving week…'
              : 'Save week'}
          </button>
        </form>

        <div className="meal-week-tools">
          <div>
            <button
              className="admin-secondary"
              disabled={management.isPending}
              onClick={() => setCopyConfirmation(true)}
              type="button"
            >
              <Copy aria-hidden="true" /> Copy previous week
            </button>
            {copyConfirmation ? (
              <div
                className="meal-tool-confirmation"
                role="group"
                aria-label="Confirm copying week"
              >
                <p>Replace this week with the previous week’s dinners?</p>
                <button
                  className="admin-submit"
                  onClick={() =>
                    management.mutate({
                      kind: 'copy-week',
                      requestId: createRequestId('meal_week_copy'),
                      sourceStartDate: addDays(startDate, -7),
                      targetStartDate: startDate,
                    })
                  }
                  type="button"
                >
                  Replace and copy
                </button>
                <button
                  className="admin-secondary"
                  onClick={() => setCopyConfirmation(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
          <div>
            <button
              className="admin-danger"
              disabled={management.isPending}
              onClick={() => setClearConfirmation(true)}
              type="button"
            >
              <Archive aria-hidden="true" /> Clear this week
            </button>
            {clearConfirmation ? (
              <div
                className="meal-tool-confirmation"
                role="group"
                aria-label="Confirm clearing week"
              >
                <p>Clear every planned dinner in this week?</p>
                <button
                  className="admin-danger"
                  onClick={() =>
                    management.mutate({
                      kind: 'clear-week',
                      requestId: createRequestId('meal_week_clear'),
                      startDate,
                    })
                  }
                  type="button"
                >
                  Clear all dinners
                </button>
                <button
                  className="admin-secondary"
                  onClick={() => setClearConfirmation(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section
        className="saved-meal-library"
        aria-labelledby="saved-meal-library-heading"
        id="saved-meals"
      >
        <header>
          <div>
            <p className="admin-kicker">Reusable ideas</p>
            <h2 id="saved-meal-library-heading">Saved family meals</h2>
            <p>{savedMealLibrary.activeMeals.length} active meals · favourites appear first</p>
          </div>
          <button
            className="admin-secondary"
            onClick={() => setShowCreate((current) => !current)}
            type="button"
          >
            <Icon name="plus" /> {showCreate ? 'Cancel' : 'New meal'}
          </button>
        </header>

        {showCreate ? (
          <form className="saved-meal-create admin-form" onSubmit={createMeal}>
            <h3>Save a family meal</h3>
            <SavedMealFields />
            <button className="admin-submit" disabled={management.isPending} type="submit">
              Save meal
            </button>
          </form>
        ) : null}

        <label className="saved-meal-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search saved meals</span>
          <input
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search saved meals"
            type="search"
            value={search}
          />
        </label>

        {visibleMeals.length === 0 ? (
          <p className="saved-meal-empty">No saved meals match that search.</p>
        ) : (
          <div className="saved-meal-cards">
            {visibleMeals.map((meal) => (
              <SavedMealEditor
                archiveConfirmation={archiveConfirmation === meal.id}
                key={meal.id}
                meal={meal}
                onArchive={() => {
                  if (archiveConfirmation !== meal.id) {
                    setArchiveConfirmation(meal.id);
                    return;
                  }
                  management.mutate({
                    kind: 'archive-meal',
                    requestId: createRequestId('saved_meal_archive'),
                    mealId: meal.id,
                    name: meal.name,
                  });
                }}
                onCancelArchive={() => setArchiveConfirmation(null)}
                onSave={(fields) =>
                  management.mutate({
                    kind: 'update-meal',
                    requestId: createRequestId('saved_meal_update'),
                    mealId: meal.id,
                    fields,
                  })
                }
                pending={management.isPending}
              />
            ))}
          </div>
        )}

        {savedMealLibrary.archivedMeals.length === 0 ? null : (
          <details className="archived-saved-meals">
            <summary>Archived meals · {savedMealLibrary.archivedMeals.length}</summary>
            <p>Archived meals remain in past plans and can be restored.</p>
            {savedMealLibrary.archivedMeals.map((meal) => (
              <div className="archived-saved-meal" key={meal.id}>
                <span>
                  <strong>{meal.name}</strong>
                  <small>Archived safely</small>
                </span>
                <button
                  className="admin-secondary"
                  disabled={management.isPending}
                  onClick={() =>
                    management.mutate({
                      kind: 'restore-meal',
                      requestId: createRequestId('saved_meal_restore'),
                      mealId: meal.id,
                      name: meal.name,
                    })
                  }
                  type="button"
                >
                  <RotateCcw aria-hidden="true" /> Restore
                </button>
              </div>
            ))}
          </details>
        )}
      </section>
    </AdminPage>
  );
}

function SavedMealEditor({
  meal,
  pending,
  archiveConfirmation,
  onSave,
  onArchive,
  onCancelArchive,
}: {
  meal: SavedMeal;
  pending: boolean;
  archiveConfirmation: boolean;
  onSave: (fields: SavedMealFields) => void;
  onArchive: () => void;
  onCancelArchive: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(savedMealFields(new FormData(event.currentTarget)));
  }

  return (
    <details className="saved-meal-card">
      <summary>
        <span
          className="saved-meal-card__star"
          aria-label={meal.favourite ? 'Favourite' : undefined}
        >
          <Star aria-hidden="true" fill={meal.favourite ? 'currentColor' : 'none'} />
        </span>
        <span>
          <strong>{meal.name}</strong>
          <small>
            {meal.preparationMinutes === null
              ? (meal.description ?? 'No notes yet')
              : `${meal.preparationMinutes} min${meal.description === null ? '' : ` · ${meal.description}`}`}
          </small>
        </span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <form className="admin-form saved-meal-edit" onSubmit={submit}>
        <SavedMealFields meal={meal} />
        <div className="saved-meal-edit__actions">
          <button className="admin-submit" disabled={pending} type="submit">
            Save changes
          </button>
          <button className="admin-danger" disabled={pending} onClick={onArchive} type="button">
            <Archive aria-hidden="true" />{' '}
            {archiveConfirmation ? `Archive ${meal.name}?` : 'Archive'}
          </button>
          {archiveConfirmation ? (
            <button className="admin-secondary" onClick={onCancelArchive} type="button">
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </details>
  );
}

function SavedMealFields({ meal }: { meal?: SavedMeal }) {
  return (
    <>
      <label>
        Meal name
        <input defaultValue={meal?.name ?? ''} maxLength={140} name="name" required />
      </label>
      <div className="admin-form__split saved-meal-fields__split">
        <label>
          <span className="saved-meal-field-label">
            <Clock3 aria-hidden="true" /> Preparation time
          </span>
          <input
            defaultValue={meal?.preparationMinutes ?? ''}
            max={600}
            min={1}
            name="preparationMinutes"
            placeholder="Minutes"
            type="number"
          />
        </label>
        <label className="saved-meal-favourite">
          <input defaultChecked={meal?.favourite ?? true} name="favourite" type="checkbox" />
          <span>
            <Star aria-hidden="true" /> Family favourite
          </span>
        </label>
      </div>
      <label>
        Notes
        <textarea
          defaultValue={meal?.description ?? ''}
          maxLength={320}
          name="description"
          placeholder="Why it works, serving ideas or preparation notes"
          rows={3}
        />
      </label>
    </>
  );
}

function savedMealFields(data: FormData): SavedMealFields {
  const preparation = String(data.get('preparationMinutes') ?? '').trim();
  return {
    name: String(data.get('name') ?? '').trim(),
    description: String(data.get('description') ?? '').trim() || null,
    preparationMinutes: preparation.length === 0 ? null : Number(preparation),
    favourite: data.get('favourite') === 'on',
  };
}

function applySavedMealToDinner(
  event: ChangeEvent<HTMLSelectElement>,
  localDate: string,
  meals: readonly SavedMeal[],
) {
  const selected = meals.find((meal) => meal.id === event.currentTarget.value);
  if (selected === undefined) return;
  const input = event.currentTarget.form?.elements.namedItem(`mealName:${localDate}`);
  if (input instanceof HTMLInputElement) input.value = selected.name;
}

function mealPlanRevision(plan: MealPlan): string {
  return `${plan.startDate}:${plan.days
    .flatMap((day) => day.entries)
    .map((entry) => `${entry.id}:${entry.mealName}:${entry.note ?? ''}`)
    .join('|')}`;
}

async function runMealManagementAction(action: MealManagementAction): Promise<{
  plan?: MealPlan;
  message: string;
}> {
  switch (action.kind) {
    case 'save-week': {
      const result = await hearthApi.updateMealPlanWeek({
        requestId: action.requestId,
        startDate: action.startDate,
        entries: action.entries,
      });
      return { plan: result.plan, message: 'The week’s dinner plan was saved.' };
    }
    case 'clear-week': {
      const result = await hearthApi.clearMealPlanWeek(action.startDate, action.requestId);
      return { plan: result.plan, message: 'The week was cleared.' };
    }
    case 'copy-week': {
      const result = await hearthApi.copyMealPlanWeek({
        requestId: action.requestId,
        sourceStartDate: action.sourceStartDate,
        targetStartDate: action.targetStartDate,
        replaceExisting: true,
      });
      return { plan: result.plan, message: 'The previous week was copied.' };
    }
    case 'create-meal':
      await hearthApi.createSavedMeal({ requestId: action.requestId, ...action.fields });
      return { message: `${action.fields.name} was saved.` };
    case 'update-meal':
      await hearthApi.updateSavedMeal(action.mealId, {
        requestId: action.requestId,
        ...action.fields,
      });
      return { message: `${action.fields.name} was updated.` };
    case 'archive-meal':
      await hearthApi.archiveSavedMeal(action.mealId, action.requestId);
      return { message: `${action.name} was archived and can be restored.` };
    case 'restore-meal':
      await hearthApi.restoreSavedMeal(action.mealId, action.requestId);
      return { message: `${action.name} is active again.` };
  }
}

function addDays(localDate: string, amount: number): string {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
