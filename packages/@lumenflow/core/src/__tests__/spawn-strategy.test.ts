// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import {
  ClaudeCodeStrategy,
  GeminiCliStrategy,
  GenericStrategy,
  SpawnStrategyFactory,
} from '../spawn-strategy';
import { createWuPaths } from '../wu-paths.js';

// Mock fs.existsSync
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('SpawnStrategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('BaseSpawnStrategy.getCorePreamble', () => {
    it('should include quick-ref-commands.md in the preamble', () => {
      // Use GenericStrategy which directly returns the core preamble
      const strategy = new GenericStrategy();
      const preamble = strategy.getPreamble('WU-1234');

      expect(preamble).toContain('quick-ref-commands.md');
      expect(preamble).toContain('CLI tooling reference');
    });

    it('should include quick-ref-commands.md as step 5', () => {
      const strategy = new GenericStrategy();
      const preamble = strategy.getPreamble('WU-1234');
      const quickRefPath = createWuPaths().QUICK_REF_PATH();

      // Check that quick-ref is listed as step 5 (WU-2374: renumbered after removing lumenflow-complete.md)
      expect(preamble).toMatch(new RegExp(`5\\.\\s*Read\\s+${escapeRegex(quickRefPath)}`));
    });

    it('should not reference lumenflow-complete.md (WU-2374: does not exist in consumer projects)', () => {
      const strategy = new GenericStrategy();
      const preamble = strategy.getPreamble('WU-TEST');

      expect(preamble).not.toContain('lumenflow-complete.md');
    });

    it('should include all required context files in correct order', () => {
      const strategy = new GenericStrategy();
      const preamble = strategy.getPreamble('WU-TEST');

      // WU-2374: Verify order after removing lumenflow-complete.md step
      // LUMENFLOW.md < constraints.md < README.md < WU YAML < quick-ref
      const lumenflowPos = preamble.indexOf('LUMENFLOW.md');
      const constraintsPos = preamble.indexOf('.lumenflow/constraints.md');
      const readmePos = preamble.indexOf('README.md');
      const wuYamlPos = preamble.indexOf('WU-TEST.yaml');
      const quickRefPos = preamble.indexOf('quick-ref-commands.md');

      expect(lumenflowPos).toBeLessThan(constraintsPos);
      expect(constraintsPos).toBeLessThan(readmePos);
      expect(readmePos).toBeLessThan(wuYamlPos);
      expect(wuYamlPos).toBeLessThan(quickRefPos);
    });
  });

  describe('ClaudeCodeStrategy', () => {
    it('should add Claude overlay as step 6 when .claude/CLAUDE.md exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const strategy = new ClaudeCodeStrategy();
      const preamble = strategy.getPreamble('WU-1234');

      // WU-2374: Step number changed from 7 to 6 after removing lumenflow-complete.md step
      expect(preamble).toContain('6. Read .claude/CLAUDE.md');
      expect(preamble).toContain('Claude-specific workflow overlay');
    });

    it('should not add Claude overlay when .claude/CLAUDE.md does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const strategy = new ClaudeCodeStrategy();
      const preamble = strategy.getPreamble('WU-1234');

      expect(preamble).not.toContain('.claude/CLAUDE.md');
    });

    it('should still include quick-ref-commands.md as step 5', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const strategy = new ClaudeCodeStrategy();
      const preamble = strategy.getPreamble('WU-1234');

      // WU-2374: Step numbers shifted after removing lumenflow-complete.md step
      expect(preamble).toMatch(/5\.\s*Read.*quick-ref-commands\.md/);
      expect(preamble).toMatch(/6\.\s*Read.*\.claude\/CLAUDE\.md/);
    });
  });

  describe('GeminiCliStrategy', () => {
    it('should add Gemini overlay as step 6 when GEMINI.md exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const strategy = new GeminiCliStrategy();
      const preamble = strategy.getPreamble('WU-1234');

      // WU-2374: Step number changed from 7 to 6 after removing lumenflow-complete.md step
      expect(preamble).toContain('6. Read GEMINI.md');
      expect(preamble).toContain('Gemini-specific workflow overlay');
    });

    it('should not add Gemini overlay when GEMINI.md does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const strategy = new GeminiCliStrategy();
      const preamble = strategy.getPreamble('WU-1234');

      expect(preamble).not.toContain('GEMINI.md');
    });
  });

  describe('SpawnStrategyFactory', () => {
    it('should create ClaudeCodeStrategy for claude-code', () => {
      const strategy = SpawnStrategyFactory.create('claude-code');
      expect(strategy).toBeInstanceOf(ClaudeCodeStrategy);
    });

    it('should create ClaudeCodeStrategy for claude (legacy alias)', () => {
      const strategy = SpawnStrategyFactory.create('claude');
      expect(strategy).toBeInstanceOf(ClaudeCodeStrategy);
    });

    it('should create GeminiCliStrategy for gemini-cli', () => {
      const strategy = SpawnStrategyFactory.create('gemini-cli');
      expect(strategy).toBeInstanceOf(GeminiCliStrategy);
    });

    it('should create GenericStrategy for unknown clients', () => {
      const strategy = SpawnStrategyFactory.create('unknown-client');
      expect(strategy).toBeInstanceOf(GenericStrategy);
    });
  });
});
