import { useState } from 'react';
import { Link } from 'react-router-dom';

import './MealsScreen.css';

import type { DemoScenario } from '@hearth/shared';

import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { FailureState, LoadingState } from '../components/Status';
import { useMealPlanQuery } from '../hooks/useMealQueries';
import { useHearthRuntime } from '../runtime/context';

export function MealsScreen({
  scenario: _scenario,
  preparing,
}: {
  scenario: DemoScenario | 'offline';
  preparing: boolean;
}) {
  const { weekStart } = useHearthRuntime();
  const [startDate, setStartDate] = useState(() => weekStart);
  const [selectedDate, setSelectedDate] = useState(() => weekStart);
  const plan = useMealPlanQuery(startDate, !preparing);

  if (preparing || plan.isPending) return <LoadingState />;
  if (plan.data === undefined) return <FailureState onRetry={() => void plan.refetch()} />;
  const selectedDay =
    plan.data.days.find((day) => day.localDate === selectedDate) ?? plan.data.days[0];
  const today = plan.data.days.find((day) => day.isToday) ?? plan.data.days[0];
  const tonight = today?.entries.find((entry) => entry.slot === 'dinner') ?? null;
  const favouriteCount = plan.data.savedMeals.filter((meal) => meal.favourite).length;

  return (
    <div className="screen meals-screen">
      <ScreenHeader
        actions={
          <Link className="meals-manage-link" to="/admin/meals">
            Manage meals
          </Link>
        }
        title="Meals"
        meta={plan.data.displayRange}
      />
      <section className="tonight-band" aria-labelledby="tonight-heading">
        <Icon name="meal" />
        <div>
          <p>Tonight</p>
          <h2 id="tonight-heading">{tonight?.mealName ?? 'Nothing planned yet'}</h2>
          {tonight?.note === undefined || tonight.note === null ? null : (
            <span>{tonight.note}</span>
          )}
        </div>
      </section>
      <div className="meal-week" aria-label={plan.data.displayRange}>
        {plan.data.days.map((day, index, days) => {
          const dinner = day.entries.find((entry) => entry.slot === 'dinner');
          return (
            <button
              aria-current={day.localDate === selectedDay?.localDate ? 'date' : undefined}
              className={`meal-day focusable${day.localDate === selectedDay?.localDate ? ' meal-day--selected' : ''}`}
              data-focus-entry={day.isToday ? 'true' : undefined}
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
        <Link
          className="meal-action focusable"
          data-focus-id="meal-saved"
          data-focus-left="nav-meals"
          data-focus-up={`meal-day-${selectedDay?.localDate ?? weekStart}`}
          to="/admin/meals#saved-meals"
        >
          <Icon name="star" />
          <span>
            <strong>Saved family meals</strong>
            <small>{favouriteCount} favourites</small>
          </span>
          <Icon name="chevron-right" />
        </Link>
        <Link
          className="meal-action focusable"
          data-focus-id="meal-plan-phone"
          data-focus-up={`meal-day-${selectedDay?.localDate ?? weekStart}`}
          to="/admin/meals"
        >
          <Icon name="calendar" />
          <span>
            <strong>Plan meals</strong>
          </span>
          <Icon name="chevron-right" />
        </Link>
      </div>
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
    </div>
  );
}

function addDays(localDate: string, amount: number): string {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
