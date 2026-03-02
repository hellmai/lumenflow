// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('WU-2167: mode execution extraction', () => {
  it('routes mode-specific completion through dedicated module', async () => {
    const source = await readFile(new URL('../wu-done.ts', import.meta.url), 'utf-8');

    expect(source).toContain("from './wu-done-mode-execution.js'");
    expect(source).not.toContain('executeBranchOnlyCompletion(');
    expect(source).not.toContain('executeBranchPRCompletion(');
    expect(source).not.toContain('detectAlreadyMergedNoWorktree(');
  });
});
