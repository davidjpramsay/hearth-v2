import { describe, expect, it, vi } from 'vitest';

import {
  FocusMemory,
  focusById,
  focusIsWithin,
  nextFocusId,
  nextSpatialTarget,
} from './focusGraph';

function rectangle(element: HTMLElement, x: number, y: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x,
    y,
    left: x,
    top: y,
    right: x + 100,
    bottom: y + 40,
    width: 100,
    height: 40,
    toJSON: () => ({}),
  });
}

describe('focus graph', () => {
  it('keeps vertical sidebar movement inside the sidebar', () => {
    document.body.innerHTML =
      '<aside><button>A</button><button>B</button></aside><main><button>C</button></main>';
    const [a, b, c] = [...document.querySelectorAll('button')];
    rectangle(a!, 0, 100);
    rectangle(b!, 0, 180);
    rectangle(c!, 150, 30);
    expect(nextSpatialTarget(a!, 'up')).toBeNull();
    expect(nextSpatialTarget(a!, 'down')).toBe(b);
    expect(nextSpatialTarget(a!, 'right')).toBe(c);
  });
  it('ignores tiny focus-scale offsets and prefers the control directly below', () => {
    document.body.innerHTML = '<button>A</button><button>B</button><button>C</button>';
    const [a, b, c] = [...document.querySelectorAll('button')];
    rectangle(a!, 0, 0);
    rectangle(b!, 110, 3);
    rectangle(c!, 0, 250);
    expect(nextSpatialTarget(a!, 'down')).toBe(c);
  });

  it('keeps horizontal movement in its row before taking a diagonal shortcut', () => {
    document.body.innerHTML = '<button>A</button><button>B</button><button>C</button>';
    const [a, b, c] = [...document.querySelectorAll('button')];
    rectangle(a!, 500, 500);
    rectangle(b!, 350, 420);
    rectangle(c!, 0, 500);
    expect(nextSpatialTarget(a!, 'left')).toBe(c);
  });
  it('follows rendered columns instead of stale hand-written directions', () => {
    document.body.innerHTML =
      '<button id="a" data-focus-down="b">A</button><button id="b">B</button><button id="c">C</button>';
    const [a, b, c] = [...document.querySelectorAll('button')];
    rectangle(a!, 0, 0);
    rectangle(b!, 150, 0);
    rectangle(c!, 0, 80);
    expect(nextSpatialTarget(a!, 'right')).toBe(b);
    expect(nextSpatialTarget(a!, 'down')).toBe(c);
    expect(nextSpatialTarget(a!, 'left')).toBeNull();
    rectangle(b!, 0, 160);
    expect(nextSpatialTarget(c!, 'down')).toBe(b);
  });

  it('includes unannotated controls and excludes disabled, hidden and inert ones', () => {
    document.body.innerHTML =
      '<button>A</button><button disabled>B</button><button hidden>C</button><div inert><button>D</button></div><button>E</button>';
    const buttons = [...document.querySelectorAll('button')];
    buttons.forEach((button, i) => rectangle(button, i * 120, 0));
    expect(nextSpatialTarget(buttons[0]!, 'right')).toBe(buttons[4]);
  });

  it('does not leave a modal through arrow navigation', () => {
    document.body.innerHTML =
      '<div role="dialog" aria-modal="true"><button>Close</button></div><button>Outside</button>';
    const buttons = [...document.querySelectorAll('button')];
    buttons.forEach((button, i) => rectangle(button, i * 120, 0));
    expect(nextSpatialTarget(buttons[0]!, 'right')).toBeNull();
  });
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
