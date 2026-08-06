export type FocusDirection = 'up' | 'down' | 'left' | 'right';

const attributeByDirection: Record<FocusDirection, keyof DOMStringMap> = {
  up: 'focusUp',
  down: 'focusDown',
  left: 'focusLeft',
  right: 'focusRight',
};

export function nextFocusId(element: HTMLElement, direction: FocusDirection): string | null {
  return element.dataset[attributeByDirection[direction]] ?? null;
}

export function focusById(id: string | null): boolean {
  if (id === null) return false;
  const target = document.querySelector<HTMLElement>(`[data-focus-id="${CSS.escape(id)}"]`);
  if (target === null || target.getAttribute('aria-disabled') === 'true') return false;
  target.focus({ preventScroll: true });
  target.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
    behavior: reducedMotion() ? 'auto' : 'smooth',
  });
  return true;
}

export class FocusMemory {
  private readonly routes = new Map<string, string>();

  remember(route: string, focusId: string | undefined): void {
    if (focusId !== undefined) this.routes.set(route, focusId);
  }

  recall(route: string, fallback: string): string {
    return this.routes.get(route) ?? fallback;
  }
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
