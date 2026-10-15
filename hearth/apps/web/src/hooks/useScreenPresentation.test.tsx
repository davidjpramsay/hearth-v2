import type { RuntimeContext, ScreenCommand } from '@hearth/shared';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Suspense, useEffect } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { homeAssistantBridgeApi, HomeAssistantBridgeApiError } from '../api/homeAssistantBridge';
import type * as BridgeApiModule from '../api/homeAssistantBridge';
import { useHearthRuntime } from '../runtime/context';
import { readNativePresentation, subscribeNativePresentation } from '../native/presentation';
import { useScreenPresentation } from './useScreenPresentation';

vi.mock('../api/homeAssistantBridge', async (importOriginal) => ({
  ...(await importOriginal<typeof BridgeApiModule>()),
  homeAssistantBridgeApi: { getCurrentDevice: vi.fn(), present: vi.fn() },
}));
vi.mock('../runtime/context', () => ({ useHearthRuntime: vi.fn() }));
vi.mock('../native/presentation', () => ({
  readNativePresentation: vi.fn(),
  subscribeNativePresentation: vi.fn(),
}));
let nativeState = { active: true, generation: 1 };
let notifyNative = () => {};
let monotonicTime = 0;
const readTestClock = () => monotonicTime;

const stamp = '2026-10-15T00:00:00.000Z';
const runtime = {
  mode: 'private',
  sharedScreen: true,
  household: { id: 'household_test' },
} as RuntimeContext;
const device = {
  deviceId: 'device_test',
  householdId: 'household_test',
  deviceName: 'Test screen',
  scopes: ['household.read'] as const,
  pairedAt: stamp,
};
type PresentationReply = Awaited<ReturnType<typeof homeAssistantBridgeApi.present>>;

function reply(
  command: ScreenCommand | null = null,
  serverTime = new Date().toISOString(),
): PresentationReply {
  return { serverTime, command };
}

function command(overrides: Partial<ScreenCommand> = {}): ScreenCommand {
  return {
    id: 'command_test',
    tab: 'chores',
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
    ...overrides,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
function RouteObserver({ report }: { report: (path: string) => void }) {
  const location = useLocation();
  useEffect(() => {
    report(location.pathname);
  }, [location.key, location.pathname, report]);
  return null;
}
function Path() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <p data-testid="path">{location.pathname}</p>
      <button onClick={() => void navigate('/weather')}>Local weather</button>
    </>
  );
}
const never = new Promise<void>(() => undefined);
function DelayedRoute(): never {
  throw never;
}
function Agent({ delayed = false }: { delayed?: boolean }) {
  const report = useScreenPresentation(readTestClock);
  return (
    <Suspense fallback={<p>Loading destination</p>}>
      <Routes>
        <Route path="/chores" element={delayed ? <DelayedRoute /> : null} />
        <Route path="*" element={null} />
      </Routes>
      <RouteObserver report={report} />
    </Suspense>
  );
}
function show({
  active = true,
  delayed = false,
  path = '/today',
}: { active?: boolean; delayed?: boolean; path?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      {active ? <Agent delayed={delayed} /> : null}
      <Path />
    </MemoryRouter>,
  );
}
async function tick(ms = 0) {
  monotonicTime += ms;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
function hide() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
}
function reveal() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
}

