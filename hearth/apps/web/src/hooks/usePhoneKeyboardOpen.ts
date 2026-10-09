import { useEffect, useState } from 'react';

import { COMPANION_QUERY } from '../layout/viewportQueries';

const nonKeyboardInputTypes = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

function hasEditingFocus(): boolean {
  const active = document.activeElement;
  return (
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement && !nonKeyboardInputTypes.has(active.type)) ||
    (active instanceof HTMLElement && active.isContentEditable === true)
  );
}

export function usePhoneKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const companion = window.matchMedia(COMPANION_QUERY);
    let frame: number | undefined;
    const update = () => {
      frame = undefined;
      // iOS shrinks the visual viewport for the keyboard but retains the layout viewport.
      // Ignore pinch zoom and ordinary browser-toolbar changes.
      const occludedHeight =
        Math.max(window.innerHeight, document.documentElement.clientHeight) - viewport.height;
      setOpen(
        companion.matches &&
          Math.abs(viewport.scale - 1) < 0.01 &&
          hasEditingFocus() &&
          occludedHeight > 150,
      );
    };
    const schedule = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(update);
    };
    update();
    viewport.addEventListener('resize', schedule);
    window.addEventListener('resize', schedule);
    companion.addEventListener('change', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', schedule);
      window.removeEventListener('resize', schedule);
      companion.removeEventListener('change', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
    };
  }, []);

  return open;
}
