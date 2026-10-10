import { isTelevisionUserAgent } from '@hearth/shared';

import { useHearthRuntime } from './context';

export function isTelevisionBrowser(): boolean {
  return (
    document.documentElement.dataset.hearthTvNative === 'true' ||
    window.hearthNative !== undefined ||
    isTelevisionUserAgent(navigator.userAgent)
  );
}

export function useSharedScreen(): boolean {
  return useHearthRuntime().sharedScreen === true || isTelevisionBrowser();
}
