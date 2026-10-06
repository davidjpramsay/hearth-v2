import { useEffect, useRef } from 'react';

const drafts = new Set<symbol>();

export function hasUnsavedChanges(): boolean {
  return drafts.size > 0;
}

export function useUnsavedChanges(dirty: boolean): void {
  const identity = useRef(Symbol('draft'));
  useEffect(() => {
    const id = identity.current;
    if (!dirty) return;
    drafts.add(id);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      drafts.delete(id);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [dirty]);
}

export function confirmDiscardChanges(dirty: boolean): boolean {
  return !dirty || window.confirm('Discard unsaved changes?');
}
