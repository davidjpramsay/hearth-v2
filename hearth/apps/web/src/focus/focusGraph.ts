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

const controls = 'a[href], button, input, select, textarea, summary, [tabindex]';

export function modalTabTarget(element: HTMLElement, backwards: boolean): HTMLElement | null {
  const modal = element.closest('[aria-modal="true"], dialog[open]');
  if (modal === null) return null;
  const targets = [...modal.querySelectorAll<HTMLElement>(controls)].filter(
    (target) =>
      canFocus(target) && target.tabIndex >= 0 && target.getBoundingClientRect().height > 0,
  );
  if (backwards && element === targets[0]) return targets.at(-1) ?? null;
  if (!backwards && element === targets.at(-1)) return targets[0] ?? null;
  return null;
}

/** Resolve against the current layout, including responsive reflow and optional controls. */
export function nextSpatialTarget(
  element: HTMLElement,
  direction: FocusDirection,
): HTMLElement | null {
  const modal = element.closest('[aria-modal="true"], dialog[open]');
  const tvRail =
    modal === null && (direction === 'up' || direction === 'down')
      ? element.closest('.tv-rail')
      : null;
  if (tvRail !== null) {
    // This rail is one ordered column. Clipped navigation rows can overlap
    // the fixed footer geometrically; they must not be skipped for Appearance.
    const targets = [...tvRail.querySelectorAll<HTMLElement>(controls)].filter((target) => {
      const rect = target.getBoundingClientRect();
      return canFocus(target) && target.tabIndex >= 0 && rect.width > 0 && rect.height > 0;
    });
    const index = targets.indexOf(element);
    return index < 0 ? null : (targets[index + (direction === 'up' ? -1 : 1)] ?? null);
  }
  const rail = direction === 'up' || direction === 'down' ? element.closest('aside') : null;
  const scope = modal ?? rail ?? document;
  const origin = element.getBoundingClientRect();
  const horizontal = direction === 'left' || direction === 'right';
  const content = element.closest('main');
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  const originMain = horizontal
    ? (origin.left + origin.right) / 2
    : (origin.top + origin.bottom) / 2;
  const originCross = horizontal
    ? (origin.top + origin.bottom) / 2
    : (origin.left + origin.right) / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  let bestInBeam = false;
  let bestInContent = false;
  for (const candidate of scope.querySelectorAll<HTMLElement>(controls)) {
    if (candidate === element || !canFocus(candidate) || candidate.tabIndex < 0) continue;
    const rect = candidate.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const main = horizontal ? (rect.left + rect.right) / 2 : (rect.top + rect.bottom) / 2;
    const forward = (main - originMain) * sign;
    // Focus rings can scale a button by a few pixels. That must not make a
    // same-row neighbour look like a Down target (or vice versa).
    const axisSize = horizontal
      ? Math.min(origin.width, rect.width)
      : Math.min(origin.height, rect.height);
    if (forward <= Math.max(1, axisSize / 2)) continue;
    const cross = horizontal ? (rect.top + rect.bottom) / 2 : (rect.left + rect.right) / 2;
    const crossGap = horizontal
      ? Math.max(0, origin.top - rect.bottom, rect.top - origin.bottom)
      : Math.max(0, origin.left - rect.right, rect.left - origin.right);
    const mainGap = horizontal
      ? sign > 0
        ? rect.left - origin.right
        : origin.left - rect.right
      : sign > 0
        ? rect.top - origin.bottom
        : origin.top - rect.bottom;
    const score = Math.max(0, mainGap) + crossGap * 4 + Math.abs(cross - originCross) * 0.25;
    const crossOverlap = horizontal
      ? Math.min(origin.bottom, rect.bottom) - Math.max(origin.top, rect.top)
      : Math.min(origin.right, rect.right) - Math.max(origin.left, rect.left);
    const crossSize = horizontal
      ? Math.min(origin.height, rect.height)
      : Math.min(origin.width, rect.width);
    const inBeam = crossOverlap >= crossSize / 2;
    // Navigation must not intercept movement between adjacent content columns
    // or to content below the fold. Fall back at the edge of the content.
    const inContent =
      (content?.contains(candidate) ?? false) && (!horizontal || mainGap >= -axisSize / 2);
    if (
      (inContent && !bestInContent) ||
      (inContent === bestInContent &&
        ((inBeam && !bestInBeam) || (inBeam === bestInBeam && score < bestScore)))
    ) {
      best = candidate;
      bestScore = score;
      bestInBeam = inBeam;
      bestInContent = inContent;
    }
  }
  return best;
}

function canFocus(target: HTMLElement): boolean {
  // Guarded busy rows stay focusable while a save is pending; disabling the
  // native button would blur it and interrupt remote check/undo navigation.
  if (
    target.matches(':disabled') ||
    (target.matches('[aria-disabled="true"]') && !target.matches('[aria-busy="true"]')) ||
    target.closest('[hidden], [inert], [aria-hidden="true"]') !== null
  )
    return false;
  // Suspense can retain the outgoing screen under a display:none ancestor.
  // Its old focus is not usable, even if the control itself is still styled normally.
  for (
    let ancestor: HTMLElement | null = target;
    ancestor !== null;
    ancestor = ancestor.parentElement
  ) {
    const style = getComputedStyle(ancestor);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

export function focusControl(target: HTMLElement, options: { scroll?: boolean } = {}): boolean {
  if (!canFocus(target)) return false;
  target.focus({ preventScroll: true });
  if (document.activeElement !== target) return false;
  if (options.scroll ?? true)
    target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  return true;
}

export function focusById(id: string | null, options: { scroll?: boolean } = {}): boolean {
  if (id === null) return false;
  const target =
    id === 'screen-entry'
      ? (document.querySelector<HTMLElement>('#main-content [data-focus-entry="true"]') ??
        document.querySelector<HTMLElement>('#main-content [data-focus-id]'))
      : document.querySelector<HTMLElement>(`[data-focus-id="${CSS.escape(id)}"]`);
  // Keep transient loading chrome keyboard-accessible, but wait for the real
  // screen entry before choosing focus automatically. Explicit D-pad/Tab focus
  // still uses focusControl and remains available while the content arrives.
  return (
    target !== null &&
    target.closest('[data-focus-loading="true"]') === null &&
    focusControl(target, options)
  );
}

export function focusIsWithin(container: Element | null): boolean {
  return container !== null && document.activeElement instanceof HTMLElement
    ? container.contains(document.activeElement) && canFocus(document.activeElement)
    : false;
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
