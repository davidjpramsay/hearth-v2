import { afterEach, describe, expect, it, vi } from 'vitest';

import { isNativeBackMessage, requestNativeExit } from './nativeBridge';

afterEach(() => {
  delete window.hearthNative;
});

describe('Android TV native bridge', () => {
  it('accepts only the fixed Back payload', () => {
    expect(isNativeBackMessage('{"type":"back"}')).toBe(true);
    expect(isNativeBackMessage('{"type":"exit.request"}')).toBe(false);
    expect(isNativeBackMessage({ type: 'back' })).toBe(false);
  });

  it('requests a native exit only when the origin-scoped bridge exists', () => {
    const postMessage = vi.fn();
    expect(requestNativeExit()).toBe(false);
    window.hearthNative = { postMessage };
    expect(requestNativeExit()).toBe(true);
    expect(postMessage).toHaveBeenCalledWith('{"type":"exit.request"}');
  });
});
