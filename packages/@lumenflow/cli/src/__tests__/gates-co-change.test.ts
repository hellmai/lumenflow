// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * WU-2368: Co-change gate tests for database-affecting WU safeguards.
 *
 * Tests the default DB co-change rules, actionable error messages,
 * and backwards compatibility with custom co-change patterns.
 */

import { describe, expect, it } from 'vitest';
import { evaluateCoChangeRules, DEFAULT_DB_CO_CHANGE_RULES } from '../gates-runners.js';
import type { CoChangeRuleConfig } from '@lumenflow/core/config-schema';

// ---------------------------------------------------------------------------
// Pre-existing tests (co-change gate rule evaluation)
// ---------------------------------------------------------------------------
describe('co-change gate rule evaluation', () => {
  const baseRule: CoChangeRuleConfig = {
    name: 'schema-migration',
    trigger_patterns: ['db/schema/**'],
    require_patterns: ['db/migrations/**'],
    severity: 'error',
  };

  it('reports error when trigger matches without require matches', () => {
    const result = evaluateCoChangeRules({
      changedFiles: ['db/schema/tables.sql'],
      rules: [baseRule],
    });

    expect(result.errors).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
  });

  it('passes when trigger and require patterns both match', () => {
    const result = evaluateCoChangeRules({
      changedFiles: ['db/schema/tables.sql', 'db/migrations/20260301_add_table.sql'],
      rules: [baseRule],
    });

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('skips rule when no trigger pattern matches', () => {
    const result = evaluateCoChangeRules({
      changedFiles: ['docs/readme.md'],
      rules: [baseRule],
    });

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns but does not error when severity is warn', () => {
    const result = evaluateCoChangeRules({
      changedFiles: ['db/schema/tables.sql'],
      rules: [{ ...baseRule, severity: 'warn' }],
    });

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });

  it('skips rule when severity is off', () => {
    const result = evaluateCoChangeRules({
      changedFiles: ['db/schema/tables.sql'],
      rules: [{ ...baseRule, severity: 'off' }],
    });

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// WU-2368: Default DB co-change rules
// ---------------------------------------------------------------------------
describe('WU-2368: Default DB co-change rules', () => {
  it('should export DEFAULT_DB_CO_CHANGE_RULES as a non-empty array', () => {
    expect(DEFAULT_DB_CO_CHANGE_RULES).toBeDefined();
    expect(Array.isArray(DEFAULT_DB_CO_CHANGE_RULES)).toBe(true);
    expect(DEFAULT_DB_CO_CHANGE_RULES.length).toBeGreaterThan(0);
  });

  it('should include a schema-requires-migration rule', () => {
    const schemaRule = DEFAULT_DB_CO_CHANGE_RULES.find(
      (r) => r.name === 'schema-requires-migration',
    );
    expect(schemaRule).toBeDefined();
    expect(schemaRule!.trigger_patterns.length).toBeGreaterThan(0);
    expect(schemaRule!.require_patterns.length).toBeGreaterThan(0);
    expect(schemaRule!.severity).toBe('error');
  });

  it('should have guidance text on each default rule', () => {
    for (const rule of DEFAULT_DB_CO_CHANGE_RULES) {
      expect(rule.guidance).toBeDefined();
      expect(typeof rule.guidance).toBe('string');
      expect(rule.guidance!.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// WU-2368: evaluateCoChangeRules with DB defaults
// ---------------------------------------------------------------------------
describe('WU-2368: evaluateCoChangeRules with DB defaults', () => {
  it('should fail when schema file changes without migration companion', () => {
    const changedFiles = ['supabase/schema.sql'];
    const result = evaluateCoChangeRules({
      changedFiles,
      rules: DEFAULT_DB_CO_CHANGE_RULES,
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('schema-requires-migration');
  });

  it('should pass when schema file changes with migration companion', () => {
    const changedFiles = ['supabase/schema.sql', 'supabase/migrations/20260310_add_table.sql'];
    const result = evaluateCoChangeRules({
      changedFiles,
      rules: DEFAULT_DB_CO_CHANGE_RULES,
    });
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when prisma schema changes without migration', () => {
    const changedFiles = ['prisma/schema.prisma'];
    const result = evaluateCoChangeRules({
      changedFiles,
      rules: DEFAULT_DB_CO_CHANGE_RULES,
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should pass when prisma schema changes with migration', () => {
    const changedFiles = [
      'prisma/schema.prisma',
      'prisma/migrations/20260310_migration/migration.sql',
    ];
    const result = evaluateCoChangeRules({
      changedFiles,
      rules: DEFAULT_DB_CO_CHANGE_RULES,
    });
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when drizzle schema changes without migration', () => {
    const changedFiles = ['src/db/schema.ts'];
    const result = evaluateCoChangeRules({
      changedFiles,
      rules: DEFAULT_DB_CO_CHANGE_RULES,
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should include actionable guidance in error messages', () => {
    const changedFiles = ['supabase/schema.sql'];
    const result = evaluateCoChangeRules({
      changedFiles,
      rules: DEFAULT_DB_CO_CHANGE_RULES,
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/migration|companion/i);
  });

  it('should not trigger on unrelated file changes', () => {
    const changedFiles = ['src/components/Button.tsx', 'README.md'];
    const result = evaluateCoChangeRules({
      changedFiles,
      rules: DEFAULT_DB_CO_CHANGE_RULES,
    });
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// WU-2368: Backwards compatibility
// ---------------------------------------------------------------------------
describe('WU-2368: Backwards compatibility with custom co-change patterns', () => {
  it('should evaluate custom rules alongside defaults', () => {
    const customRules: CoChangeRuleConfig[] = [
      {
        name: 'api-requires-docs',
        trigger_patterns: ['src/api/**/*.ts'],
        require_patterns: ['docs/api/**/*.md'],
        severity: 'warn',
      },
    ];

    const changedFiles = ['src/api/users.ts'];
    const result = evaluateCoChangeRules({
      changedFiles,
      rules: [...DEFAULT_DB_CO_CHANGE_RULES, ...customRules],
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('api-requires-docs');
  });

  it('should allow disabling a default rule via severity off', () => {
    const overriddenRules: CoChangeRuleConfig[] = DEFAULT_DB_CO_CHANGE_RULES.map((rule) => ({
      ...rule,
      severity: 'off' as const,
    }));

    const changedFiles = ['supabase/schema.sql'];
    const result = evaluateCoChangeRules({
      changedFiles,
      rules: overriddenRules,
    });
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// WU-2368: Guidance field in error output
// ---------------------------------------------------------------------------
describe('WU-2368: evaluateCoChangeRules guidance field', () => {
  it('should include guidance text in error output when present on rule', () => {
    const rules: CoChangeRuleConfig[] = [
      {
        name: 'test-rule',
        trigger_patterns: ['src/**/*.ts'],
        require_patterns: ['tests/**/*.test.ts'],
        severity: 'error',
        guidance: 'Add a companion test file. Run `pnpm test:generate` to scaffold.',
      },
    ];

    const changedFiles = ['src/foo.ts'];
    const result = evaluateCoChangeRules({ changedFiles, rules });
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('pnpm test:generate');
  });

  it('should work without guidance field (backwards compatible)', () => {
    const rules: CoChangeRuleConfig[] = [
      {
        name: 'legacy-rule',
        trigger_patterns: ['src/**/*.ts'],
        require_patterns: ['tests/**/*.test.ts'],
        severity: 'error',
      },
    ];

    const changedFiles = ['src/foo.ts'];
    const result = evaluateCoChangeRules({ changedFiles, rules });
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('legacy-rule');
    expect(result.errors[0]).toContain('required patterns missing');
  });
});
