// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it, vi, afterEach } from 'vitest';
import { createWUParser, WU_OPTIONS } from '@lumenflow/core/arg-parser';
import { ProcessExitError } from '@lumenflow/core/error-handler';
import {
  enforceSpawnProvenanceForDone,
  enforceWuBriefEvidenceForDone,
  buildMissingWuBriefEvidenceMessage,
  shouldEnforceSpawnProvenance,
} from '../src/wu-done-policies.js';

const BRIEF_COMMAND_NAME = 'wu-brief';
const BRIEF_COMMAND_DESCRIPTION = 'Generate handoff prompt for sub-agent WU execution';

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
      expect(warnMessage).not.toContain('wu:delegate');
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
    it('keeps the deprecated flag parseable without showing it in help output', () => {
      const originalArgv = [...process.argv];
      const writes: string[] = [];
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((
        chunk: string | Uint8Array,
      ) => {
        writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
        return true;
      }) as typeof process.stdout.write);

      process.argv = ['node', BRIEF_COMMAND_NAME, '--help'];

      let thrown: unknown;
      try {
        createWUParser({
          name: BRIEF_COMMAND_NAME,
          description: BRIEF_COMMAND_DESCRIPTION,
          options: [
            WU_OPTIONS.id,
            WU_OPTIONS.client,
            WU_OPTIONS.vendor,
            WU_OPTIONS.noContext,
            WU_OPTIONS.evidenceOnly,
            WU_OPTIONS.strictSizing,
          ],
          required: ['id'],
          allowPositionalId: true,
        });
      } catch (error) {
        thrown = error;
      } finally {
        process.argv = originalArgv;
        writeSpy.mockRestore();
      }

      expect(thrown).toBeInstanceOf(ProcessExitError);
      const helpOutput = writes.join('');
      expect(helpOutput).toContain('--client <client>');
      expect(helpOutput).not.toContain('--evidence-only');
    });

    it('error messages no longer reference --evidence-only', () => {
      const message = buildMissingWuBriefEvidenceMessage('WU-TEST-3');
      expect(message).not.toContain('--evidence-only');
      expect(message).toContain('wu:brief');
    });
  });
});
