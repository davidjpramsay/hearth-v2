export interface NativePresentation {
  active: boolean;
  generation: number;
}

interface PresentationPort {
  postMessage(message: string): void;
  onmessage?: ((this: PresentationPort, event: MessageEvent<unknown>) => void) | null | undefined;
}

const STATUS_REQUEST = '{"type":"presentation.status"}';
const READ_TIMEOUT_MS = 1_000;
const pendingReads = new WeakMap<PresentationPort, Promise<NativePresentation | null>>();

function presentationPort(): PresentationPort | null {
  const bridge: unknown = window.hearthNative;
  if (typeof bridge !== 'object' || bridge === null) return null;
  // AndroidX exposes the injected object itself as the port. Also accept an explicit port wrapper.
  const port = 'port' in bridge ? bridge.port : bridge;
  if (typeof port !== 'object' || port === null || !('postMessage' in port)) return null;
  return typeof port.postMessage === 'function' ? (port as PresentationPort) : null;
}

function parseSnapshot(data: unknown): NativePresentation | null {
  if (typeof data !== 'string' || data.length > 256) return null;
  try {
    const value: unknown = JSON.parse(data);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    if (
      Object.keys(value).length !== 3 ||
      !('type' in value) ||
      value.type !== 'presentation.status' ||
      !('active' in value) ||
      typeof value.active !== 'boolean' ||
      !('generation' in value) ||
      typeof value.generation !== 'number' ||
      !Number.isSafeInteger(value.generation) ||
      value.generation < 0
    )
      return null;
    return { active: value.active, generation: value.generation };
  } catch {
    return null;
  }
}

/** An unsupported/old shell, unavailable port or missed deadline never implies active. */
export function readNativePresentation(): Promise<NativePresentation | null> {
  try {
    const port = presentationPort();
    if (port === null) return Promise.resolve(null);
    const pending = pendingReads.get(port);
    if (pending !== undefined) return pending;
    const previous = port.onmessage;
    if (previous != null && typeof previous !== 'function') return Promise.resolve(null);

    let resolveRead!: (snapshot: NativePresentation | null) => void;
    const result = new Promise<NativePresentation | null>((resolve) => {
      resolveRead = resolve;
    });
    pendingReads.set(port, result);
    let settled = false;
    const finish = (snapshot: NativePresentation | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      pendingReads.delete(port);
      try {
        if (port.onmessage === onMessage) port.onmessage = previous;
      } catch {
        resolveRead(null);
        return;
      }
      resolveRead(snapshot);
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      // Forward the original event with the original receiver, including unrelated native replies.
      try {
        previous?.call(port, event);
      } catch {
        /* A prior handler cannot grant eligibility. */
      }
      const snapshot = parseSnapshot(event.data);
      if (snapshot !== null) finish(snapshot);
    };
    const timeout = window.setTimeout(() => finish(null), READ_TIMEOUT_MS);
    try {
      port.onmessage = onMessage;
      if (port.onmessage !== onMessage) finish(null);
      else port.postMessage(STATUS_REQUEST);
    } catch {
      finish(null);
    }
    return result;
  } catch {
    return Promise.resolve(null);
  }
}

/** Best-effort native pushes; a fresh read remains required before applying a command. */
export function subscribeNativePresentation(
  listener: (snapshot: NativePresentation) => void,
): () => void {
  const trustedOrigin = window.location.origin;
  const onMessage = (event: MessageEvent<unknown>) => {
    if (trustedOrigin === 'null' || event.origin !== trustedOrigin) return;
    const snapshot = parseSnapshot(event.data);
    if (snapshot !== null) listener(snapshot);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
