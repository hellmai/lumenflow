// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Tests for manual-test-validator.ts
 *
 * WU-2273: Honor tdd-exception in wu:done spec completeness validator
 */

import { describe, it, expect } from 'vitest';
import {
  isCodeFile,
  isExemptFromAutomatedTests,
  validateAutomatedTestRequirement,
  containsHexCoreCode,
} from '../manual-test-validator.js';

describe('manual-test-validator', () => {
  describe('isCodeFile', () => {
    it('returns true for .ts files', () => {
      expect(isCodeFile('src/app.ts')).toBe(true);
    });

    it('returns true for .tsx files', () => {
      expect(isCodeFile('src/component.tsx')).toBe(true);
    });

    it('returns true for .js files', () => {
      expect(isCodeFile('src/app.js')).toBe(true);
    });

    it('returns false for .md files', () => {
      expect(isCodeFile('docs/README.md')).toBe(false);
    });

    it('returns false for .yaml files', () => {
      expect(isCodeFile('config.yaml')).toBe(false);
    });

    it('returns false for config files with code extensions', () => {
      expect(isCodeFile('vitest.config.ts')).toBe(false);
      expect(isCodeFile('eslint.config.js')).toBe(false);
    });

    it('returns false for empty or invalid input', () => {
      expect(isCodeFile('')).toBe(false);
      expect(isCodeFile(null as unknown as string)).toBe(false);
    });
  });

  describe('containsHexCoreCode', () => {
    it('returns true for paths in hex core patterns', () => {
      expect(containsHexCoreCode(['packages/@lumenflow/core/src/foo.ts'])).toBe(true);
    });

    it('returns false for non-hex paths', () => {
      expect(containsHexCoreCode(['apps/web/src/page.tsx'])).toBe(false);
    });

    it('returns false for empty or null input', () => {
      expect(containsHexCoreCode(null)).toBe(false);
      expect(containsHexCoreCode([])).toBe(false);
    });
  });

  describe('isExemptFromAutomatedTests', () => {
    it('returns true for documentation type WUs', () => {
      expect(isExemptFromAutomatedTests({ type: 'documentation' })).toBe(true);
    });

    it('returns false for feature type WUs without tdd-exception', () => {
      expect(isExemptFromAutomatedTests({ type: 'feature' })).toBe(false);
    });

    it('returns false for null/undefined doc', () => {
      expect(isExemptFromAutomatedTests(null)).toBe(false);
      expect(isExemptFromAutomatedTests(undefined)).toBe(false);
    });

    // WU-2273: tdd-exception in notes should exempt from automated tests
    it('returns true when notes contain tdd-exception: marker (string)', () => {
      expect(
        isExemptFromAutomatedTests({
          type: 'feature',
          notes: 'tdd-exception: config-only change, no logic',
        }),
      ).toBe(true);
    });

    it('returns true when notes contain tdd-exception: marker (array)', () => {
      expect(
        isExemptFromAutomatedTests({
          type: 'bug',
          notes: ['some other note', 'tdd-exception: generated types only'],
        }),
      ).toBe(true);
    });

    it('returns false when notes do not contain tdd-exception marker', () => {
      expect(
        isExemptFromAutomatedTests({
          type: 'feature',
          notes: 'just a regular note about the WU',
        }),
      ).toBe(false);
    });

    it('returns true when notes is a multiline string with tdd-exception', () => {
      expect(
        isExemptFromAutomatedTests({
          type: 'refactor',
          notes: 'Some context.\ntdd-exception: standalone script, no imports',
        }),
      ).toBe(true);
    });
  });

  describe('validateAutomatedTestRequirement', () => {
    it('passes for documentation type WUs with code files and no tests', () => {
      const result = validateAutomatedTestRequirement({
        type: 'documentation',
        code_paths: ['packages/@lumenflow/core/src/foo.ts'],
        tests: {},
      });
      expect(result.valid).toBe(true);
    });

    it('fails for feature WUs with code files and no automated tests', () => {
      const result = validateAutomatedTestRequirement({
        type: 'feature',
        code_paths: ['packages/@lumenflow/core/src/foo.ts'],
        tests: { manual: ['test something'] },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('passes for feature WUs with code files and automated tests', () => {
      const result = validateAutomatedTestRequirement({
        type: 'feature',
        code_paths: ['packages/@lumenflow/core/src/foo.ts'],
        tests: { unit: ['src/__tests__/foo.test.ts'] },
      });
      expect(result.valid).toBe(true);
    });

    it('passes for WUs with only non-code files', () => {
      const result = validateAutomatedTestRequirement({
        type: 'feature',
        code_paths: ['docs/README.md', 'config.yaml'],
        tests: {},
      });
      expect(result.valid).toBe(true);
    });

    // WU-2273: tdd-exception should bypass automated test requirement
    it('passes for WUs with tdd-exception in notes and code files but no automated tests', () => {
      const result = validateAutomatedTestRequirement({
        type: 'feature',
        code_paths: ['packages/@lumenflow/core/src/foo.ts'],
        tests: { manual: ['verify it works'] },
        notes: 'tdd-exception: config-only change, no testable logic',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes for bug WUs with tdd-exception in notes (array format)', () => {
      const result = validateAutomatedTestRequirement({
        type: 'bug',
        code_paths: ['packages/@lumenflow/cli/src/wu-done.ts'],
        tests: {},
        notes: ['context note', 'tdd-exception: standalone script using only Node built-ins'],
      });
      expect(result.valid).toBe(true);
    });

    it('still fails for WUs with notes but no tdd-exception marker', () => {
      const result = validateAutomatedTestRequirement({
        type: 'feature',
        code_paths: ['packages/@lumenflow/core/src/foo.ts'],
        tests: {},
        notes: 'this WU has some notes but no exception',
      });
      expect(result.valid).toBe(false);
    });
  });
});
