import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import type { DemoScenario } from '@hearth/shared';

import { createRequestId, DEMO_DATE, hearthApi, queryKeys } from '../api/client';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { FailureState, LoadingState } from '../components/Status';
import { useMealPlanQuery } from '../hooks/useHearthQueries';

export function MealsScreen({
  scenario: _scenario,
  preparing,
}: {
  scenario: DemoScenario | 'offline';
  preparing: boolean;
}) {
  const [startDate, setStartDate] = useState(DEMO_DATE);
  const [selectedDate, setSelectedDate] = useState(DEMO_DATE);
  const [tvMessage, setTvMessage] = useState<string | null>(null);
  const plan = useMealPlanQuery(startDate, !preparing);
  const queryClient = useQueryClient();
  const savePlan = useMutation({
    mutationFn: hearthApi.upsertMealPlan,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.meals(startDate) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.today }),
      ]);
    },
  });
  const saveMeal = useMutation({
    mutationFn: hearthApi.createSavedMeal,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.meals(startDate) }),
  });

  if (preparing || plan.isPending) return <LoadingState />;
  if (plan.data === undefined) return <FailureState onRetry={() => void plan.refetch()} />;
  const selectedDay =
    plan.data.days.find((day) => day.localDate === selectedDate) ?? plan.data.days[0];
  const selectedDinner = selectedDay?.entries.find((entry) => entry.slot === 'dinner') ?? null;
  const today = plan.data.days.find((day) => day.isToday) ?? plan.data.days[0];
  const tonight = today?.entries.find((entry) => entry.slot === 'dinner') ?? null;

  function submitPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedDay === undefined) return;
    const data = new FormData(event.currentTarget);
    const mealName = String(data.get('mealName') ?? '').trim();
    if (mealName.length === 0) return;
    const savedMealId = String(data.get('savedMealId') ?? '');
    savePlan.mutate({
      requestId: createRequestId('meal_plan'),
      localDate: selectedDay.localDate,
      slot: 'dinner',
      mealName,
      savedMealId: savedMealId.length === 0 ? null : savedMealId,
      note: String(data.get('note') ?? '').trim() || null,
    });
  }

  function submitSavedMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get('savedMealName') ?? '').trim();
    if (name.length === 0) return;
    saveMeal.mutate({
      requestId: createRequestId('saved_meal'),
      name,
      description: null,
    });
    form.reset();
  }

  return (
    <div className="screen meals-screen">
      <ScreenHeader eyebrow="Dinner plan" title="Meals" meta={plan.data.displayRange} />
      <section className="tonight-band" aria-labelledby="tonight-heading">
        <Icon name="meal" />
        <div>
          <p>Tonight</p>
          <h2 id="tonight-heading">{tonight?.mealName ?? 'Nothing planned yet'}</h2>
          <span>{tonight?.note ?? 'Dinner plan is ready for the week.'}</span>
        </div>
      </section>
      <div className="meal-week" aria-label={plan.data.displayRange}>
        {plan.data.days.map((day, index, days) => {
          const dinner = day.entries.find((entry) => entry.slot === 'dinner');
          return (
            <button
              aria-current={day.localDate === selectedDay?.localDate ? 'date' : undefined}
              className={`meal-day focusable${day.localDate === selectedDay?.localDate ? ' meal-day--selected' : ''}`}
              data-focus-down="meal-saved"
              data-focus-id={`meal-day-${day.localDate}`}
              data-focus-left={
                index === 0
                  ? 'nav-meals'
                  : `meal-day-${days[index - 1]?.localDate ?? day.localDate}`
              }
              data-focus-right={`meal-day-${days[Math.min(index + 1, days.length - 1)]?.localDate ?? day.localDate}`}
              key={day.localDate}
              onClick={() => setSelectedDate(day.localDate)}
              type="button"
            >
              <span>{day.dayLabel}</span>
              <strong>{dinner?.mealName ?? 'Plan dinner'}</strong>
            </button>
          );
        })}
      </div>
      <div className="meal-actions">
        <button
          className="meal-action focusable"
          data-focus-id="meal-saved"
          data-focus-left="nav-meals"
          data-focus-up={`meal-day-${selectedDay?.localDate ?? DEMO_DATE}`}
          onClick={() =>
            setTvMessage(`${plan.data.savedMeals.length} family favourites are ready on the phone.`)
          }
          type="button"
        >
          <Icon name="star" />
          <span>
            <strong>Saved family meals</strong>
            <small>{plan.data.savedMeals.length} favourites</small>
          </span>
          <Icon name="chevron-right" />
        </button>
        <button
          className="meal-action focusable"
          data-focus-id="meal-plan-phone"
          data-focus-up={`meal-day-${selectedDay?.localDate ?? DEMO_DATE}`}
          onClick={() => setTvMessage('Open Meals on your phone to change the family plan.')}
          type="button"
        >
          <Icon name="calendar" />
          <span>
            <strong>Plan another night</strong>
            <small>Comfortable editing on phone</small>
          </span>
          <Icon name="chevron-right" />
        </button>
      </div>
      {tvMessage === null ? null : (
        <div className="meal-tv-message" role="status">
          <span>{tvMessage}</span>
          <button onClick={() => setTvMessage(null)} type="button">
            Got it
          </button>
        </div>
      )}
      <div className="meal-week-controls">
        <button
          className="focusable"
          data-focus-id="meal-earlier"
          onClick={() => {
            const earlier = addDays(startDate, -7);
            setStartDate(earlier);
            setSelectedDate(earlier);
          }}
          type="button"
        >
          <Icon name="chevron-left" /> Earlier week
        </button>
        <button
          className="focusable"
          data-focus-id="meal-later"
          onClick={() => {
            const later = addDays(startDate, 7);
            setStartDate(later);
            setSelectedDate(later);
          }}
          type="button"
        >
          Later week <Icon name="chevron-right" />
        </button>
      </div>
      <section className="phone-meal-editor" aria-label="Edit dinner plan">
        <h2>
          {selectedDay?.dayLabel} {selectedDay?.dateLabel} dinner
        </h2>
        <form
          key={`${selectedDay?.localDate}:${selectedDinner?.id ?? 'new'}`}
          onSubmit={submitPlan}
        >
          <label>
            Dinner
            <input
              defaultValue={selectedDinner?.mealName ?? ''}
              maxLength={160}
              name="mealName"
              required
            />
          </label>
          <label>
            Saved family meal
            <select defaultValue={selectedDinner?.savedMealId ?? ''} name="savedMealId">
              <option value="">Custom meal</option>
              {plan.data.savedMeals.map((meal) => (
                <option key={meal.id} value={meal.id}>
                  {meal.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Note
            <input
              defaultValue={selectedDinner?.note ?? ''}
              maxLength={240}
              name="note"
              placeholder="e.g. Prep at 5:30"
            />
          </label>
          {savePlan.isError ? (
            <p className="admin-feedback admin-feedback--error" role="alert">
              {savePlan.error.message}
            </p>
          ) : null}
          {savePlan.isSuccess ? (
            <p className="save-confirmation" role="status">
              Dinner saved.
            </p>
          ) : null}
          <button className="admin-submit" disabled={savePlan.isPending} type="submit">
            {savePlan.isPending ? 'Saving…' : 'Save dinner'}
          </button>
        </form>
        <form className="saved-meal-add" onSubmit={submitSavedMeal}>
          <label>
            Save another family meal
            <input maxLength={140} name="savedMealName" placeholder="Meal name" required />
          </label>
          <button disabled={saveMeal.isPending} type="submit">
            <Icon name="plus" /> Save meal
          </button>
        </form>
        {saveMeal.isError ? (
          <p className="admin-feedback admin-feedback--error" role="alert">
            {saveMeal.error.message}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function addDays(localDate: string, amount: number): string {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
