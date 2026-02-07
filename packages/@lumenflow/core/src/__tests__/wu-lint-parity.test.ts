/**
 * @file wu-lint-parity.test.ts
 * @description Tests for CLI command registration parity validation (WU-1504)
 *
 * Tests the heuristic: when WU code_paths include CLI command implementations
 * or package.json bin entries, registration surfaces (public-manifest.ts and
 * MCP tools.ts) must also be present in code_paths.
 */

import { describe, it, expect } from 'vitest';
import {
  validateRegistrationParity,
  WU_LINT_ERROR_TYPES,
  REGISTRATION_SURFACES,
  CLI_COMMAND_PATTERNS,
} from '../wu-lint.js';

describe('validateRegistrationParity (WU-1504)', () => {
  const PUBLIC_MANIFEST_PATH = REGISTRATION_SURFACES.PUBLIC_MANIFEST;
  const MCP_TOOLS_PATH = REGISTRATION_SURFACES.MCP_TOOLS;

  describe('heuristic detection: CLI command implementation in code_paths', () => {
    it('should return valid when no CLI command paths are in code_paths', () => {
      const wu = {
        id: 'WU-9999',
        code_paths: ['packages/@lumenflow/core/src/wu-lint.ts', 'docs/README.md'],
      };

      const result = validateRegistrationParity(wu);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should warn when CLI src file is present but public-manifest is missing', () => {
      const wu = {
        id: 'WU-9999',
        code_paths: ['packages/@lumenflow/cli/src/wu-new-command.ts'],
      };

      const result = validateRegistrationParity(wu);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe(WU_LINT_ERROR_TYPES.REGISTRATION_PARITY_MISSING);
      expect(result.errors[0].message).toContain('public-manifest.ts');
    });

    it('should warn when CLI src file is present but MCP tools is missing', () => {
      const wu = {
        id: 'WU-9999',
        code_paths: ['packages/@lumenflow/cli/src/wu-new-command.ts'],
      };

      const result = validateRegistrationParity(wu);
      expect(result.errors.some((e) => e.message.includes('tools.ts'))).toBe(true);
    });

    it('should warn when package.json bin entry is present but registrations missing', () => {
      const wu = {
        id: 'WU-9999',
        code_paths: ['packages/@lumenflow/cli/package.json'],
      };

      const result = validateRegistrationParity(wu);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('when registration surfaces are present', () => {
    it('should return valid when both public-manifest and MCP tools are in code_paths', () => {
      const wu = {
        id: 'WU-9999',
        code_paths: [
          'packages/@lumenflow/cli/src/wu-new-command.ts',
          PUBLIC_MANIFEST_PATH,
          MCP_TOOLS_PATH,
        ],
      };

      const result = validateRegistrationParity(wu);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should warn when only public-manifest is present (MCP tools missing)', () => {
      const wu = {
        id: 'WU-9999',
        code_paths: ['packages/@lumenflow/cli/src/wu-new-command.ts', PUBLIC_MANIFEST_PATH],
      };

      const result = validateRegistrationParity(wu);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].message).toContain('tools.ts');
    });

    it('should warn when only MCP tools is present (public-manifest missing)', () => {
      const wu = {
        id: 'WU-9999',
        code_paths: ['packages/@lumenflow/cli/src/wu-new-command.ts', MCP_TOOLS_PATH],
      };

      const result = validateRegistrationParity(wu);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].message).toContain('public-manifest.ts');
    });
  });

  describe('edge cases', () => {
    it('should not trigger for test files in CLI package', () => {
      const wu = {
        id: 'WU-9999',
        code_paths: ['packages/@lumenflow/cli/src/__tests__/wu-validate.test.ts'],
      };

      const result = validateRegistrationParity(wu);
      expect(result.valid).toBe(true);
    });

    it('should not trigger for non-CLI packages', () => {
      const wu = {
        id: 'WU-9999',
        code_paths: ['packages/@lumenflow/core/src/wu-lint.ts'],
      };

      const result = validateRegistrationParity(wu);
      expect(result.valid).toBe(true);
    });

    it('should not trigger for shared/lib files that are not command implementations', () => {
      const wu = {
        id: 'WU-9999',
        code_paths: ['packages/@lumenflow/cli/src/lib/some-helper.ts'],
      };

      const result = validateRegistrationParity(wu);
      expect(result.valid).toBe(true);
    });

    it('should not trigger for the registration surface files themselves', () => {
      const wu = {
        id: 'WU-9999',
        code_paths: [PUBLIC_MANIFEST_PATH, MCP_TOOLS_PATH],
      };

      const result = validateRegistrationParity(wu);
      expect(result.valid).toBe(true);
    });

    it('should handle empty code_paths gracefully', () => {
      const wu = {
        id: 'WU-9999',
        code_paths: [],
      };

      const result = validateRegistrationParity(wu);
      expect(result.valid).toBe(true);
    });

    it('should handle undefined code_paths gracefully', () => {
      const wu = {
        id: 'WU-9999',
      };

      const result = validateRegistrationParity(wu);
      expect(result.valid).toBe(true);
    });
  });

  describe('error structure', () => {
    it('should include wuId in error objects', () => {
      const wu = {
        id: 'WU-1234',
        code_paths: ['packages/@lumenflow/cli/src/wu-new-command.ts'],
      };

      const result = validateRegistrationParity(wu);
      expect(result.errors.every((e) => e.wuId === 'WU-1234')).toBe(true);
    });

    it('should include actionable suggestion in error objects', () => {
      const wu = {
        id: 'WU-9999',
        code_paths: ['packages/@lumenflow/cli/src/wu-new-command.ts'],
      };

      const result = validateRegistrationParity(wu);
      expect(result.errors.every((e) => typeof e.suggestion === 'string')).toBe(true);
      expect(result.errors.every((e) => e.suggestion.length > 0)).toBe(true);
    });
  });

  describe('exported constants', () => {
    it('should export REGISTRATION_SURFACES with expected paths', () => {
      expect(REGISTRATION_SURFACES.PUBLIC_MANIFEST).toBe(
        'packages/@lumenflow/cli/src/public-manifest.ts',
      );
      expect(REGISTRATION_SURFACES.MCP_TOOLS).toBe('packages/@lumenflow/mcp/src/tools.ts');
    });

    it('should export CLI_COMMAND_PATTERNS as non-empty array', () => {
      expect(Array.isArray(CLI_COMMAND_PATTERNS)).toBe(true);
      expect(CLI_COMMAND_PATTERNS.length).toBeGreaterThan(0);
    });
  });
});
