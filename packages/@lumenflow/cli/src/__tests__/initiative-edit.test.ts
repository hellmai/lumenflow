// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';

import {
  applyEdits,
  applyArrayEdits,
  buildNoEditsMessage,
  formatRetryExhaustionError,
  hasAnyEdits,
  INITIATIVE_EDIT_PUSH_RETRY_OVERRIDE,
  isRetryExhaustionError,
  validateEditArgs,
} from '../initiative-edit.js';

const METRIC_ONE = 'Metric one';
const METRIC_TWO = 'Metric two';
const NEW_METRIC = 'New metric';
const PHASE_ONE_TITLE = 'Phase 1: Mechanical Splits';
const PHASE_ONE_RENAMED = 'Phase 1: State-Machine Foundation';

describe('initiative:edit requireRemote:false support (WU-1497)', () => {
  it('should not call ensureMainUpToDate directly (micro-worktree handles origin sync)', () => {
    // Read the source file to verify it does not call ensureMainUpToDate
    // This is a structural test: initiative-edit must not perform its own origin fetch
    // because withMicroWorktree already handles requireRemote-aware origin sync
    const sourceFile = fs.readFileSync(new URL('../initiative-edit.ts', import.meta.url), 'utf-8');

    // The source should NOT contain a function call to ensureMainUpToDate
    // (comments mentioning it are fine; only actual await/call invocations are the bug)
    const mainFunctionMatch = sourceFile.match(/async function main\(\)[\s\S]*?^}/m);
    expect(mainFunctionMatch).not.toBeNull();
    const mainBody = mainFunctionMatch![0];

    // Match actual function calls: await ensureMainUpToDate( or ensureMainUpToDate(
    expect(mainBody).not.toMatch(/(?:await\s+)?ensureMainUpToDate\s*\(/);
  });

  it('should not import ensureMainUpToDate from wu-helpers', () => {
    const sourceFile = fs.readFileSync(new URL('../initiative-edit.ts', import.meta.url), 'utf-8');

    // Should not import ensureMainUpToDate at all (clean imports)
    expect(sourceFile).not.toMatch(/import.*ensureMainUpToDate.*from/);
  });
});

