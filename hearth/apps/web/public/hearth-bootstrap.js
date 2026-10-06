// Classic, parser-blocking script: appearance and native TV sizing precede the app.
// Same-origin delivery works with the production script-src 'self' policy.
(() => {
  let preference = 'automatic';
  let eveningDimming = false;
  try {
    const saved = JSON.parse(localStorage.getItem('hearth.appearance.v1') ?? '{}');
    if (['light', 'dark', 'automatic'].includes(saved.theme)) preference = saved.theme;
    if (typeof saved.eveningDimming === 'boolean') eveningDimming = saved.eveningDimming;
  } catch {
    // Invalid or unavailable local storage falls back to the device setting.
  }
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = preference === 'automatic' ? (systemDark ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.eveningDim = String(eveningDimming);
  document.documentElement.style.colorScheme = resolved;
})();

if (navigator.userAgent.includes('HearthTV/')) {
  document.documentElement.dataset.hearthTv = 'true';
  const deviceWidth = window.screen?.width || window.innerWidth;
  const deviceHeight = window.screen?.height || window.innerHeight;
  const scale = Math.max(0.25, Math.min(1, deviceWidth / 1920, deviceHeight / 1080));
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute(
      'content',
      `width=1920, height=1080, initial-scale=${scale}, minimum-scale=${scale}, maximum-scale=${scale}, user-scalable=no, viewport-fit=cover`,
    );
}
