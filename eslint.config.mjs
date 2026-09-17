import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

// The layers and the allow-lists below are the boundary table of docs/DESIGN.md 4.2.
// A change here is an architecture change: update the table in the same commit.

const CORE_INNER_RING = ['core-domain', 'core-parsing', 'core-matching', 'core-personalization'];

const TEST_FILES = ['**/*.test.ts', '**/*.test.tsx', '**/test/**'];

// packages/core/src/index.ts is the public entry and re-exports every layer by
// definition, so it is classified out rather than constrained. It is owned by the
// integration cards (PRG-22, PRG-26).
const CORE_BARREL = 'packages/core/src/index.ts';

const COMPOSITION_ROOT = 'packages/core/src/application/createCore.ts';

// An element is a folder; every file under it belongs to that layer.
const ELEMENTS = [
  'core-domain:packages/core/src/domain',
  'core-parsing:packages/core/src/parsing',
  'core-matching:packages/core/src/matching',
  'core-personalization:packages/core/src/personalization',
  'core-ports:packages/core/src/ports',
  'core-application:packages/core/src/application',
  'core-adapters:packages/core/src/adapters',
  'core-eval:packages/core/src/eval',
  'web-app:apps/web/app',
  'web-server:apps/web/server',
  'web-widgets:apps/web/src/widgets',
  'web-features:apps/web/src/features',
  'web-entities:apps/web/src/entities',
  'web-shared:apps/web/src/shared',
].map((entry) => {
  const [type, pattern] = entry.split(':');
  return { type, pattern, partialMatch: false };
});

// What each layer may import. Every layer may import itself; anything absent is denied.
const ALLOWED_DEPENDENCIES = {
  'core-domain': CORE_INNER_RING,
  'core-parsing': CORE_INNER_RING,
  'core-matching': CORE_INNER_RING,
  'core-personalization': CORE_INNER_RING,
  'core-ports': [...CORE_INNER_RING, 'core-ports'],
  'core-application': [...CORE_INNER_RING, 'core-ports', 'core-application'],
  'core-adapters': [...CORE_INNER_RING, 'core-ports', 'core-adapters'],
  // The eval harness receives a Matcher; it never wires adapters itself.
  'core-eval': [...CORE_INNER_RING, 'core-ports', 'core-application', 'core-eval'],
  'web-app': ['web-app', 'web-server', 'web-widgets', 'web-features', 'web-entities', 'web-shared'],
  'web-server': ['web-server'],
  'web-widgets': ['web-widgets', 'web-features', 'web-entities', 'web-shared'],
  'web-features': ['web-features', 'web-entities', 'web-shared'],
  'web-entities': ['web-entities', 'web-shared'],
  'web-shared': ['web-shared'],
};

const policyFor = (type, allowed) => ({
  from: { element: { type } },
  allow: { to: { element: { types: { anyOf: allowed } } } },
});

const dependenciesRule = (policies) => ['error', { default: 'disallow', policies }];

const CORE_PACKAGE_PATTERNS = ['@catalog-match/core', '@catalog-match/core/*'];

const restrictCoreImports = (allowTypeImports, message) => [
  'error',
  { patterns: [{ group: CORE_PACKAGE_PATTERNS, allowTypeImports, message }] },
];

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/coverage/**', '**/dist/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['packages/core/src/**/*.ts', 'apps/web/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/include': [
        'packages/core/src/**/*',
        'apps/web/app/**/*',
        'apps/web/server/**/*',
        'apps/web/src/**/*',
      ],
      'boundaries/ignore': [...TEST_FILES, CORE_BARREL],
      'boundaries/elements': ELEMENTS,
      // Without this the default node resolver cannot follow extensionless
      // TypeScript imports and every boundary check silently passes.
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['tsconfig.json', 'packages/*/tsconfig.json', 'apps/*/tsconfig.json'],
          // One tsconfig per workspace package is the point of the workspace.
          noWarnOnMultipleProjects: true,
        },
      },
    },
    rules: {
      'boundaries/dependencies': dependenciesRule(
        Object.entries(ALLOWED_DEPENDENCIES).map(([type, allowed]) => policyFor(type, allowed)),
      ),
      // Every file under an included path must belong to a declared layer.
      'boundaries/no-unknown-files': 'error',
    },
  },
  {
    // createCore is the single composition root and the only module in core that may
    // reach the adapters.
    files: [COMPOSITION_ROOT],
    rules: {
      'boundaries/dependencies': dependenciesRule([
        policyFor('core-application', [
          ...ALLOWED_DEPENDENCIES['core-application'],
          'core-adapters',
        ]),
      ]),
    },
  },
  {
    // app/ reaches the core only through server/, which owns the composition root.
    files: ['apps/web/app/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': restrictCoreImports(
        false,
        'app/ must reach @catalog-match/core through apps/web/server (see docs/DESIGN.md 4.2).',
      ),
    },
  },
  {
    // The client layers may name core types but must never pull core runtime code
    // into the browser bundle.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': restrictCoreImports(
        true,
        'apps/web/src may import @catalog-match/core as `import type` only (see docs/DESIGN.md 4.2).',
      ),
    },
  },
  {
    files: TEST_FILES,
    rules: {
      'boundaries/dependencies': 'off',
      'boundaries/no-unknown-files': 'off',
      '@typescript-eslint/no-restricted-imports': 'off',
    },
  },
  prettier,
);
