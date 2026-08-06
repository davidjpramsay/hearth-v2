import { useSyncExternalStore } from 'react';

export const APPEARANCE_STORAGE_KEY = 'hearth.appearance.v1';

export type ThemePreference = 'light' | 'dark' | 'automatic';
export type ResolvedTheme = 'light' | 'dark';

export interface AppearancePreferences {
  theme: ThemePreference;
  eveningDimming: boolean;
}

export interface AppearanceSnapshot {
  preferences: AppearancePreferences;
  resolvedTheme: ResolvedTheme;
}

const DEFAULT_PREFERENCES: AppearancePreferences = {
  theme: 'automatic',
  eveningDimming: false,
};
const SERVER_SNAPSHOT: AppearanceSnapshot = {
  preferences: DEFAULT_PREFERENCES,
  resolvedTheme: 'light',
};

const listeners = new Set<() => void>();
let mediaQuery: MediaQueryList | null = null;
let initialized = false;
let preferences = DEFAULT_PREFERENCES;
let snapshot: AppearanceSnapshot = {
  preferences,
  resolvedTheme: 'light',
};

export function parseAppearancePreferences(value: string | null): AppearancePreferences {
  if (value === null) return DEFAULT_PREFERENCES;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFERENCES;
    const candidate = parsed as Record<string, unknown>;
    const theme = isThemePreference(candidate.theme) ? candidate.theme : DEFAULT_PREFERENCES.theme;
    return {
      theme,
      eveningDimming:
        typeof candidate.eveningDimming === 'boolean'
          ? candidate.eveningDimming
          : DEFAULT_PREFERENCES.eveningDimming,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'automatic') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

export function initializeAppearance(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  preferences = readPreferences();
  refreshSnapshot();
  mediaQuery.addEventListener('change', handleSystemThemeChange);
  window.addEventListener('storage', handleStorageChange);
}

export function useAppearance(): AppearanceSnapshot & {
  setTheme: (theme: ThemePreference) => void;
  setEveningDimming: (enabled: boolean) => void;
} {
  initializeAppearance();
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    ...current,
    setTheme,
    setEveningDimming,
  };
}

export function setTheme(theme: ThemePreference): void {
  updatePreferences({ ...preferences, theme });
}

export function setEveningDimming(enabled: boolean): void {
  updatePreferences({ ...preferences, eveningDimming: enabled });
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'automatic';
}

function readPreferences(): AppearancePreferences {
  try {
    return parseAppearancePreferences(window.localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function updatePreferences(next: AppearancePreferences): void {
  preferences = next;
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A private or storage-restricted browser can still use the preference for this session.
  }
  refreshSnapshot();
  listeners.forEach((listener) => listener());
}

function refreshSnapshot(): void {
  const resolvedTheme = resolveTheme(preferences.theme, mediaQuery?.matches ?? false);
  snapshot = { preferences, resolvedTheme };
  applyAppearance(snapshot);
}

function applyAppearance(current: AppearanceSnapshot): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = current.resolvedTheme;
  root.dataset.themePreference = current.preferences.theme;
  root.dataset.eveningDim = String(current.preferences.eveningDimming);
  root.style.colorScheme = current.resolvedTheme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  meta?.setAttribute('content', current.resolvedTheme === 'dark' ? '#151a18' : '#f8f6f0');
}

function handleSystemThemeChange(): void {
  if (preferences.theme !== 'automatic') return;
  refreshSnapshot();
  listeners.forEach((listener) => listener());
}

function handleStorageChange(event: StorageEvent): void {
  if (event.key !== APPEARANCE_STORAGE_KEY) return;
  preferences = parseAppearancePreferences(event.newValue);
  refreshSnapshot();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AppearanceSnapshot {
  return snapshot;
}

function getServerSnapshot(): AppearanceSnapshot {
  return SERVER_SNAPSHOT;
}
