import '@testing-library/jest-dom/vitest';

if (typeof window !== 'undefined')
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    }),
  });

if (typeof HTMLElement !== 'undefined') HTMLElement.prototype.scrollIntoView = () => undefined;

if (typeof CSS !== 'undefined' && CSS.escape === undefined) {
  CSS.escape = (value: string) => value.replaceAll(/[^a-zA-Z0-9_-]/g, '\\$&');
}
