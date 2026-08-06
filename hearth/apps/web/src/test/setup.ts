import '@testing-library/jest-dom/vitest';

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

HTMLElement.prototype.scrollIntoView = () => undefined;

if (CSS.escape === undefined) {
  CSS.escape = (value: string) => value.replaceAll(/[^a-zA-Z0-9_-]/g, '\\$&');
}
