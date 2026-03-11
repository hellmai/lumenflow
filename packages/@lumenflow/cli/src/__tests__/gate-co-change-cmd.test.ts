// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * WU-2393: Unit tests for gate:co-change command.
 *
 * Tests argument parsing, pure mutation logic (add/remove/edit),
 * glob validation, list formatting, and edge cases.
 */

import { describe, expect, it } from 'vitest';
import {
  parseGateCoChangeArgs,
  applyAddRule,
  applyRemoveRule,
  applyEditRule,
  validateGlobPattern,
  formatRuleList,
} from '../gate-co-change.js';
import type { CoChangeRuleConfig } from '@lumenflow/core/config-schema';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const sampleRule: CoChangeRuleConfig = {
  name: 'route-requires-test',
  trigger_patterns: ['src/app/api/**/route.ts'],
  require_patterns: ['src/app/api/**/__tests__/route.test.ts'],
  severity: 'error',
};

const sampleRuleWithGuidance: CoChangeRuleConfig = {
  ...sampleRule,
  name: 'api-with-guidance',
  guidance: 'API routes must have a sibling test file',
};

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

describe('parseGateCoChangeArgs', () => {
  it('parses --add with all flags', () => {
    const result = parseGateCoChangeArgs([
      '--add',
      '--name',
      'my-rule',
      '--trigger',
      'src/**/*.ts',
      '--require',
      'tests/**/*.test.ts',
      '--severity',
      'warn',
      '--guidance',
      'Add tests',
    ]);
    expect(result.operation).toBe('add');
    expect(result.name).toBe('my-rule');
    expect(result.triggers).toEqual(['src/**/*.ts']);
    expect(result.requires).toEqual(['tests/**/*.test.ts']);
    expect(result.severity).toBe('warn');
    expect(result.guidance).toBe('Add tests');
  });

  it('parses --add with multiple triggers and requires', () => {
    const result = parseGateCoChangeArgs([
      '--add',
      '--name',
      'multi',
      '--trigger',
      'src/**/*.ts',
      '--trigger',
      'lib/**/*.ts',
      '--require',
      'tests/**/*.test.ts',
      '--require',
      'e2e/**/*.spec.ts',
    ]);
    expect(result.triggers).toEqual(['src/**/*.ts', 'lib/**/*.ts']);
    expect(result.requires).toEqual(['tests/**/*.test.ts', 'e2e/**/*.spec.ts']);
  });

  it('parses --remove with name', () => {
    const result = parseGateCoChangeArgs(['--remove', '--name', 'my-rule']);
    expect(result.operation).toBe('remove');
    expect(result.name).toBe('my-rule');
  });

  it('parses --edit with severity change', () => {
    const result = parseGateCoChangeArgs(['--edit', '--name', 'my-rule', '--severity', 'warn']);
    expect(result.operation).toBe('edit');
    expect(result.name).toBe('my-rule');
    expect(result.severity).toBe('warn');
  });

  it('parses --list', () => {
    const result = parseGateCoChangeArgs(['--list']);
    expect(result.operation).toBe('list');
  });

  it('throws on missing operation', () => {
    expect(() => parseGateCoChangeArgs(['--name', 'foo'])).toThrow(/operation is required/i);
  });

  it('throws on --add without name', () => {
    expect(() =>
      parseGateCoChangeArgs(['--add', '--trigger', 'x', '--require', 'y']),
    ).toThrow(/--name is required/i);
  });

  it('throws on --add without trigger', () => {
    expect(() =>
      parseGateCoChangeArgs(['--add', '--name', 'foo', '--require', 'y']),
    ).toThrow(/--trigger is required/i);
  });

  it('throws on --add without require', () => {
    expect(() =>
      parseGateCoChangeArgs(['--add', '--name', 'foo', '--trigger', 'x']),
    ).toThrow(/--require is required/i);
  });

  it('throws on --remove without name', () => {
    expect(() => parseGateCoChangeArgs(['--remove'])).toThrow(/--name is required/i);
  });

  it('throws on --edit without name', () => {
    expect(() => parseGateCoChangeArgs(['--edit', '--severity', 'warn'])).toThrow(
      /--name is required/i,
    );
  });

  it('throws on --edit without any edit flag', () => {
    expect(() => parseGateCoChangeArgs(['--edit', '--name', 'foo'])).toThrow(
      /at least one edit flag/i,
    );
  });

  it('throws on invalid severity', () => {
    expect(() =>
      parseGateCoChangeArgs([
        '--add',
        '--name',
        'foo',
        '--trigger',
        'x',
        '--require',
        'y',
        '--severity',
        'critical',
      ]),
    ).toThrow(/must be one of/i);
  });
});

