// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveIncrementalTestCommand } from '../gates-runners.js';

describe('resolveIncrementalTestCommand (WU-1678)', () => {
  it('hardens vitest --changed commands with stable args', () => {
    const resolved = resolveIncrementalTestCommand({
      testRunner: 'vitest',
      configuredIncrementalCommand: 'pnpm vitest run --changed origin/main',
    });

    expect(resolved).toContain('pnpm vitest run');
    expect(resolved).toContain('--changed origin/main');
    expect(resolved).toContain('--maxWorkers=1');
    expect(resolved).toContain('--teardownTimeout=30000');
  });

  it('uses stable vitest incremental command when no config command is provided', () => {
    const resolved = resolveIncrementalTestCommand({
      testRunner: 'vitest',
      configuredIncrementalCommand: undefined,
    });

    expect(resolved).toContain('pnpm vitest run');
    expect(resolved).toContain('--changed origin/main');
  });

  it('preserves custom vitest command that does not use --changed', () => {
    const resolved = resolveIncrementalTestCommand({
      testRunner: 'vitest',
      configuredIncrementalCommand:
        'pnpm vitest run packages/@lumenflow/cli/src/__tests__/wu-done.test.ts',
    });

    expect(resolved).toBe('pnpm vitest run packages/@lumenflow/cli/src/__tests__/wu-done.test.ts');
  });

  it('preserves non-vitest incremental commands', () => {
    const resolved = resolveIncrementalTestCommand({
      testRunner: 'jest',
      configuredIncrementalCommand: 'npm test -- --onlyChanged',
    });

    expect(resolved).toBe('npm test -- --onlyChanged');
  });
});

describe('WU-2448: conditional gate commands', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots) {
      rmSync(root, { recursive: true, force: true });
    }
    tempRoots.length = 0;
    vi.restoreAllMocks();
  });

  it('schema accepts conditional_commands with severity and optional guidance fields', async () => {
    const { GatesConfigSchema } = await import('@lumenflow/core/config-schema');

    const parsed = GatesConfigSchema.parse({
      conditional_commands: [
        {
          trigger_patterns: ['supabase/migrations/**'],
          command: 'pnpm db:verify',
          severity: 'warn',
          guidance: 'Apply migrations locally before verifying.',
          guidance_ref: 'docs/db-verification.md',
        },
      ],
    });

    expect(parsed.conditional_commands).toEqual([
      expect.objectContaining({
        trigger_patterns: ['supabase/migrations/**'],
        command: 'pnpm db:verify',
        severity: 'warn',
        guidance: 'Apply migrations locally before verifying.',
        guidance_ref: 'docs/db-verification.md',
      }),
    ]);
  });

  it('skips conditional commands silently when changed files do not match trigger patterns', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gates-conditional-skip-'));
    tempRoots.push(root);

    writeFileSync(
      path.join(root, 'workspace.yaml'),
      YAML.stringify({
        software_delivery: {
          gates: {
            conditional_commands: [
              {
                trigger_patterns: ['supabase/migrations/**'],
                command: 'pnpm db:verify',
                severity: 'error',
              },
            ],
          },
        },
      }),
      'utf-8',
    );

    const { runMigrationVerifyGate } = await import('../gates-runners.js');
    const gitAdapter = await import('@lumenflow/core/git-adapter');
    const gatesUtils = await import('../gates-utils.js');

    vi.spyOn(gitAdapter, 'createGitForPath').mockReturnValue({
      raw: vi
        .fn()
        .mockResolvedValueOnce('docs/README.md\n')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(''),
    } as ReturnType<typeof gitAdapter.createGitForPath>);

    const runSpy = vi.spyOn(gatesUtils, 'run').mockReturnValue({ ok: true, duration: 1 });
    const result = await runMigrationVerifyGate({ cwd: root, useAgentMode: false, agentLog: null });

    expect(result.ok).toBe(true);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('warn-level conditional command failures produce warnings instead of errors', async () => {
    const { evaluateConditionalCommandFailure } = await import('../gates-runners.js');

    const result = evaluateConditionalCommandFailure({
      trigger_patterns: ['supabase/migrations/**'],
      command: 'pnpm db:verify',
      severity: 'warn',
      guidance: 'Verify the database state before retrying.',
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      expect.stringContaining('warn-level conditional command failed: pnpm db:verify'),
    ]);
    expect(result.warnings[0]).toContain('Verify the database state before retrying.');
  });

  it('error-level conditional command failures produce blocking errors', async () => {
    const { evaluateConditionalCommandFailure, getMatchingConditionalCommandsForPaths } =
      await import('../gates-runners.js');

    const commands = getMatchingConditionalCommandsForPaths({
      filePaths: ['supabase/migrations/20260314_add_table.sql'],
      commands: [
        {
          trigger_patterns: ['supabase/migrations/**'],
          command: 'pnpm db:verify',
          severity: 'error',
          guidance: 'Fix DB verification before retrying gates.',
        },
      ],
    });

    expect(commands).toHaveLength(1);

    const result = evaluateConditionalCommandFailure(commands[0]);

    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([expect.stringContaining('conditional command failed')]);
    expect(result.errors[0]).toContain('Fix DB verification before retrying gates.');
  });
});
