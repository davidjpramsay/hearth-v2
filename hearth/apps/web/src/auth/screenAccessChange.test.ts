import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyScreenAccessChange, subscribeScreenAccessChange } from './screenAccessChange';

beforeEach(() => {
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => entries.set(key, value)),
    removeItem: vi.fn((key: string) => entries.delete(key)),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('negative-only cross-document screen handoff', () => {
  it('handles only matching storage notices and cleans up without retaining a role flag', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const changed = vi.fn();
    const unsubscribe = subscribeScreenAccessChange(changed);
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'paired:test' }));
    expect(changed).not.toHaveBeenCalled();
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'hearth.shared-screen-notice.v1',
        newValue: 'paired:test',
      }),
    );
    expect(changed).toHaveBeenCalledOnce();
    unsubscribe();
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'hearth.shared-screen-notice.v1',
        newValue: 'paired:again',
      }),
    );
    expect(changed).toHaveBeenCalledOnce();
    notifyScreenAccessChange();
    expect(window.localStorage.getItem('hearth.shared-screen-notice.v1')).toBeNull();
  });
  it('uses a short-lived channel when storage is disabled, without sending any identity', () => {
    const postMessage = vi.fn();
    const close = vi.fn();
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        postMessage = postMessage;
        close = close;
      },
    );
    vi.mocked(window.localStorage.setItem).mockImplementation(() => {
      throw new Error('disabled');
    });
    expect(notifyScreenAccessChange).not.toThrow();
    expect(postMessage).toHaveBeenCalledWith('shared-screen');
    expect(close).toHaveBeenCalledOnce();
  });
});
