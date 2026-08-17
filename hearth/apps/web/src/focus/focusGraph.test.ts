import { describe, expect, it, vi } from 'vitest';

import { FocusMemory, focusById, focusIsWithin, nextFocusId } from './focusGraph';

describe('focus graph', () => {
  it('moves only to the explicit directional neighbour', () => {
    const button = document.createElement('button');
    button.dataset.focusRight = 'next-action';
    document.body.append(button);
    expect(nextFocusId(button, 'right')).toBe('next-action');
    expect(nextFocusId(button, 'left')).toBeNull();
    button.remove();
  });

  it('focuses a named control deterministically', () => {
    document.body.innerHTML = '<button data-focus-id="chore-one">Complete</button>';
    expect(focusById('chore-one')).toBe(true);
    expect(document.activeElement).toHaveAttribute('data-focus-id', 'chore-one');
  });

  it('can focus a phone entry control without shifting the initial viewport', () => {
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    document.body.innerHTML = '<button data-focus-id="phone-entry">Open</button>';
    expect(focusById('phone-entry', { scroll: false })).toBe(true);
    expect(document.activeElement).toHaveAttribute('data-focus-id', 'phone-entry');
    expect(scrollIntoView).not.toHaveBeenCalled();
    scrollIntoView.mockRestore();
  });

  it('focuses the meaningful entry control without depending on demo identifiers', () => {
    document.body.innerHTML = `
      <main id="main-content">
        <button data-focus-id="first-control">First</button>
        <button data-focus-entry="true" data-focus-id="current-action">Current action</button>
      </main>
    `;
    expect(focusById('screen-entry')).toBe(true);
    expect(document.activeElement).toHaveAttribute('data-focus-id', 'current-action');
  });

  it('restores the last focus for each route after Back', () => {
    const memory = new FocusMemory();
    memory.remember('/week', 'week-event-dentist');
    memory.remember('/chores', 'chore-school-bag');
    expect(memory.recall('/week', 'week-first')).toBe('week-event-dentist');
    expect(memory.recall('/today', 'today-first')).toBe('today-first');
  });

  it('recognises an explicit form-field focus inside the current screen', () => {
    document.body.innerHTML = `
      <main id="main-content"><input aria-label="Chosen field" /></main>
      <button data-focus-id="nav-admin">Admin</button>
    `;
    const content = document.querySelector('#main-content');
    const input = document.querySelector('input');
    expect(input).not.toBeNull();

    input!.focus();
    expect(focusIsWithin(content)).toBe(true);

    document.querySelector<HTMLElement>('[data-focus-id="nav-admin"]')!.focus();
    expect(focusIsWithin(content)).toBe(false);
  });
});
