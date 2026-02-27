/**
 * @file wu-edit-spec-file-runtime.test.ts
 * Test suite for WU-2239: wu:edit --spec-file preserves runtime fields
 *
 * Bug: wu:edit --spec-file replaces the entire YAML including runtime fields
 * (worktree_path, assigned_to, claimed_mode, session_id, claimed_at).
 * This creates a chicken-and-egg: subsequent wu:edit calls fail because
 * worktree_path is gone.
 *
 * Fix: loadSpecFile should merge user-provided fields with existing runtime
 * fields, preserving them from the original WU.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyEdits } from '../dist/wu-edit.js';

/**
 * Runtime fields that must be preserved when using --spec-file.
 * These are set by wu:claim and are required for subsequent operations.
 */
const RUNTIME_FIELDS = [
  'worktree_path',
  'assigned_to',
  'claimed_mode',
  'session_id',
  'claimed_at',
] as const;

describe('wu:edit --spec-file preserves runtime fields (WU-2239)', () => {
  let tmpDir: string;
  let specFilePath: string;

  const originalWU: Record<string, unknown> = {
    id: 'WU-2239',
    title: 'Original title',
    lane: 'Framework: CLI WU Commands',
    type: 'bug',
    status: 'in_progress',
    priority: 'P2',
    created: '2026-02-27',
    description: 'Original description',
    acceptance: ['Original criterion'],
    code_paths: ['packages/@lumenflow/cli/src/wu-edit.ts'],
    dependencies: [],
    risks: [],
    notes: 'Some notes',
    tests: { manual: [], unit: [], e2e: [] },
    artifacts: [],
    // Runtime fields set by wu:claim
    worktree_path: 'worktrees/framework-cli-wu-commands-wu-2239',
    assigned_to: 'tom@hellm.ai',
    claimed_mode: 'worktree',
    session_id: 'abc123-session',
    claimed_at: '2026-02-27T14:00:00.000Z',
  };

  // Spec file content that a user might provide -- no runtime fields
  const specFileContent = `id: WU-2239
title: Updated title from spec file
lane: "Framework: CLI WU Commands"
type: bug
status: in_progress
priority: P1
created: 2026-02-27
description: Updated description from spec file
acceptance:
  - New criterion from spec file
code_paths:
  - packages/@lumenflow/cli/src/wu-edit.ts
  - packages/@lumenflow/cli/src/wu-edit-operations.ts
dependencies: []
risks: []
notes: Updated notes
`;

  beforeAll(() => {
    tmpDir = join(tmpdir(), `wu-2239-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    specFilePath = join(tmpDir, 'spec.yaml');
    writeFileSync(specFilePath, specFileContent, 'utf-8');
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should preserve all runtime fields when --spec-file is used', () => {
    const result = applyEdits(originalWU, { specFile: specFilePath });

    for (const field of RUNTIME_FIELDS) {
      expect(result[field]).toBe(
        originalWU[field],
        `Runtime field "${field}" should be preserved from original WU`,
      );
    }
  });

  it('should preserve worktree_path when --spec-file is used', () => {
    const result = applyEdits(originalWU, { specFile: specFilePath });
    expect(result.worktree_path).toBe('worktrees/framework-cli-wu-commands-wu-2239');
  });

  it('should preserve assigned_to when --spec-file is used', () => {
    const result = applyEdits(originalWU, { specFile: specFilePath });
    expect(result.assigned_to).toBe('tom@hellm.ai');
  });

  it('should preserve claimed_mode when --spec-file is used', () => {
    const result = applyEdits(originalWU, { specFile: specFilePath });
    expect(result.claimed_mode).toBe('worktree');
  });

  it('should preserve session_id when --spec-file is used', () => {
    const result = applyEdits(originalWU, { specFile: specFilePath });
    expect(result.session_id).toBe('abc123-session');
  });

  it('should preserve claimed_at when --spec-file is used', () => {
    const result = applyEdits(originalWU, { specFile: specFilePath });
    expect(result.claimed_at).toBe('2026-02-27T14:00:00.000Z');
  });

  it('should still apply spec file content for non-runtime fields', () => {
    const result = applyEdits(originalWU, { specFile: specFilePath });

    // Spec file content should be applied
    expect(result.title).toBe('Updated title from spec file');
    expect(result.description).toBe('Updated description from spec file');
    expect(result.priority).toBe('P1');
  });

  it('should preserve id and status from original WU (existing behavior)', () => {
    const result = applyEdits(originalWU, { specFile: specFilePath });

    expect(result.id).toBe('WU-2239');
    expect(result.status).toBe('in_progress');
  });

  it('should allow spec file to override runtime fields if explicitly provided', () => {
    // If a spec file explicitly includes a runtime field, it should take precedence
    const specWithRuntime = `id: WU-2239
title: Updated title
lane: "Framework: CLI WU Commands"
type: bug
status: in_progress
priority: P1
created: 2026-02-27
description: Updated description
acceptance:
  - Criterion
code_paths:
  - packages/@lumenflow/cli/src/wu-edit.ts
dependencies: []
risks: []
assigned_to: other@hellm.ai
`;
    const specWithRuntimePath = join(tmpDir, 'spec-with-runtime.yaml');
    writeFileSync(specWithRuntimePath, specWithRuntime, 'utf-8');

    const result = applyEdits(originalWU, { specFile: specWithRuntimePath });

    // Spec file explicitly sets assigned_to, so it should override
    expect(result.assigned_to).toBe('other@hellm.ai');
    // But other runtime fields not in spec should still be preserved
    expect(result.worktree_path).toBe('worktrees/framework-cli-wu-commands-wu-2239');
    expect(result.claimed_mode).toBe('worktree');
    expect(result.session_id).toBe('abc123-session');
    expect(result.claimed_at).toBe('2026-02-27T14:00:00.000Z');
  });
});
