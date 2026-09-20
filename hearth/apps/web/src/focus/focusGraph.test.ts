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
  it('leaves a wide chart horizontally instead of jumping to controls above it', () => {
    document.body.innerHTML =
      '<aside><button>Nav</button></aside><main><button>Mode</button><button>Chart</button></main>';
    const [nav, mode, chart] = [...document.querySelectorAll('button')];
    rectangle(nav!, 0, 400);
    rectangle(mode!, 400, 150);
    rectangle(chart!, 200, 300);
    vi.mocked(chart!.getBoundingClientRect).mockReturnValue({
      x: 200,
      y: 300,
      left: 200,
      right: 1200,
      top: 300,
      bottom: 550,
      width: 1000,
      height: 250,
      toJSON: () => ({}),
    });
    expect(nextSpatialTarget(chart!, 'left')).toBe(nav);
  });
  it('crosses nearby calendar columns before jumping into the navigation rail', () => {
    document.body.innerHTML =
      '<aside><button>Nav</button></aside><main><button>Early</button><button>Overnight</button></main>';
    const [nav, early, overnight] = [...document.querySelectorAll('button')];
    rectangle(nav!, 0, 100);
    rectangle(early!, 200, 150);
    rectangle(overnight!, 320, 100);
    expect(nextSpatialTarget(overnight!, 'left')).toBe(early);
    expect(nextSpatialTarget(early!, 'left')).toBe(nav);
  });
  it('does not treat a barely overlapping header action as a same-row neighbour', () => {
    document.body.innerHTML = '<button>A</button><button>B</button><button>C</button>';
    const [a, b, c] = [...document.querySelectorAll('button')];
    rectangle(a!, 500, 100);
    rectangle(b!, 350, 62);
    rectangle(c!, 200, 100);
    expect(nextSpatialTarget(a!, 'left')).toBe(c);
  });
  it('continues through content below a fixed phone bar before leaving the main region', () => {
    document.body.innerHTML =
      '<main><button>A</button><button>B</button></main><nav><button>C</button></nav>';
    const [a, b, c] = [...document.querySelectorAll('button')];
    rectangle(a!, 0, 200);
    rectangle(b!, 0, 900);
    rectangle(c!, 0, 750);
    expect(nextSpatialTarget(a!, 'down')).toBe(b);
    rectangle(c!, 0, 1100);
    expect(nextSpatialTarget(b!, 'down')).toBe(c);
  });
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
