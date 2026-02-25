// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildGatesCommand,
  hasSpawnPickupEvidence,
  printExposureWarnings,
  validateDocsOnlyFlag,
} from '../wu-done-policies.js';

describe('wu-done policy helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateDocsOnlyFlag', () => {
    it('allows --docs-only when WU type is documentation', () => {
      const result = validateDocsOnlyFlag(
        {
          id: 'WU-2162',
          type: 'documentation',
          code_paths: ['docs/04-operations/plans/example.md'],
        },
        { docsOnly: true },
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects --docs-only for non-docs exposure and code paths', () => {
      const result = validateDocsOnlyFlag(
        {
          id: 'WU-2162',
          type: 'feature',
          exposure: 'backend-only',
          code_paths: ['packages/@lumenflow/cli/src/wu-done.ts'],
        },
        { docsOnly: true },
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('--docs-only');
      expect(result.errors[0]).toContain('backend-only');
    });
  });

  describe('buildGatesCommand', () => {
    it('builds docs-only gates command when either docs signal is true', () => {
      expect(buildGatesCommand({ docsOnly: true, isDocsOnly: false })).toContain('--docs-only');
      expect(buildGatesCommand({ docsOnly: false, isDocsOnly: true })).toContain('--docs-only');
    });

    it('builds full gates command when docs signals are false', () => {
      expect(buildGatesCommand({ docsOnly: false, isDocsOnly: false })).not.toContain(
        '--docs-only',
      );
    });
  });

  describe('printExposureWarnings', () => {
    it('emits warning output for missing exposure metadata', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      printExposureWarnings({
        id: 'WU-2162',
        type: 'feature',
        code_paths: ['packages/@lumenflow/cli/src/wu-done.ts'],
      });

      const combined = logSpy.mock.calls.flat().join('\n');
      expect(combined).toContain('Exposure validation warnings');
    });
  });

  describe('hasSpawnPickupEvidence', () => {
    it('returns true only when both pickup fields are present', () => {
      expect(
        hasSpawnPickupEvidence({ pickedUpAt: '2026-02-25T00:00:00.000Z', pickedUpBy: 'tom' }),
      ).toBe(true);
      expect(hasSpawnPickupEvidence({ pickedUpAt: '2026-02-25T00:00:00.000Z' })).toBe(false);
      expect(hasSpawnPickupEvidence({ pickedUpBy: 'tom' })).toBe(false);
    });
  });
});
