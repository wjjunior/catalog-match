import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The core package is consumed as TypeScript source, so it has no build step of
  // its own and Next compiles it with the app.
  transpilePackages: ['@catalog-match/core'],
  // Next writes its own AGENTS.md and CLAUDE.md into apps/web on dev and build.
  // The agent protocol for this repository lives in CLAUDE.md at the root.
  agentRules: false,
};

export default nextConfig;