beforeEach(() => {
  vi.useFakeTimers();
  monotonicTime = 0;
  vi.setSystemTime(stamp);
  vi.mocked(useHearthRuntime).mockReturnValue(runtime);
  vi.mocked(homeAssistantBridgeApi.getCurrentDevice)
    .mockReset()
    .mockResolvedValue({ ...device, scopes: ['household.read'] });
  vi.mocked(homeAssistantBridgeApi.present)
    .mockReset()
    .mockImplementation(async () => reply());
  nativeState = { active: true, generation: 1 };
  vi.mocked(readNativePresentation)
    .mockReset()
    .mockImplementation(async () => nativeState);
  vi.mocked(subscribeNativePresentation)
    .mockReset()
    .mockImplementation((listener) => {
      notifyNative = () => listener(nativeState);
      return () => {};
    });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => {
  cleanup();
  delete window.hearthNative;
  delete document.documentElement.dataset.hearthTvNative;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('paired display presentation', () => {
  it.each([
    { mode: 'demo', sharedScreen: true },
    { mode: 'private', sharedScreen: false },
    { mode: 'private', sharedScreen: undefined },
  ] as const)('does not report from $mode/sharedScreen=$sharedScreen', async (flags) => {
    vi.mocked(useHearthRuntime).mockReturnValue({ ...runtime, ...flags } as RuntimeContext);
    show();
    await tick(10_000);
    expect(homeAssistantBridgeApi.getCurrentDevice).not.toHaveBeenCalled();
    expect(homeAssistantBridgeApi.present).not.toHaveBeenCalled();
  });

  it('requires the paired TV identity to belong to the current household', async () => {
    vi.mocked(homeAssistantBridgeApi.getCurrentDevice).mockResolvedValue({
      ...device,
      householdId: 'household_other',
      scopes: ['household.read'],
    });
    show();
    await tick(20_000);
    expect(homeAssistantBridgeApi.present).not.toHaveBeenCalled();
    expect(homeAssistantBridgeApi.getCurrentDevice).toHaveBeenCalledOnce();
  });

  it('reports committed routes every two seconds without restarting on route changes', async () => {
    show();
    await tick();
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledWith(
      { instanceId: expect.any(String), tab: 'today', acknowledgedCommandId: null },
      expect.any(AbortSignal),
    );
    act(() => screen.getByRole('button', { name: 'Local weather' }).click());
    await tick(2_000);
    const calls = vi.mocked(homeAssistantBridgeApi.present).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]![0]).toEqual({ ...calls[0]![0], tab: 'weather' });
    expect(homeAssistantBridgeApi.getCurrentDevice).toHaveBeenCalledOnce();
  });

  it('reports null for an unmapped route, never an arbitrary path', async () => {
    vi.mocked(homeAssistantBridgeApi.present).mockResolvedValueOnce(reply(command()));
    show({ path: '/admin/connections' });
    await tick();
    expect(vi.mocked(homeAssistantBridgeApi.present).mock.calls[0]![0].tab).toBeNull();
    expect(screen.getByTestId('path')).toHaveTextContent('/admin/connections');
  });

  it('navigates the allowlist then acknowledges only the path confirmed by a React effect', async () => {
    const next = command();
    vi.mocked(homeAssistantBridgeApi.present).mockResolvedValueOnce(reply(next));
    show();
    await tick();
    expect(screen.getByTestId('path')).toHaveTextContent('/chores');
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledOnce();
    expect(
      vi.mocked(homeAssistantBridgeApi.present).mock.calls[0]![0].acknowledgedCommandId,
    ).toBeNull();
    await tick(2_000);
    expect(vi.mocked(homeAssistantBridgeApi.present).mock.calls[1]![0]).toMatchObject({
      tab: 'chores',
      acknowledgedCommandId: next.id,
    });
  });

  it('does not acknowledge a destination that is still suspended', async () => {
    vi.mocked(homeAssistantBridgeApi.present).mockResolvedValueOnce(reply(command()));
    show({ delayed: true });
    await tick();
    await tick(2_000);
    expect(vi.mocked(homeAssistantBridgeApi.present).mock.calls[1]![0]).toMatchObject({
      tab: 'today',
      acknowledgedCommandId: null,
    });
  });

  it('does not acknowledge a command that expires before the next report', async () => {
    vi.mocked(homeAssistantBridgeApi.present).mockResolvedValueOnce(
      reply(command({ expiresAt: new Date(Date.now() + 1_000).toISOString() })),
    );
    show();
    await tick();
    await tick(2_000);
    expect(
      vi.mocked(homeAssistantBridgeApi.present).mock.calls[1]![0].acknowledgedCommandId,
    ).toBeNull();
  });

  it.each([-86_400_000, -1_000, 1_000, 86_400_000])(
    'uses server time when the TV clock differs by %sms',
    async (skew) => {
      const next = command();
      vi.mocked(homeAssistantBridgeApi.present).mockResolvedValueOnce(reply(next, stamp));
      vi.setSystemTime(new Date(Date.parse(stamp) + skew));
      show();
      await tick();
      expect(screen.getByTestId('path')).toHaveTextContent('/chores');
      await tick(2_000);
      expect(
        vi.mocked(homeAssistantBridgeApi.present).mock.calls[1]![0].acknowledgedCommandId,
      ).toBe(next.id);
    },
  );

  it('does not extend the acknowledgement budget when the TV wall clock moves backwards', async () => {
    vi.mocked(homeAssistantBridgeApi.present).mockResolvedValueOnce(
      reply(command({ expiresAt: '2026-10-15T00:00:01.000Z' }), stamp),
    );
    show();
    await tick();
    vi.setSystemTime('2020-01-01T00:00:00Z');
    await tick(2_000);
    expect(
      vi.mocked(homeAssistantBridgeApi.present).mock.calls[1]![0].acknowledgedCommandId,
    ).toBeNull();
  });

  it('keeps a valid monotonic acknowledgement budget when the TV wall clock jumps ahead', async () => {
    const next = command();
    vi.mocked(homeAssistantBridgeApi.present).mockResolvedValueOnce(reply(next, stamp));
    show();
    await tick();
    vi.setSystemTime('2030-01-01T00:00:00Z');
    await tick(2_000);
    expect(vi.mocked(homeAssistantBridgeApi.present).mock.calls[1]![0].acknowledgedCommandId).toBe(
      next.id,
    );
  });

  it('rejects an invalid server clock instead of using the TV wall clock', async () => {
    vi.mocked(homeAssistantBridgeApi.present).mockResolvedValueOnce(reply(command(), 'invalid'));
    show();
    await tick();
    expect(screen.getByTestId('path')).toHaveTextContent('/today');
  });

  it('rechecks the monotonic deadline after awaiting native eligibility', async () => {
    window.hearthNative = { postMessage: vi.fn() };
    const nativeRead = deferred<{ active: boolean; generation: number } | null>();
    vi.mocked(readNativePresentation)
      .mockResolvedValueOnce(nativeState)
      .mockResolvedValueOnce(nativeState)
      .mockReturnValueOnce(nativeRead.promise);
    vi.mocked(homeAssistantBridgeApi.present).mockResolvedValueOnce(
      reply(command({ expiresAt: '2026-10-15T00:00:01.000Z' }), stamp),
    );
    show();
    await tick();
    await tick(1_000);
    await act(async () => nativeRead.resolve(nativeState));
    expect(screen.getByTestId('path')).toHaveTextContent('/today');
    await tick(2_000);
    expect(
      vi.mocked(homeAssistantBridgeApi.present).mock.calls[1]![0].acknowledgedCommandId,
    ).toBeNull();
  });

  it.each([
    { tab: '/admin' },
    { tab: 'admin' },
    { status: 'expired' },
    { expiresAt: stamp },
    { createdAt: '2026-10-14T23:59:59.000Z' },
    { createdAt: '2026-10-15T00:00:01.000Z' },
    { expiresAt: '2026-10-15T00:00:31.000Z' },
  ])('rejects unsafe commands or invalid server lifetimes: %j', async (overrides) => {
    vi.mocked(homeAssistantBridgeApi.present).mockResolvedValueOnce(
      reply({ ...command(), ...overrides } as ScreenCommand),
    );
    show();
    await tick();
    expect(screen.getByTestId('path')).toHaveTextContent('/today');
    await tick(2_000);
    expect(
      vi.mocked(homeAssistantBridgeApi.present).mock.calls[1]![0].acknowledgedCommandId,
    ).toBeNull();
  });

  it('never overlaps heartbeats even when a response is slow', async () => {
    const response = deferred<PresentationReply>();
    vi.mocked(homeAssistantBridgeApi.present).mockReturnValueOnce(response.promise);
    show();
    await tick(10_000);
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledOnce();
    await act(async () => response.resolve(reply()));
    await tick(1_999);
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledOnce();
    await tick(1);
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledTimes(2);
  });

  it('subtracts the full request round trip and rejects a delayed pending command without overlap', async () => {
    const response = deferred<PresentationReply>();
    const next = command({ expiresAt: '2026-10-15T00:00:01.000Z' });
    vi.mocked(homeAssistantBridgeApi.present).mockReturnValueOnce(response.promise);
    show();
    await tick();
    await tick(5_000);
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledOnce();
    await act(async () => response.resolve(reply(next, stamp)));
    expect(screen.getByTestId('path')).toHaveTextContent('/today');
    await tick(2_000);
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledTimes(2);
    expect(vi.mocked(homeAssistantBridgeApi.present).mock.calls[1]![0]).toMatchObject({
      tab: 'today',
      acknowledgedCommandId: null,
    });
  });

  it('cancels on hide, ignores a late command, and sends one serial null report', async () => {
    const response = deferred<PresentationReply>();
    vi.mocked(homeAssistantBridgeApi.present)
      .mockReturnValueOnce(response.promise)
      .mockResolvedValueOnce(reply(command()));
    show();
    await tick();
    const first = vi.mocked(homeAssistantBridgeApi.present).mock.calls[0]!;
    hide();
    expect(first[1].aborted).toBe(true);
    await tick(10_000);
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledOnce();
    await act(async () => response.resolve(reply(command())));
    await tick();
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledTimes(2);
    expect(vi.mocked(homeAssistantBridgeApi.present).mock.calls[1]![0]).toEqual({
      instanceId: first[0].instanceId,
      tab: null,
      acknowledgedCommandId: null,
    });
    expect(screen.getByTestId('path')).toHaveTextContent('/today');
    await tick(20_000);
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledTimes(2);
    reveal();
    await tick();
    expect(vi.mocked(homeAssistantBridgeApi.present).mock.calls[2]![0].instanceId).not.toBe(
      first[0].instanceId,
    );
  });

  it('aborts on unmount and cannot navigate after an abort-ignoring transport resolves', async () => {
    const response = deferred<PresentationReply>();
    vi.mocked(homeAssistantBridgeApi.present).mockReturnValueOnce(response.promise);
    const view = show();
    await tick();
    const signal = vi.mocked(homeAssistantBridgeApi.present).mock.calls[0]![1];
    view.rerender(
      <MemoryRouter>
        <Path />
      </MemoryRouter>,
    );
    expect(signal.aborted).toBe(true);
    await act(async () => response.resolve(reply(command())));
    await tick(20_000);
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledOnce();
    expect(screen.getByTestId('path')).toHaveTextContent('/today');
  });

  it.each([null, { active: false, generation: 1 }])(
    'does not heartbeat on unsupported/inactive native status %j',
    async (status) => {
      window.hearthNative = { postMessage: vi.fn() };
      vi.mocked(readNativePresentation).mockResolvedValue(status);
      show();
      await tick(10_000);
      expect(homeAssistantBridgeApi.getCurrentDevice).not.toHaveBeenCalled();
      expect(homeAssistantBridgeApi.present).not.toHaveBeenCalled();
    },
  );

  it('cancels in flight on native background and rotates the instance after foreground returns', async () => {
    window.hearthNative = { postMessage: vi.fn() };
    const response = deferred<PresentationReply>();
    vi.mocked(homeAssistantBridgeApi.present)
      .mockReturnValueOnce(response.promise)
      .mockResolvedValueOnce(reply(command()));
    show();
    await tick();
    const first = vi.mocked(homeAssistantBridgeApi.present).mock.calls[0]!;
    nativeState = { active: false, generation: 2 };
    act(() => notifyNative());
    expect(first[1].aborted).toBe(true);
    await tick(5_000);
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledOnce();
    await act(async () => response.resolve(reply(command())));
    await tick();
    expect(vi.mocked(homeAssistantBridgeApi.present).mock.calls[1]![0]).toMatchObject({
      tab: null,
      acknowledgedCommandId: null,
    });
    expect(screen.getByTestId('path')).toHaveTextContent('/today');
    nativeState = { active: true, generation: 3 };
    act(() => notifyNative());
    await tick();
    expect(vi.mocked(homeAssistantBridgeApi.present).mock.calls[2]![0].instanceId).not.toBe(
      first[0].instanceId,
    );
  });

  it('rechecks native status before navigating and drops a command from an older generation', async () => {
    window.hearthNative = { postMessage: vi.fn() };
    const response = deferred<PresentationReply>();
    vi.mocked(homeAssistantBridgeApi.present).mockReturnValueOnce(response.promise);
    show();
    await tick();
    nativeState = { active: true, generation: 3 };
    // No push delivered: the mandatory status read after the network wait catches this change.
    await act(async () => response.resolve(reply(command())));
    await tick();
    expect(readNativePresentation).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('path')).toHaveTextContent('/today');
    expect(vi.mocked(homeAssistantBridgeApi.present).mock.calls[1]![0]).toMatchObject({
      tab: null,
      acknowledgedCommandId: null,
    });
  });

  it('does not apply a command if native support disappears before navigation', async () => {
    window.hearthNative = { postMessage: vi.fn() };
    const response = deferred<PresentationReply>();
    vi.mocked(homeAssistantBridgeApi.present).mockReturnValueOnce(response.promise);
    show();
    await tick();
    vi.mocked(readNativePresentation).mockResolvedValue(null);
    await act(async () => response.resolve(reply(command())));
    await tick();
    expect(screen.getByTestId('path')).toHaveTextContent('/today');
    expect(vi.mocked(homeAssistantBridgeApi.present).mock.calls[1]![0]).toMatchObject({
      tab: null,
      acknowledgedCommandId: null,
    });
  });

  it('does not restart the instance for an identical native status push', async () => {
    window.hearthNative = { postMessage: vi.fn() };
    show();
    await tick();
    const first = vi.mocked(homeAssistantBridgeApi.present).mock.calls[0]![0];
    act(() => notifyNative());
    await tick(2_000);
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledTimes(2);
    expect(vi.mocked(homeAssistantBridgeApi.present).mock.calls[1]![0].instanceId).toBe(
      first.instanceId,
    );
  });

  it('cannot start a device request after unmounting during a native status read', async () => {
    window.hearthNative = { postMessage: vi.fn() };
    const status = deferred<{ active: boolean; generation: number } | null>();
    vi.mocked(readNativePresentation).mockReturnValueOnce(status.promise);
    const view = show();
    view.unmount();
    await act(async () => status.resolve({ active: true, generation: 1 }));
    await tick(10_000);
    expect(homeAssistantBridgeApi.getCurrentDevice).not.toHaveBeenCalled();
    expect(homeAssistantBridgeApi.present).not.toHaveBeenCalled();
  });

  it.each([401, 403])('silently stops on authentication failure %s', async (status) => {
    vi.mocked(homeAssistantBridgeApi.present).mockRejectedValue(
      new HomeAssistantBridgeApiError(status),
    );
    show();
    await tick(60_000);
    hide();
    reveal();
    await tick(60_000);
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('backs off lease conflicts with the same instance instead of stealing the lease', async () => {
    vi.mocked(homeAssistantBridgeApi.present).mockRejectedValue(
      new HomeAssistantBridgeApiError(409),
    );
    show();
    await tick();
    await tick(3_999);
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledOnce();
    await tick(1);
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledTimes(2);
    await tick(7_999);
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledTimes(2);
    await tick(1);
    expect(homeAssistantBridgeApi.present).toHaveBeenCalledTimes(3);
    const ids = vi
      .mocked(homeAssistantBridgeApi.present)
      .mock.calls.map(([body]) => body.instanceId);
    expect(new Set(ids).size).toBe(1);
    expect(homeAssistantBridgeApi.getCurrentDevice).toHaveBeenCalledOnce();
  });

  it('reconnects with a new instance so server commands cannot transfer from the previous lease', async () => {
    vi.mocked(homeAssistantBridgeApi.present)
      .mockRejectedValueOnce(new HomeAssistantBridgeApiError(0))
      .mockResolvedValueOnce(reply());
    show();
    await tick();
    await tick(4_000);
    const calls = vi.mocked(homeAssistantBridgeApi.present).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]![0].instanceId).not.toBe(calls[0]![0].instanceId);
    expect(screen.getByTestId('path')).toHaveTextContent('/today');
  });
});
