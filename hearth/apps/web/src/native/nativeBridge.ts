const BACK_MESSAGE = '{"type":"back"}';
const EXIT_REQUEST = '{"type":"exit.request"}';

interface HearthNativePort {
  postMessage(message: string): void;
}

declare global {
  interface Window {
    hearthNative?: HearthNativePort;
  }
}

export function isNativeBackMessage(message: unknown): boolean {
  return message === BACK_MESSAGE;
}

export function requestNativeExit(): boolean {
  const bridge = window.hearthNative;
  if (bridge === undefined) return false;
  bridge.postMessage(EXIT_REQUEST);
  return true;
}
