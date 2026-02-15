import { describe, it, expect } from 'vitest';
import { runWuSandbox } from '../src/wu-sandbox.js';

describe('wu:sandbox integration (WU-1687)', () => {
  it('runs a command with explicit unsandboxed fallback enabled', async () => {
    const original = process.env.LUMENFLOW_SANDBOX_ALLOW_UNSANDBOXED;

    process.env.LUMENFLOW_SANDBOX_ALLOW_UNSANDBOXED = '1';
    try {
      const exitCode = await runWuSandbox({
        id: 'WU-1687',
        worktree: process.cwd(),
        command: [process.execPath, '-e', 'process.exit(0)'],
        cwd: process.cwd(),
      });

      expect(exitCode).toBe(0);
    } finally {
      if (original === undefined) {
        process.env.LUMENFLOW_SANDBOX_ALLOW_UNSANDBOXED = undefined;
      } else {
        process.env.LUMENFLOW_SANDBOX_ALLOW_UNSANDBOXED = original;
      }
    }
  }, 30000);
});
