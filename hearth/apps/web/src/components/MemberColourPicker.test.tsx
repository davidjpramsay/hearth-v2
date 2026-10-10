import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MemberColourPicker } from './MemberColourPicker';
import { DEFAULT_MEMBER_COLOUR, MEMBER_COLOUR_OPTIONS } from './memberColours';

afterEach(cleanup);

describe('MemberColourPicker', () => {
  it('starts collapsed with the current named colour and still submits its value', () => {
    const { container } = render(
      <form>
        <MemberColourPicker defaultValue="#1668b7" />
      </form>,
    );
    expect(container.querySelector('details')).not.toHaveAttribute('open');
    expect(container.querySelector('summary')).toHaveTextContent('Colour');
    expect(container.querySelector('summary')).toHaveTextContent('Sky');
    expect(new FormData(container.querySelector('form')!).get('color')).toBe('#1668b7');
  });

  it('offers exactly twelve named curated colours', () => {
    const { container } = render(<MemberColourPicker defaultValue="#1668b7" />);
    fireEvent.click(container.querySelector('summary')!);

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
    const { container } = render(
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

    fireEvent.click(container.querySelector('summary')!);
    fireEvent.click(screen.getByRole('radio', { name: 'Berry' }));
    expect(container.querySelector('summary')).toHaveTextContent('Berry');
    fireEvent.click(container.querySelector('summary')!);
    expect(container.querySelector('details')).not.toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('radio', { name: 'Berry', hidden: true })).toBeChecked();
    expect(submittedColor).toBe('#a54f6f');
  });

  it('falls back to Sage for an unsupported legacy value', () => {
    const { container } = render(<MemberColourPicker defaultValue="#ffffff" />);
    expect(container.querySelector('summary')).toHaveTextContent('Sage');
    fireEvent.click(container.querySelector('summary')!);

    expect(screen.getByRole('radio', { name: 'Sage' })).toBeChecked();
  });

  it('restores the preview and native form value on reset', () => {
    const { container } = render(
      <form>
        <MemberColourPicker defaultValue="#1668b7" />
      </form>,
    );
    fireEvent.click(container.querySelector('summary')!);
    fireEvent.click(screen.getByRole('radio', { name: 'Berry' }));
    expect(container.querySelector('summary')).toHaveTextContent('Berry');
    const form = container.querySelector('form')!;
    act(() => form.reset());
    expect(container.querySelector('summary')).toHaveTextContent('Sky');
    expect(screen.getByRole('radio', { name: 'Sky' })).toBeChecked();
    expect(new FormData(form).get('color')).toBe('#1668b7');
  });

  it('keeps each person’s disclosure and colour selection independent', () => {
    const { container } = render(
      <>
        <form data-testid="first-person">
          <MemberColourPicker defaultValue="#1668b7" />
        </form>
        <form data-testid="second-person">
          <MemberColourPicker defaultValue="#2f7c76" />
        </form>
      </>,
    );
    const first = screen.getByTestId('first-person');
    const second = screen.getByTestId('second-person');
    fireEvent.click(first.querySelector('summary')!);
    fireEvent.click(within(first).getByRole('radio', { name: 'Berry' }));
    expect(first.querySelector('summary')).toHaveTextContent('Berry');
    expect(second.querySelector('summary')).toHaveTextContent('Lagoon');
    expect(second.querySelector('details')).not.toHaveAttribute('open');
    expect(container.querySelectorAll('details[open]')).toHaveLength(1);
    expect(new FormData(second as HTMLFormElement).get('color')).toBe('#2f7c76');
  });

  it('normalizes an uppercase legacy colour in the compact preview', () => {
    const { container } = render(<MemberColourPicker defaultValue="#1668B7" />);
    expect(container.querySelector('summary')).toHaveTextContent('Sky');
    expect(container.querySelector('.member-colour-disclosure__swatch')).toHaveStyle(
      '--member-colour: #1668b7',
    );
  });

  it('keeps an editing draft consistent through refreshed defaults and uses them on reset', () => {
    const { container, rerender } = render(
      <form>
        <MemberColourPicker defaultValue="#1668b7" />
      </form>,
    );
    fireEvent.click(container.querySelector('summary')!);
    fireEvent.click(screen.getByRole('radio', { name: 'Berry' }));
    rerender(
      <form>
        <MemberColourPicker defaultValue="#287e9a" />
      </form>,
    );
    const form = container.querySelector('form')!;
    expect(container.querySelector('summary')).toHaveTextContent('Berry');
    expect(screen.getByRole('radio', { name: 'Berry' })).toBeChecked();
    expect(new FormData(form).get('color')).toBe('#a54f6f');
    act(() => form.reset());
    expect(container.querySelector('summary')).toHaveTextContent('Ocean');
    expect(screen.getByRole('radio', { name: 'Ocean' })).toBeChecked();
    expect(new FormData(form).get('color')).toBe('#287e9a');
  });
});
