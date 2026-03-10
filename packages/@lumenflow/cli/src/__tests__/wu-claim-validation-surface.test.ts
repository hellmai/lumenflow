// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * WU-2367: Fit-for-surface verification in wu:claim validation.
 *
 * Tests that validateManualTestsForClaim honors tdd-exception notes
 * and does not force agents to add bogus test paths for documented-exception WUs.
 */

import { describe, it, expect } from 'vitest';
import { validateManualTestsForClaim } from '../wu-claim-validation.js';

describe('WU-2367: validateManualTestsForClaim fit-for-surface', () => {
  describe('tdd-exception honored in claim validation', () => {
    it('passes for feature WU with tdd-exception in notes and no manual tests', () => {
      const doc = {
        type: 'feature',
        notes: 'tdd-exception: template cleanup, no runtime code',
        tests: {},
      };
      const result = validateManualTestsForClaim(doc, 'WU-TEST');
      expect(result.valid).toBe(true);
    });

    it('passes for bug WU with tdd-exception in notes (array format) and no manual tests', () => {
      const doc = {
        type: 'bug',
        notes: ['context', 'tdd-exception: UI-only change, smoke test sufficient'],
        tests: {},
      };
      const result = validateManualTestsForClaim(doc, 'WU-TEST');
      expect(result.valid).toBe(true);
    });

    it('still requires manual tests for non-doc WU without tdd-exception', () => {
      const doc = {
        type: 'feature',
        notes: 'regular notes without exception',
        tests: {},
      };
      const result = validateManualTestsForClaim(doc, 'WU-TEST');
      expect(result.valid).toBe(false);
    });

    it('still passes docs/process types without tdd-exception', () => {
      const docResult = validateManualTestsForClaim({ type: 'documentation' }, 'WU-TEST');
      expect(docResult.valid).toBe(true);

      const processResult = validateManualTestsForClaim({ type: 'process' }, 'WU-TEST');
      expect(processResult.valid).toBe(true);
    });
  });
});
