// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from 'vitest';
import { generateConstraints, generateCodexConstraints } from '../spawn-constraints-generator';

describe('spawn-constraints-generator', () => {
  describe('generateConstraints', () => {
    it('should use pnpm wu:verify instead of node packages/@lumenflow/agent/verification', () => {
      const result = generateConstraints('WU-TEST');

      expect(result).toContain('pnpm wu:verify --id WU-TEST');
      expect(result).not.toContain('node packages/@lumenflow/agent/verification');
    });

    it('should include wu:verify in the VERIFY COMPLETION constraint', () => {
      const result = generateConstraints('WU-TEST');

      // The verify constraint should reference pnpm wu:verify
      expect(result).toMatch(/VERIFY COMPLETION.*pnpm wu:verify/s);
    });

    it('should pass through WU ID to wu:verify command', () => {
      const result = generateConstraints('WU-1234');

      expect(result).toContain('pnpm wu:verify --id WU-1234');
    });
  });

  describe('generateCodexConstraints', () => {
    it('should use pnpm wu:verify instead of node packages/@lumenflow/agent/verification', () => {
      const result = generateCodexConstraints('WU-TEST');

      expect(result).toContain('pnpm wu:verify --id WU-TEST');
      expect(result).not.toContain('node packages/@lumenflow/agent/verification');
    });

    it('should pass through WU ID to wu:verify command', () => {
      const result = generateCodexConstraints('WU-5678');

      expect(result).toContain('pnpm wu:verify --id WU-5678');
    });
  });
});
