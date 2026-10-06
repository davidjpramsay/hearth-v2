import type { KeyboardEvent } from 'react';

import { modalTabTarget, nextSpatialTarget, type FocusDirection } from '../focus/focusGraph';

const directions: Partial<Record<string, FocusDirection>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

// The signed-out connection flow appears before the main app's remote handler mounts.
export function connectionNavigation(
  event: Pick<
    KeyboardEvent<HTMLElement>,
    'key' | 'defaultPrevented' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'preventDefault'
  > & { target: EventTarget | null },
): void {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const active = event.target;
  if (!(active instanceof HTMLElement)) return;
  if (event.key === 'Tab') {
    const target = modalTabTarget(active, event.shiftKey);
    if (target !== null) {
      event.preventDefault();
      target.focus();
    }
    return;
  }
  const direction = directions[event.key];
  if (
    direction === undefined ||
    active.matches('input, textarea, select') ||
    active.isContentEditable
  )
    return;
  const target = nextSpatialTarget(active, direction);
  if (target !== null) {
    event.preventDefault();
    target.focus();
  }
}
