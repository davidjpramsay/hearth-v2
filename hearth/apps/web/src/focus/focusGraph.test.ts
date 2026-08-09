import { describe, expect, it } from 'vitest';

import { FocusMemory, focusById, nextFocusId } from './focusGraph';

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
});