// ---------------------------------------------------------------------------
// applyAddRule
// ---------------------------------------------------------------------------

describe('applyAddRule', () => {
  it('adds a new rule to empty list', () => {
    const result = applyAddRule([], {
      operation: 'add',
      name: 'new-rule',
      triggers: ['src/**/*.ts'],
      requires: ['tests/**/*.test.ts'],
      severity: 'warn',
    });
    expect(result.ok).toBe(true);
    expect(result.rules).toHaveLength(1);
    expect(result.rules![0].name).toBe('new-rule');
    expect(result.rules![0].severity).toBe('warn');
  });

  it('adds a rule with guidance', () => {
    const result = applyAddRule([], {
      operation: 'add',
      name: 'with-guidance',
      triggers: ['src/**/*.ts'],
      requires: ['tests/**/*.test.ts'],
      guidance: 'Run pnpm test:generate',
    });
    expect(result.ok).toBe(true);
    expect(result.rules![0].guidance).toBe('Run pnpm test:generate');
  });

  it('defaults severity to error', () => {
    const result = applyAddRule([], {
      operation: 'add',
      name: 'default-severity',
      triggers: ['src/**/*.ts'],
      requires: ['tests/**/*.test.ts'],
    });
    expect(result.ok).toBe(true);
    expect(result.rules![0].severity).toBe('error');
  });

  it('rejects duplicate name', () => {
    const result = applyAddRule([sampleRule], {
      operation: 'add',
      name: 'route-requires-test',
      triggers: ['x'],
      requires: ['y'],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('preserves existing rules when adding', () => {
    const result = applyAddRule([sampleRule], {
      operation: 'add',
      name: 'new-rule',
      triggers: ['x/**'],
      requires: ['y/**'],
    });
    expect(result.ok).toBe(true);
    expect(result.rules).toHaveLength(2);
    expect(result.rules![0].name).toBe('route-requires-test');
    expect(result.rules![1].name).toBe('new-rule');
  });
});

// ---------------------------------------------------------------------------
// applyRemoveRule
// ---------------------------------------------------------------------------

describe('applyRemoveRule', () => {
  it('removes a custom rule by name', () => {
    const result = applyRemoveRule([sampleRule], {
      operation: 'remove',
      name: 'route-requires-test',
    });
    expect(result.ok).toBe(true);
    expect(result.rules).toHaveLength(0);
  });

  it('errors on unknown rule name', () => {
    const result = applyRemoveRule([sampleRule], {
      operation: 'remove',
      name: 'nonexistent',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not found');
    expect(result.error).toContain('route-requires-test');
  });

  it('errors on empty rules list', () => {
    const result = applyRemoveRule([], {
      operation: 'remove',
      name: 'nonexistent',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No custom rules configured');
  });

  it('blocks removal of built-in rule names', () => {
    const result = applyRemoveRule([], {
      operation: 'remove',
      name: 'schema-requires-migration',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('built-in rule');
    expect(result.error).toContain('include_builtin_co_change_defaults');
  });
});

// ---------------------------------------------------------------------------
// applyEditRule
// ---------------------------------------------------------------------------

describe('applyEditRule', () => {
  it('edits severity of existing rule', () => {
    const result = applyEditRule([sampleRule], {
      operation: 'edit',
      name: 'route-requires-test',
      severity: 'warn',
    });
    expect(result.ok).toBe(true);
    expect(result.rules![0].severity).toBe('warn');
    // Other fields unchanged
    expect(result.rules![0].trigger_patterns).toEqual(sampleRule.trigger_patterns);
    expect(result.rules![0].require_patterns).toEqual(sampleRule.require_patterns);
  });

  it('overwrites trigger_patterns entirely', () => {
    const result = applyEditRule([sampleRule], {
      operation: 'edit',
      name: 'route-requires-test',
      triggers: ['new/**/*.ts', 'another/**/*.ts'],
    });
    expect(result.ok).toBe(true);
    expect(result.rules![0].trigger_patterns).toEqual(['new/**/*.ts', 'another/**/*.ts']);
  });

  it('overwrites require_patterns entirely', () => {
    const result = applyEditRule([sampleRule], {
      operation: 'edit',
      name: 'route-requires-test',
      requires: ['new-tests/**/*.test.ts'],
    });
    expect(result.ok).toBe(true);
    expect(result.rules![0].require_patterns).toEqual(['new-tests/**/*.test.ts']);
  });

  it('adds guidance to existing rule', () => {
    const result = applyEditRule([sampleRule], {
      operation: 'edit',
      name: 'route-requires-test',
      guidance: 'New guidance text',
    });
    expect(result.ok).toBe(true);
    expect(result.rules![0].guidance).toBe('New guidance text');
  });

  it('errors on unknown rule name', () => {
    const result = applyEditRule([sampleRule], {
      operation: 'edit',
      name: 'nonexistent',
      severity: 'warn',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('does not mutate original rules array', () => {
    const original = [{ ...sampleRule }];
    applyEditRule(original, {
      operation: 'edit',
      name: 'route-requires-test',
      severity: 'off',
    });
    expect(original[0].severity).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// validateGlobPattern
// ---------------------------------------------------------------------------

describe('validateGlobPattern', () => {
  it('accepts valid glob patterns', () => {
    expect(validateGlobPattern('src/**/*.ts').ok).toBe(true);
    expect(validateGlobPattern('tests/**/__tests__/*.test.ts').ok).toBe(true);
    expect(validateGlobPattern('*.{js,ts}').ok).toBe(true);
    expect(validateGlobPattern('docs/api/**/*.md').ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatRuleList
// ---------------------------------------------------------------------------

describe('formatRuleList', () => {
  it('shows built-in and custom rules', () => {
    const output = formatRuleList([sampleRule], true);
    expect(output).toContain('[built-in]');
    expect(output).toContain('[custom]');
    expect(output).toContain('route-requires-test');
    expect(output).toContain('schema-requires-migration');
  });

  it('shows disabled built-ins message', () => {
    const output = formatRuleList([sampleRule], false);
    expect(output).toContain('disabled');
    expect(output).not.toContain('[built-in]');
    expect(output).toContain('[custom]');
  });

  it('shows (none) for empty custom rules', () => {
    const output = formatRuleList([], true);
    expect(output).toContain('(none)');
  });

  it('shows guidance when present', () => {
    const output = formatRuleList([sampleRuleWithGuidance], true);
    expect(output).toContain('guidance:');
    expect(output).toContain('API routes must have a sibling test file');
  });

  it('shows severity in rule entry', () => {
    const output = formatRuleList([sampleRule], true);
    expect(output).toContain('severity: error');
  });

  it('shows trigger and require patterns', () => {
    const output = formatRuleList([sampleRule], true);
    expect(output).toContain('triggers: src/app/api/**/route.ts');
    expect(output).toContain('requires: src/app/api/**/__tests__/route.test.ts');
  });
});
