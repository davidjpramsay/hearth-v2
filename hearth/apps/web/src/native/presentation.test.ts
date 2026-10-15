import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readNativePresentation, subscribeNativePresentation } from './presentation';

interface TestPort {
  postMessage: (message: string) => void;
  onmessage?: ((this: TestPort, event: MessageEvent<unknown>) => void) | null | undefined;
}

const status = (active = true, generation = 1) =>
  JSON.stringify({ type: 'presentation.status', active, generation });

function installPort(port: TestPort, wrapped = false) {
  Object.defineProperty(window, 'hearthNative', {
    configurable: true,
    value: wrapped ? { port } : port,
  });
}

function reply(port: TestPort, data: unknown) {
  const event = new MessageEvent('message', { data });
  port.onmessage?.call(port, event);
  return event;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  delete window.hearthNative;
});

describe('native presentation status reads', () => {
  it('fails closed without the native capability', async () => {
    await expect(readNativePresentation()).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])('uses the native reply port once (wrapped=%s)', async (wrapped) => {
    const port: TestPort = { postMessage: vi.fn(), onmessage: null };
    installPort(port, wrapped);
    const pending = readNativePresentation();
    expect(port.postMessage).toHaveBeenCalledExactlyOnceWith('{"type":"presentation.status"}');
    reply(port, status());
    await expect(pending).resolves.toEqual({ active: true, generation: 1 });
    expect(port.onmessage).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns an explicitly inactive generation zero snapshot', async () => {
    const port: TestPort = { postMessage: vi.fn() };
    installPort(port);
    const pending = readNativePresentation();
    reply(port, status(false, 0));
    await expect(pending).resolves.toEqual({ active: false, generation: 0 });
  });

  it('registers onmessage before sending to support synchronous replies', async () => {
    const port: TestPort = {
      postMessage: () => {
        reply(port, status(false, 4));
      },
    };
    installPort(port);
    await expect(readNativePresentation()).resolves.toEqual({ active: false, generation: 4 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('forwards exact original events and receiver and restores the previous handler', async () => {
    const previous = vi.fn();
    const port: TestPort = { postMessage: vi.fn(), onmessage: previous };
    installPort(port);
    const pending = readNativePresentation();
    const unrelated = reply(port, '{"type":"network.status","online":true}');
    const snapshot = reply(port, status(false, 2));
    await expect(pending).resolves.toEqual({ active: false, generation: 2 });
    expect(previous.mock.calls).toEqual([[unrelated], [snapshot]]);
    expect(previous.mock.contexts).toEqual([port, port]);
    expect(port.onmessage).toBe(previous);
  });

  it('does not let a throwing previous handler prevent an authoritative reply', async () => {
    const previous = vi.fn(() => {
      throw new Error('prior handler');
    });
    const port: TestPort = { postMessage: vi.fn(), onmessage: previous };
    installPort(port);
    const pending = readNativePresentation();
    reply(port, status());
    await expect(pending).resolves.toEqual({ active: true, generation: 1 });
    expect(port.onmessage).toBe(previous);
  });

  it('coalesces overlapping reads and queries again on the next read', async () => {
    const port: TestPort = { postMessage: vi.fn() };
    installPort(port);
    const first = readNativePresentation();
    expect(readNativePresentation()).toBe(first);
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    reply(port, status());
    await first;
    const next = readNativePresentation();
    expect(port.postMessage).toHaveBeenCalledTimes(2);
    reply(port, status(false, 2));
    await expect(next).resolves.toEqual({ active: false, generation: 2 });
  });

  it('times out an old APK unsupported reply without assuming active or retrying', async () => {
    const previous = vi.fn();
    const port: TestPort = { postMessage: vi.fn(), onmessage: previous };
    installPort(port);
    const pending = readNativePresentation();
    reply(port, '{"type":"error","code":"UNSUPPORTED_MESSAGE"}');
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toBeNull();
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    expect(port.onmessage).toBe(previous);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not clobber a handler installed by another consumer while waiting', async () => {
    const port: TestPort = { postMessage: vi.fn() };
    installPort(port);
    const pending = readNativePresentation();
    const replacement = vi.fn();
    port.onmessage = replacement;
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toBeNull();
    expect(port.onmessage).toBe(replacement);
  });

  it('returns null and restores the prior handler after a failed native send', async () => {
    const previous = vi.fn();
    const port: TestPort = {
      postMessage: () => {
        throw new Error('WebView unavailable');
      },
      onmessage: previous,
    };
    installPort(port);
    await expect(readNativePresentation()).resolves.toBeNull();
    expect(port.onmessage).toBe(previous);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, 1, {}, { postMessage: 'invalid' }, { port: null }])(
    'returns null for a malformed injected bridge: %j',
    async (value) => {
      Object.defineProperty(window, 'hearthNative', { configurable: true, value });
      await expect(readNativePresentation()).resolves.toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('returns null when the port cannot install a reply handler', async () => {
    const port = Object.freeze({ postMessage: vi.fn(), onmessage: null });
    installPort(port);
    await expect(readNativePresentation()).resolves.toBeNull();
    expect(port.postMessage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails closed if accessing the native port throws', async () => {
    Object.defineProperty(window, 'hearthNative', {
      configurable: true,
      get: () => {
        throw new Error('unavailable');
      },
    });
    await expect(readNativePresentation()).resolves.toBeNull();
  });

  it.each([
    { type: 'presentation.status', active: true, generation: 1 },
    'not JSON',
    'null',
    '[]',
    '{"type":"back"}',
    '{"type":"presentation.status","active":true}',
    '{"type":"presentation.status","active":"true","generation":1}',
    '{"type":"presentation.status","active":1,"generation":1}',
    '{"type":"presentation.status","active":true,"generation":-1}',
    '{"type":"presentation.status","active":true,"generation":1.5}',
    '{"type":"presentation.status","active":true,"generation":"1"}',
    '{"type":"presentation.status","active":true,"generation":9007199254740992}',
    '{"type":"presentation.status","active":true,"generation":1,"url":"https://other.invalid"}',
    'x'.repeat(257),
  ])('rejects invalid status data without treating it as active: %j', async (data) => {
    const port: TestPort = { postMessage: vi.fn() };
    installPort(port);
    const pending = readNativePresentation();
    reply(port, data);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toBeNull();
    expect(port.postMessage).toHaveBeenCalledTimes(1);
  });
});

describe('native presentation pushes', () => {
  it('delivers only exact-origin JSON status snapshots and cleans up', () => {
    const listener = vi.fn();
    const cleanup = subscribeNativePresentation(listener);
    const origin = window.location.origin;
    for (const untrusted of ['', 'null', `${origin}.other.invalid`, 'https://other.invalid']) {
      window.dispatchEvent(new MessageEvent('message', { origin: untrusted, data: status() }));
    }
    window.dispatchEvent(
      new MessageEvent('message', {
        origin,
        data: { type: 'presentation.status', active: true, generation: 1 },
      }),
    );
    window.dispatchEvent(new MessageEvent('message', { origin, data: '{"type":"back"}' }));
    window.dispatchEvent(new MessageEvent('message', { origin, data: status(false, 2) }));
    expect(listener).toHaveBeenCalledExactlyOnceWith({ active: false, generation: 2 });
    cleanup();
    cleanup();
    window.dispatchEvent(new MessageEvent('message', { origin, data: status(true, 3) }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps independent subscribers and existing window handlers intact', () => {
    const previous = vi.fn();
    const first = vi.fn();
    const second = vi.fn();
    window.addEventListener('message', previous);
    const stopFirst = subscribeNativePresentation(first);
    const stopSecond = subscribeNativePresentation(second);
    try {
      stopFirst();
      const event = new MessageEvent('message', { origin: window.location.origin, data: status() });
      window.dispatchEvent(event);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledExactlyOnceWith({ active: true, generation: 1 });
      expect(previous).toHaveBeenCalledExactlyOnceWith(event);
    } finally {
      stopSecond();
      window.removeEventListener('message', previous);
    }
  });
});
