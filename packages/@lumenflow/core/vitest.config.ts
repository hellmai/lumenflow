import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/__tests__/**/*.test.ts',
      'src/invariants/__tests__/**/*.test.ts',
      '__tests__/**/*.test.ts',
      '**/*.spec.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // WU-2465: These files use node:test runner, not vitest
      'src/core/__tests__/scope-checker.test.ts',
      'src/core/__tests__/tool-runner.test.ts',
      'src/core/__tests__/worktree-guard.test.ts',
    ],
    passWithNoTests: false,
    // Default 5s timeout is too tight on GitHub-hosted ubuntu-latest runners
    // when 180+ test files run in parallel. Source-scanning guards set 30s
    // per-test; this covers everything else.
    testTimeout: 15000,
  },
});
