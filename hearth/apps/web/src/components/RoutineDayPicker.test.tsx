import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RoutineDayPicker } from './RoutineDayPicker';

afterEach(cleanup);

describe('RoutineDayPicker', () => {
  it('shows the saved days and submits newly selected days', () => {
    const submit = vi.fn<(days: string[]) => void>();
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(new FormData(event.currentTarget).getAll('repeatDays').map(String));
        }}
      >
        <RoutineDayPicker initialDays={['MO', 'TH']} />
        <button type="submit">Save</button>
      </form>,
    );

    expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Thursday' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Tuesday' })).not.toBeChecked();

    const tuesday = screen.getByRole('checkbox', { name: 'Tuesday' });
    fireEvent.click(tuesday);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(tuesday).toBeChecked();
    expect(tuesday.closest('label')).toHaveClass('routine-days__option--selected');
    expect(submit).toHaveBeenCalledWith(['MO', 'TU', 'TH']);
  });

  it('keeps at least one day selected', () => {
    render(<RoutineDayPicker initialDays={['SA']} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Saturday' }));

    expect(screen.getByRole('checkbox', { name: 'Saturday' })).toBeChecked();
  });
});
