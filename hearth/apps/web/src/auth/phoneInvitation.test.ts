import { describe, expect, it } from 'vitest';
import { privatePhoneIntentFromHash, stripPhoneIntentFragment } from './phoneInvitation';
describe('private phone card fragments', () => {
  it('keeps setup and recovery purposes separate', () => {
    expect(privatePhoneIntentFromHash(`#setup-phone=${'a'.repeat(64)}`)?.purpose).toBe('setup');
    expect(privatePhoneIntentFromHash(`#recover-phone=${'A'.repeat(43)}`)?.purpose).toBe(
      'recovery',
    );
    expect(privatePhoneIntentFromHash(`#recover-phone=${'a'.repeat(64)}`)).toBeNull();
    expect(privatePhoneIntentFromHash(`#replace-owner=${'a'.repeat(64)}`)?.purpose).toBe(
      'owner-replacement',
    );
  });
  it('rejects query parameters, added destinations and oversized proof', () => {
    for (const text of [
      `?recover-phone=${'A'.repeat(43)}`,
      `#setup-phone=${'a'.repeat(64)}&owner=true`,
      `#setup-phone=${'a'.repeat(200)}`,
    ])
      expect(privatePhoneIntentFromHash(text)).toBeNull();
  });
  it('strips even malformed sensitive fragments without changing route or query', () => {
    window.history.replaceState(null, '', '/today?view=safe#recover-phone=invalid');
    stripPhoneIntentFragment();
    expect(window.location.hash).toBe('');
    expect(window.location.pathname + window.location.search).toBe('/today?view=safe');
  });
});
