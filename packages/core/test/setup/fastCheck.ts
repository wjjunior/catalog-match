import fc from 'fast-check';

// A property test that draws its own seed is a coin flip in CI, which the determinism rule
// of CLAUDE.md rules out. Pinned globally so a new property test cannot reintroduce the
// flake by forgetting it; this value is the seed that first caught the PRG-19 tie collapse.
fc.configureGlobal({ seed: -1732473654 });
