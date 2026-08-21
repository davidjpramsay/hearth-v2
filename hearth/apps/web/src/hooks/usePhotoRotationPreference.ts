import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let rotationPaused = false;

export function usePhotoRotationPreference(): {
  rotationPaused: boolean;
  togglePhotoRotation: () => void;
} {
  return {
    rotationPaused: useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot),
    togglePhotoRotation,
  };
}

export function setPhotoRotationPaused(paused: boolean): void {
  if (rotationPaused === paused) return;
  rotationPaused = paused;
  listeners.forEach((listener) => listener());
}

export function togglePhotoRotation(): void {
  setPhotoRotationPaused(!rotationPaused);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  return rotationPaused;
}

function getServerSnapshot(): boolean {
  return false;
}
