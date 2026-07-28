import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Two projects rather than one global environment.
 *
 * The overwhelming majority of the suite is pure logic (importers, reducers, geometry) and
 * runs in `node`, which is meaningfully faster than jsdom. Only component tests need a DOM,
 * so they get their own project with jsdom and the React plugin for JSX. Putting the whole
 * suite in jsdom would slow ~880 node tests down to buy nothing.
 *
 * Naming: `*.test.ts` is a logic test, `*.test.tsx` is a component test. The extension picks
 * the project, so there is nothing to remember beyond what you are already writing.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          globals: true,
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'dom',
          globals: true,
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['src/test-utils/setupDom.ts'],
        },
      },
    ],
  },
});
