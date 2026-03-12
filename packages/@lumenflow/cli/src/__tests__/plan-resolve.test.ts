// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Tests for plan file resolution (WU-2364)
 *
 * Verifies that plan:edit/promote can find plan files without
 * forcing a naming convention on consumers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Test constants */
const TEST_PLANS_DIR = 'docs/plans';
const TEST_INIT_DIR = 'docs/operations/tasks/initiatives';

// Mock WU_PATHS to use test directories
vi.mock('@lumenflow/core/wu-paths', () => ({
  WU_PATHS: {
    PLANS_DIR: () => TEST_PLANS_DIR,
    INITIATIVE: (id: string) => `${TEST_INIT_DIR}/${id}.yaml`,
  },
}));

vi.mock('@lumenflow/core/error-handler', () => ({
  die: vi.fn((msg: string) => {
    throw new Error(msg);
  }),
}));

describe('plan-resolve', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `plan-resolve-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('parseRelatedPlanUri', () => {
    it('should extract filename from lumenflow://plans/ URI', async () => {
      const { parseRelatedPlanUri } = await import('../plan-resolve.js');
      expect(parseRelatedPlanUri('lumenflow://plans/my-plan.md')).toBe('my-plan.md');
      expect(parseRelatedPlanUri('lumenflow://plans/INIT-40-security.md')).toBe(
        'INIT-40-security.md',
      );
    });

    it('should return undefined for non-plan URIs', async () => {
      const { parseRelatedPlanUri } = await import('../plan-resolve.js');
      expect(parseRelatedPlanUri('https://example.com/plan.md')).toBeUndefined();
      expect(parseRelatedPlanUri('some-file.md')).toBeUndefined();
    });
  });

  describe('readInitiativeRelatedPlan', () => {
    it('should extract related_plan from initiative YAML', async () => {
      const { readInitiativeRelatedPlan } = await import('../plan-resolve.js');
      const initPath = join(tempDir, 'INIT-040.yaml');
      writeFileSync(
        initPath,
        `id: INIT-040
title: Test Initiative
related_plan: lumenflow://plans/INIT-40-security-and-migration.md
status: active
`,
      );
      expect(readInitiativeRelatedPlan(initPath)).toBe(
        'lumenflow://plans/INIT-40-security-and-migration.md',
      );
    });

    it('should return undefined when no related_plan field', async () => {
      const { readInitiativeRelatedPlan } = await import('../plan-resolve.js');
      const initPath = join(tempDir, 'INIT-040.yaml');
      writeFileSync(
        initPath,
        `id: INIT-040
title: Test Initiative
status: active
`,
      );
      expect(readInitiativeRelatedPlan(initPath)).toBeUndefined();
    });

    it('should return undefined when file does not exist', async () => {
      const { readInitiativeRelatedPlan } = await import('../plan-resolve.js');
      expect(readInitiativeRelatedPlan(join(tempDir, 'nonexistent.yaml'))).toBeUndefined();
    });
  });

  describe('findPlansByIdPrefix', () => {
    it('should find plan files matching ID prefix', async () => {
      const { findPlansByIdPrefix } = await import('../plan-resolve.js');
      const plansDir = join(tempDir, 'plans');
      mkdirSync(plansDir, { recursive: true });
      writeFileSync(join(plansDir, 'INIT-40-security-and-migration.md'), '# Plan');
      writeFileSync(join(plansDir, 'INIT-41-other.md'), '# Other');

      const results = findPlansByIdPrefix(plansDir, 'INIT-40');
      expect(results).toHaveLength(1);
      expect(results[0]).toContain('INIT-40-security-and-migration.md');
    });

    it('should return multiple matches when ambiguous', async () => {
      const { findPlansByIdPrefix } = await import('../plan-resolve.js');
      const plansDir = join(tempDir, 'plans');
      mkdirSync(plansDir, { recursive: true });
      writeFileSync(join(plansDir, 'WU-100-plan-a.md'), '# Plan A');
      writeFileSync(join(plansDir, 'WU-100-plan-b.md'), '# Plan B');

      const results = findPlansByIdPrefix(plansDir, 'WU-100');
      expect(results).toHaveLength(2);
    });

    it('should return empty array when plansDir does not exist', async () => {
      const { findPlansByIdPrefix } = await import('../plan-resolve.js');
      const results = findPlansByIdPrefix(join(tempDir, 'nonexistent'), 'WU-100');
      expect(results).toHaveLength(0);
    });
  });

  describe('resolvePlanFile', () => {
    it('should resolve via --file flag', async () => {
      const { resolvePlanFile } = await import('../plan-resolve.js');
      const plansDir = join(tempDir, TEST_PLANS_DIR);
      mkdirSync(plansDir, { recursive: true });
      writeFileSync(join(plansDir, 'my-custom-plan.md'), '# Plan');

      const result = resolvePlanFile({
        id: 'WU-100',
        file: 'my-custom-plan.md',
        baseDir: tempDir,
      });
      expect(result).toContain('my-custom-plan.md');
    });

    it('should error when --file points to nonexistent file', async () => {
      const { resolvePlanFile } = await import('../plan-resolve.js');
      const plansDir = join(tempDir, TEST_PLANS_DIR);
      mkdirSync(plansDir, { recursive: true });

      expect(() =>
        resolvePlanFile({ id: 'WU-100', file: 'nonexistent.md', baseDir: tempDir }),
      ).toThrow('Plan file not found');
    });

    it('should resolve via initiative related_plan for INIT IDs', async () => {
      const { resolvePlanFile } = await import('../plan-resolve.js');

      // Create initiative YAML with related_plan
      const initDir = join(tempDir, TEST_INIT_DIR);
      mkdirSync(initDir, { recursive: true });
      writeFileSync(
        join(initDir, 'INIT-040.yaml'),
        `id: INIT-040
related_plan: lumenflow://plans/INIT-40-security-and-migration.md
`,
      );

      // Create the plan file
      const plansDir = join(tempDir, TEST_PLANS_DIR);
      mkdirSync(plansDir, { recursive: true });
      writeFileSync(join(plansDir, 'INIT-40-security-and-migration.md'), '# Plan');

      const result = resolvePlanFile({ id: 'INIT-040', baseDir: tempDir });
      expect(result).toContain('INIT-40-security-and-migration.md');
    });

    it('should resolve via glob fallback when one match found', async () => {
      const { resolvePlanFile } = await import('../plan-resolve.js');
      const plansDir = join(tempDir, TEST_PLANS_DIR);
      mkdirSync(plansDir, { recursive: true });
      writeFileSync(join(plansDir, 'WU-200-my-feature-plan.md'), '# Plan');

      const result = resolvePlanFile({ id: 'WU-200', baseDir: tempDir });
      expect(result).toContain('WU-200-my-feature-plan.md');
    });

    it('should error with list when multiple glob matches', async () => {
      const { resolvePlanFile } = await import('../plan-resolve.js');
      const plansDir = join(tempDir, TEST_PLANS_DIR);
      mkdirSync(plansDir, { recursive: true });
      writeFileSync(join(plansDir, 'WU-300-plan-a.md'), '# A');
      writeFileSync(join(plansDir, 'WU-300-plan-b.md'), '# B');

      expect(() => resolvePlanFile({ id: 'WU-300', baseDir: tempDir })).toThrow(
        'Multiple plan files found',
      );
    });

    it('should error when no plan found at all', async () => {
      const { resolvePlanFile } = await import('../plan-resolve.js');
      const plansDir = join(tempDir, TEST_PLANS_DIR);
      mkdirSync(plansDir, { recursive: true });

      expect(() => resolvePlanFile({ id: 'WU-999', baseDir: tempDir })).toThrow(
        'No plan file found',
      );
    });
  });
});
