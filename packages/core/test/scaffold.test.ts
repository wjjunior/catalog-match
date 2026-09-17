import { describe, expect, it } from 'vitest';

describe('workspace scaffold', () => {
  it('resolves the core package through its public entry', async () => {
    const core = await import('@catalog-match/core');

    expect(core).toBeTypeOf('object');
  });
});
