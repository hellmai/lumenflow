import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { buildWorkspaceVitestAliases } from './tools/testing/workspace-vitest-aliases';

const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));
const workspaceAliases = buildWorkspaceVitestAliases({ repoRoot: REPO_ROOT });

export default defineConfig({
  resolve: {
    alias: workspaceAliases,
  },
  test: {
    // Gate runner filters safety-critical tests via `--project web`.
    name: 'web',
    globals: true,
    environment: 'node',
    include: [
      'packages/**/__tests__/**/*.test.ts',
      'packages/**/*.spec.ts',
      'apps/**/__tests__/**/*.test.ts',
      'tools/**/__tests__/**/*.test.ts',
      'scripts/__tests__/**/*.test.ts',
      '.husky/hooks/__tests__/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // WU-2465: These files use node:test runner, not vitest
      'packages/@lumenflow/core/src/core/__tests__/scope-checker.test.ts',
      'packages/@lumenflow/core/src/core/__tests__/tool-runner.test.ts',
      'packages/@lumenflow/core/src/core/__tests__/worktree-guard.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/__tests__/**', '**/*.config.*'],
      thresholds: {
        global: {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
      },
    },
    passWithNoTests: false,
  },
});
