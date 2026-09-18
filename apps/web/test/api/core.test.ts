import { afterEach, describe, expect, it } from 'vitest';

import { getCore, setCoreForTests } from '../../server/core';
import { stubCore } from './fixtures';

afterEach(() => {
  setCoreForTests(undefined);
});

describe('the core seam', () => {
  it('refuses to answer before a core is wired', () => {
    expect(() => getCore()).toThrow(/not wired/i);
  });

  it('hands back the injected core', () => {
    const stub = stubCore();
    setCoreForTests(stub);

    expect(getCore()).toBe(stub);
  });

  it('forgets the injected core once it is cleared', () => {
    setCoreForTests(stubCore());
    setCoreForTests(undefined);

    expect(() => getCore()).toThrow(/not wired/i);
  });
});