describe('initiative:edit success metric editing', () => {
  it('removes exact success metric matches', () => {
    const updated = {
      success_metrics: [METRIC_ONE, METRIC_TWO],
    };

    applyArrayEdits(updated, {
      removeSuccessMetric: [METRIC_ONE],
    });

    expect(updated.success_metrics).toEqual([METRIC_TWO]);
  });

  it('is idempotent when removing absent metric', () => {
    const updated = {
      success_metrics: [METRIC_ONE],
    };

    applyArrayEdits(updated, {
      removeSuccessMetric: [METRIC_TWO],
    });

    expect(updated.success_metrics).toEqual([METRIC_ONE]);
  });

  it('applies remove after add in same invocation', () => {
    const updated = {
      success_metrics: [METRIC_ONE],
    };

    applyArrayEdits(updated, {
      addSuccessMetric: [NEW_METRIC],
      removeSuccessMetric: [NEW_METRIC],
    });

    expect(updated.success_metrics).toEqual([METRIC_ONE]);
  });

  it('treats remove-success-metric as an edit for validation', () => {
    expect(hasAnyEdits({ removeSuccessMetric: [METRIC_ONE] })).toBe(true);
  });

  it('documents remove-success-metric in no-edits help output', () => {
    expect(buildNoEditsMessage()).toContain('--remove-success-metric <text>');
  });

  it('documents phase-title in no-edits help output', () => {
    expect(buildNoEditsMessage()).toContain('--phase-id <id> --phase-title <title>');
  });

  it('accepts schema-valid initiative:edit options', () => {
    const result = validateEditArgs({
      id: 'INIT-015',
      status: 'in_progress',
      addLane: ['Framework: CLI'],
      removeSuccessMetric: [METRIC_ONE],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects invalid status via shared schema validator', () => {
    const result = validateEditArgs({
      id: 'INIT-015',
      status: 'not-a-real-status',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('status'))).toBe(true);
  });

  it('normalizes phaseTitle to phase_title in shared validator payload', () => {
    const result = validateEditArgs({
      id: 'INIT-015',
      phaseId: '1',
      phaseTitle: PHASE_ONE_RENAMED,
    });

    expect(result.valid).toBe(true);
    expect(result.normalized.phase_id).toBe('1');
    expect(result.normalized.phase_title).toBe(PHASE_ONE_RENAMED);
  });

  it('treats phase-title as an edit for no-op detection', () => {
    expect(hasAnyEdits({ phaseId: '1', phaseTitle: PHASE_ONE_RENAMED })).toBe(true);
  });
});

describe('initiative:edit phase title updates', () => {
  it('renames only the targeted phase title', () => {
    const original = {
      id: 'INIT-015',
      phases: [
        { id: 1, title: PHASE_ONE_TITLE, status: 'in_progress' },
        { id: 2, title: 'Phase 2: Mechanical Splits', status: 'pending' },
      ],
    };

    const updated = applyEdits(original, {
      phaseId: '1',
      phaseTitle: PHASE_ONE_RENAMED,
    });

    expect(updated.phases[0].title).toBe(PHASE_ONE_RENAMED);
    expect(updated.phases[1].title).toBe('Phase 2: Mechanical Splits');
    expect(updated.phases[0].status).toBe('in_progress');
  });
});

describe('initiative:edit phase_execution_order flag (WU-2354)', () => {
  it('applies phase_execution_order to initiative', () => {
    const original = {
      id: 'INIT-015',
      status: 'in_progress',
    };

    const updated = applyEdits(original, {
      id: 'INIT-015',
      phaseExecutionOrder: 'sequential',
    });

    expect(updated.phase_execution_order).toBe('sequential');
  });

  it('accepts parallel as valid phase_execution_order', () => {
    const original = {
      id: 'INIT-015',
      phase_execution_order: 'sequential',
    };

    const updated = applyEdits(original, {
      id: 'INIT-015',
      phaseExecutionOrder: 'parallel',
    });

    expect(updated.phase_execution_order).toBe('parallel');
  });

  it('treats phase_execution_order as an edit for no-op detection', () => {
    expect(hasAnyEdits({ id: 'INIT-015', phaseExecutionOrder: 'sequential' })).toBe(true);
  });

  it('documents --phase-execution-order in no-edits help output', () => {
    expect(buildNoEditsMessage()).toContain('--phase-execution-order');
  });

  it('validates phase_execution_order via shared schema validator', () => {
    const result = validateEditArgs({
      id: 'INIT-015',
      phaseExecutionOrder: 'sequential',
    });

    expect(result.valid).toBe(true);
  });

  it('rejects invalid phase_execution_order via shared schema validator', () => {
    const result = validateEditArgs({
      id: 'INIT-015',
      phaseExecutionOrder: 'invalid-order',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('phase_execution_order'))).toBe(true);
  });

  it('rejects invalid phase_execution_order via applyEdits validation', () => {
    const original = { id: 'INIT-015' };
    expect(() =>
      applyEdits(original, { id: 'INIT-015', phaseExecutionOrder: 'bad-value' }),
    ).toThrow();
  });
});

describe('initiative:edit dependency_model flag (WU-2354)', () => {
  it('applies dependency_model to initiative', () => {
    const original = {
      id: 'INIT-015',
      status: 'in_progress',
    };

    const updated = applyEdits(original, {
      id: 'INIT-015',
      dependencyModel: 'strict-phase-gate',
    });

    expect(updated.dependency_model).toBe('strict-phase-gate');
  });

  it('accepts any string value for dependency_model', () => {
    const original = {
      id: 'INIT-015',
    };

    const updated = applyEdits(original, {
      id: 'INIT-015',
      dependencyModel: 'custom-model-name',
    });

    expect(updated.dependency_model).toBe('custom-model-name');
  });

  it('treats dependency_model as an edit for no-op detection', () => {
    expect(hasAnyEdits({ id: 'INIT-015', dependencyModel: 'strict-phase-gate' })).toBe(true);
  });

  it('documents --dependency-model in no-edits help output', () => {
    expect(buildNoEditsMessage()).toContain('--dependency-model');
  });

  it('validates dependency_model via shared schema validator', () => {
    const result = validateEditArgs({
      id: 'INIT-015',
      dependencyModel: 'any-value',
    });

    expect(result.valid).toBe(true);
  });
});

describe('initiative:edit stale-read bug (WU-2434)', () => {
  it('execute callback must read initiative from worktreePath, not use pre-computed value', () => {
    // WU-2434: initiative:edit reads from local main (potentially stale) then writes
    // the result to the micro-worktree (fresh from origin/main). If local main is behind,
    // fields added to origin (e.g. wus: list) are silently dropped.
    //
    // The fix: the execute callback must read the initiative from worktreePath
    // so the base document reflects origin/main, not stale local main.
    const sourceFile = fs.readFileSync(new URL('../initiative-edit.ts', import.meta.url), 'utf-8');

    // Find the execute callback body inside withMicroWorktree
    const executeMatch = sourceFile.match(
      /execute:\s*async\s*\(\s*\{[^}]*worktreePath[^}]*\}\s*(?::[^)]+)?\)\s*=>\s*\{([\s\S]*?)\n\s{6}\}/,
    );
    expect(executeMatch).not.toBeNull();
    const executeBody = executeMatch![1];

    // The callback MUST read from the worktree path (not use a captured variable from outside)
    expect(executeBody).toMatch(/readFileSync\s*\(/);
    expect(executeBody).toMatch(/parseYAML\s*\(/);
    expect(executeBody).toMatch(/applyEdits\s*\(/);
  });

  it('applyEdits preserves unknown fields like wus through round-trip', () => {
    // Regression test: initiative files may contain fields not in InitiativeDoc interface
    // (e.g. wus, owner, target_date). These must survive the spread copy in applyEdits.
    const original = {
      id: 'INIT-042',
      status: 'in_progress',
      wus: [
        { id: 'WU-100', lane: 'Framework: CLI' },
        { id: 'WU-101', lane: 'Framework: Core' },
      ],
      owner: 'team-alpha',
      target_date: '2026-04-01',
    };

    const updated = applyEdits(original, {
      id: 'INIT-042',
      notes: 'Phase 2 started',
    });

    // All unknown fields must be preserved
    expect(updated.wus).toEqual([
      { id: 'WU-100', lane: 'Framework: CLI' },
      { id: 'WU-101', lane: 'Framework: Core' },
    ]);
    expect(updated.owner).toBe('team-alpha');
    expect(updated.target_date).toBe('2026-04-01');
    // And the edit was applied
    expect(updated.notes).toEqual(['Phase 2 started']);
  });
});

describe('initiative:edit retry handling (WU-1621)', () => {
  it('exports operation-level push retry override', () => {
    expect(INITIATIVE_EDIT_PUSH_RETRY_OVERRIDE).toEqual({
      retries: 8,
      min_delay_ms: 300,
      max_delay_ms: 4000,
    });
  });

  it('detects retry exhaustion errors', () => {
    expect(
      isRetryExhaustionError(new Error('Push failed after 3 attempts. Origin main is busy.')),
    ).toBe(true);
    expect(isRetryExhaustionError(new Error('Network timeout'))).toBe(false);
  });

  it('formats actionable retry exhaustion guidance', () => {
    const formatted = formatRetryExhaustionError(
      new Error('Push failed after 3 attempts. Origin main may have significant traffic.'),
      'INIT-015',
    );

    expect(formatted).toContain('Next steps:');
    expect(formatted).toContain('initiative:edit');
    expect(formatted).toContain('--id INIT-015');
  });
});
