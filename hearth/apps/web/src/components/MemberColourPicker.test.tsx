import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MemberColourPicker } from './MemberColourPicker';
import { DEFAULT_MEMBER_COLOUR, MEMBER_COLOUR_OPTIONS } from './memberColours';

afterEach(cleanup);

describe('MemberColourPicker', () => {
  it('offers exactly twelve named curated colours', () => {
    render(<MemberColourPicker defaultValue="#1668b7" />);

    expect(screen.getAllByRole('radio')).toHaveLength(12);
    expect(MEMBER_COLOUR_OPTIONS.map((option) => option.name)).toEqual([
      'Sky',
      'Ocean',
      'Lagoon',
      'Eucalyptus',
      'Sage',
      'Ochre',
      'Clay',
      'Brick',
      'Berry',
      'Plum',
      'Indigo',
      'Slate',
    ]);
    expect(screen.getByRole('radio', { name: 'Sky' })).toBeChecked();
  });

  it('submits the selected colour through the existing member contract', () => {
    let submittedColor: FormDataEntryValue | null = null;
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submittedColor = new FormData(event.currentTarget).get('color');
        }}
      >
        <MemberColourPicker defaultValue={DEFAULT_MEMBER_COLOUR} />
        <button type="submit">Save</button>
      </form>,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Berry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('radio', { name: 'Berry' })).toBeChecked();
    expect(submittedColor).toBe('#a54f6f');
  });

  it('falls back to Sage for an unsupported legacy value', () => {
    render(<MemberColourPicker defaultValue="#ffffff" />);

    expect(screen.getByRole('radio', { name: 'Sage' })).toBeChecked();
  });
});
