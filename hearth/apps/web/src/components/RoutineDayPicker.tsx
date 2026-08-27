import { useState } from 'react';

const routineDayOptions = [
  ['MO', 'Monday'],
  ['TU', 'Tuesday'],
  ['WE', 'Wednesday'],
  ['TH', 'Thursday'],
  ['FR', 'Friday'],
  ['SA', 'Saturday'],
  ['SU', 'Sunday'],
] as const;

type RoutineDay = (typeof routineDayOptions)[number][0];

export function RoutineDayPicker({ initialDays }: { initialDays: readonly string[] }) {
  const [selectedDays, setSelectedDays] = useState<RoutineDay[]>(() =>
    routineDayOptions.map(([value]) => value).filter((value) => initialDays.includes(value)),
  );

  return (
    <fieldset className="routine-days">
      <legend>Repeat on</legend>
      <p>Select each day.</p>
      {routineDayOptions.map(([value, label]) => {
        const checked = selectedDays.includes(value);
        return (
          <label className={checked ? 'routine-days__option--selected' : undefined} key={value}>
            <input
              aria-label={label}
              checked={checked}
              name="repeatDays"
              onChange={(event) => {
                const checkedNow = event.currentTarget.checked;
                setSelectedDays((current) => {
                  if (checkedNow) return current.includes(value) ? current : [...current, value];
                  return current.length === 1 ? current : current.filter((day) => day !== value);
                });
              }}
              type="checkbox"
              value={value}
            />
            {label.slice(0, 2)}
            <span className="sr-only">{label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
