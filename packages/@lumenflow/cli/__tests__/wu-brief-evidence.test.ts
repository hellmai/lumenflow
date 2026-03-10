// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  enforceSpawnProvenanceForDone,
  enforceWuBriefEvidenceForDone,
  buildMissingWuBriefEvidenceMessage,
  shouldEnforceSpawnProvenance,
} from '../src/wu-done-policies.js';

describe('WU-2359: evidence and spawn provenance policy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('spawn provenance — warn-only for non-spawned initiative WUs', () => {
    it('warns instead of blocking when no spawn entry exists and policy is auto', async () => {
      const blocker = vi.fn();
      const warn = vi.fn();

      await enforceSpawnProvenanceForDone(
        'WU-TEST-1',
        { initiative: 'INIT-001', type: 'feature' },
        {
          baseDir: '/tmp/fake-state',
          force: false,
          warn,
          blocker,
        },
      );

      // Should NOT call blocker (no hard-block)
      expect(blocker).not.toHaveBeenCalled();
      // Should warn about missing spawn provenance
      expect(warn).toHaveBeenCalled();
      const warnMessage = warn.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(warnMessage).toContain('spawn provenance');
      expect(warnMessage).toContain('WU-TEST-1');
    });

    it('still hard-blocks when WU was explicitly spawned/delegated but missing pickup', async () => {
      const blocker = vi.fn();
      const warn = vi.fn();

      // This test needs a delegation registry with intent but no pickup
      await enforceSpawnProvenanceForDone(
        'WU-TEST-2',
        { initiative: 'INIT-001', type: 'feature' },
        {
          baseDir: '/tmp/fake-state',
          force: false,
          warn,
          blocker,
          // Mock a store that returns a delegation entry with intent
          _storeOverride: {
            getByTarget: () => ({ intent: 'delegation' }),
          },
        },
      );

      // Should block — explicit delegation exists but pickup is missing
      expect(blocker).toHaveBeenCalled();
    });
  });

  describe('wu:brief --evidence-only removal', () => {
    it('error messages no longer reference --evidence-only', () => {
      const message = buildMissingWuBriefEvidenceMessage('WU-TEST-3');
      expect(message).not.toContain('--evidence-only');
      expect(message).toContain('wu:brief');
    });
  });
});
