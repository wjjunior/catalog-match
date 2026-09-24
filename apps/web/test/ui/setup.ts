import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only registers its own cleanup when vitest runs with globals.
afterEach(cleanup);

// jsdom implements neither, and cmdk measures its list with one and brings the active
// option into view with the other.
globalThis.ResizeObserver ??= class {
  observe() {
    /* measurement has no meaning without layout */
  }
  unobserve() {
    /* measurement has no meaning without layout */
  }
  disconnect() {
    /* measurement has no meaning without layout */
  }
};
Element.prototype.scrollIntoView ??= function scrollIntoView() {
  /* nothing scrolls without layout */
};
