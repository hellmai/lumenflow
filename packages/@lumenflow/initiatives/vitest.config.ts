import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts', '**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    passWithNoTests: false,
    // WU-2403: Generous timeout for first-test module compilation.
    // Tests use dynamic `await import(...)` to ensure process.cwd() is set
    // to a temp directory before module loading (modules resolve config paths
    // from cwd at import time). The first import per file compiles the full
    // dependency tree (~3s locally, potentially longer under CI load).
    // Default 5s timeout is insufficient under load — 15s provides headroom.
    testTimeout: 15000,
  },
});
