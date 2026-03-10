// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * WU-2367: Fit-for-surface verification in claim/readiness checks.
 *
 * Tests that validateSpecCompleteness and validateManualTestsForClaim
 * honor tdd-exception notes and do not force agents to add bogus
 * tests.unit paths for UI, docs, or documented-exception WUs.
 */

import { describe, it, expect } from 'vitest';
import { validateSpecCompleteness } from '../wu-done-validation.js';

describe('WU-2367: validateSpecCompleteness fit-for-surface', () => {
  const BASE_DOC = {
    description:
      'A sufficiently long description that meets the minimum length requirement for validation.',
    acceptance: ['AC1: something concrete'],
    code_paths: ['packages/@lumenflow/cli/src/wu-claim-validation.ts'],
    type: 'bug',
  };

  describe('tdd-exception honored in spec completeness', () => {
    it('passes when notes contain tdd-exception and only manual tests are present', () => {
      const doc = {
        ...BASE_DOC,
        tests: { manual: ['Verify the fix works correctly'] },
        notes: 'tdd-exception: config-only change, no testable logic',
      };
      const result = validateSpecCompleteness(doc, 'WU-TEST');
      expect(result.valid).toBe(true);
    });

    it('passes when notes contain tdd-exception (array format) and only manual tests', () => {
      const doc = {
        ...BASE_DOC,
        tests: { manual: ['Verify it works'] },
        notes: ['context note', 'tdd-exception: UI smoke test only'],
      };
      const result = validateSpecCompleteness(doc, 'WU-TEST');
      expect(result.valid).toBe(true);
    });

    it('still fails when notes do NOT contain tdd-exception and only manual tests with code files', () => {
      const doc = {
        ...BASE_DOC,
        tests: { manual: ['Verify it works'] },
        notes: 'some regular note without exception marker',
      };
      const result = validateSpecCompleteness(doc, 'WU-TEST');
      expect(result.valid).toBe(false);
    });

    it('passes when tdd-exception is present and no tests at all (legitimate opt-out)', () => {
      const doc = {
        ...BASE_DOC,
        tests: { manual: ['Check it manually'] },
        notes: 'tdd-exception: dead template cleanup, no runtime behavior',
      };
      const result = validateSpecCompleteness(doc, 'WU-TEST');
      expect(result.valid).toBe(true);
    });
  });

  describe('spec completeness error messaging guides toward fit-for-surface verification', () => {
    it('error message mentions fit-for-surface when automated tests are missing', () => {
      const doc = {
        ...BASE_DOC,
        tests: { manual: ['Check it'] },
      };
      const result = validateSpecCompleteness(doc, 'WU-TEST');
      expect(result.valid).toBe(false);
      // Should mention tdd-exception as an option for legitimate cases
      const errorText = result.errors.join('\n');
      expect(errorText).toContain('tdd-exception');
    });
  });

  describe('documentation and process types remain exempt', () => {
    it('passes for documentation type without any tests', () => {
      const doc = {
        description: 'A documentation WU that meets the length requirement for testing purposes.',
        acceptance: ['AC1'],
        type: 'documentation',
      };
      const result = validateSpecCompleteness(doc, 'WU-TEST');
      expect(result.valid).toBe(true);
    });

    it('passes for process type without any tests', () => {
      const doc = {
        description: 'A process WU that meets the length requirement for testing purposes here.',
        acceptance: ['AC1'],
        type: 'process',
      };
      const result = validateSpecCompleteness(doc, 'WU-TEST');
      expect(result.valid).toBe(true);
    });
  });
});
