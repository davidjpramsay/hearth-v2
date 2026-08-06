import { parseAppearancePreferences, resolveTheme, type AppearancePreferences } from './appearance';
import { describe, expect, it } from 'vitest';

describe('appearance preferences', () => {
  it('uses safe defaults for missing or malformed storage', () => {
    const defaults: AppearancePreferences = { theme: 'automatic', eveningDimming: false };
    expect(parseAppearancePreferences(null)).toEqual(defaults);
    expect(parseAppearancePreferences('{not json')).toEqual(defaults);
    expect(parseAppearancePreferences(JSON.stringify({ theme: 'midnight' }))).toEqual(defaults);
  });

  it('preserves valid fields while defaulting invalid optional fields', () => {
    expect(
      parseAppearancePreferences(
        JSON.stringify({ theme: 'dark', eveningDimming: true, ignored: 'value' }),
      ),
    ).toEqual({ theme: 'dark', eveningDimming: true });
    expect(
      parseAppearancePreferences(JSON.stringify({ theme: 'light', eveningDimming: 1 })),
    ).toEqual({ theme: 'light', eveningDimming: false });
  });

  it('resolves automatic from the device and leaves explicit choices unchanged', () => {
    expect(resolveTheme('automatic', true)).toBe('dark');
    expect(resolveTheme('automatic', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
});
