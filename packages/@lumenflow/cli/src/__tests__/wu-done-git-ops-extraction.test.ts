// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('wu:done git operations extraction (WU-2163)', () => {
  it('routes git-operation helpers through wu-done-git-ops module', () => {
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const filePath = path.join(thisDir, '..', 'wu-done.ts');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toContain("from './wu-done-git-ops.js'");
    expect(content).not.toContain('async function ensureMainUpToDate(');
    expect(content).not.toContain('async function validateStagedFiles(');
    expect(content).not.toContain('async function validateBranchOnlyMode(');
  });
});
