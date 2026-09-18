import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { findDataDir, getCore, setCoreForTests } from '../../server/core';
import { stubCore } from './fixtures';

afterEach(() => {
  setCoreForTests(undefined);
});

describe('the core seam', () => {
  it('hands back the injected core', () => {
    const stub = stubCore();
    setCoreForTests(stub);

    expect(getCore()).toBe(stub);
  });

  it('falls back to the real core once the injection is cleared', () => {
    setCoreForTests(stubCore());
    setCoreForTests(undefined);

    expect(getCore().listCustomers()).toHaveLength(5);
  });

  it('builds the real core once and hands back the same instance', () => {
    expect(getCore()).toBe(getCore());
  });
});

describe('findDataDir', () => {
  it('finds the data directory from the repository root', () => {
    expect(findDataDir(process.cwd())).toMatch(/data$/);
  });

  it('finds the same directory from the web app below it', () => {
    expect(findDataDir(join(process.cwd(), 'apps', 'web'))).toBe(findDataDir(process.cwd()));
  });

  it('names where it started when no data directory is above', () => {
    expect(() => findDataDir('/')).toThrow(/Could not find data\/catalog\.csv in \//);
  });
});
