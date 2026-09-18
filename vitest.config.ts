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
          include: [
            'packages/*/{src,test}/**/*.test.ts',
            'apps/web/**/*.test.ts',
            'scripts/**/*.test.ts',
          ],
        },
      },
      {
        plugins: [react()],
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
