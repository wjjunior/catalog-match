import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The extension decides the environment: a `.tsx` test renders components and needs a DOM,
// everything else is pure TypeScript and stays on node.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          setupFiles: ['packages/core/test/setup/fastCheck.ts'],
          include: [
            'packages/*/{src,test}/**/*.test.ts',
            'apps/web/**/*.test.ts',
            'scripts/**/*.test.ts',
            'data/**/*.test.ts',
          ],
        },
      },
      {
        plugins: [react()],
        // shadcn's generated components import their `cn` helper as `@/shared/lib/utils`,
        // the alias apps/web/tsconfig.json resolves for the Next build; Vite needs it too.
        resolve: {
          alias: {
            '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
          },
        },
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['apps/web/**/*.test.tsx'],
          setupFiles: ['apps/web/test/ui/setup.ts'],
        },
      },
    ],
  },
});
