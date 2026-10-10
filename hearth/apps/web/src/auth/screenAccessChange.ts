const CHANNEL = 'hearth:shared-screen-access';
const KEY = 'hearth.shared-screen-notice.v1';

// A same-origin, negative-only identity-change notice; no credentials or role grant.
export function notifyScreenAccessChange(): void {
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(CHANNEL);
      channel.postMessage('shared-screen');
      channel.close();
    } catch {
      /* Storage/foreground revalidation remain available. */
    }
  }
  try {
    window.localStorage.setItem(KEY, `paired:${Date.now()}:${Math.random()}`);
    window.localStorage.removeItem(KEY);
  } catch {
    /* Storage can be disabled; the notice carries no authority. */
  }
}

export function subscribeScreenAccessChange(onChange: () => void): () => void {
  let channel: BroadcastChannel | undefined;
  const message = (event: MessageEvent<unknown>) => {
    if (event.data === 'shared-screen') onChange();
  };
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL);
      channel.addEventListener('message', message);
    }
  } catch {
    /* Use storage events and foreground revalidation instead. */
  }
  const storage = (event: StorageEvent) => {
    if (event.key === KEY && event.newValue?.startsWith('paired:')) onChange();
  };
  window.addEventListener('storage', storage);
  return () => {
    channel?.removeEventListener('message', message);
    channel?.close();
    window.removeEventListener('storage', storage);
  };
}
