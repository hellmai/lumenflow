import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateTaskInvocation, generateCodexPrompt } from '../wu-spawn.js';
import { ClaudeCodeStrategy, GeminiCliStrategy, GenericStrategy } from '../spawn-strategy.js';
import { LumenFlowConfigSchema } from '../lumenflow-config-schema.js';

// Mock Config
vi.mock('../lumenflow-config.js', () => ({
  getConfig: () => ({
    agents: { defaultClient: 'claude-code' },
  }),
}));

// Mock fs
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: (path) => {
      if (path === '.claude/CLAUDE.md' || path === 'GEMINI.md') return true;
      if (path === '.claude/skills') return true;
      if (path === '.claude/agents') return true;
      if (path.includes('WU-TEST')) return true; // WU file
      return false;
    },
    readFileSync: (path) => {
      if (path.includes('WU-TEST')) {
        return `
title: Test WU
lane: Operations: Tooling
type: feature
status: in_progress
code_paths: [src/foo.ts]
acceptance: [Criteria 1]
description: Description
worktree_path: worktrees/test
`;
      }
      return '';
    },
  };
});

describe('wu-spawn refactoring', () => {
  const config = LumenFlowConfigSchema.parse({
    directories: {
      skillsDir: '.claude/skills',
      agentsDir: '.claude/agents',
    },
  });
  const mockDoc = {
    title: 'Test WU',
    lane: 'Operations: Tooling',
    type: 'feature',
    status: 'in_progress',
    code_paths: ['src/foo.ts'],
    acceptance: ['Criteria 1'],
    description: 'Description',
    worktree_path: 'worktrees/test',
  };

  const id = 'WU-TEST';

  describe('generateTaskInvocation', () => {
    it('uses ClaudeCodeStrategy when provided', () => {
      const strategy = new ClaudeCodeStrategy();
      const output = generateTaskInvocation(mockDoc, id, strategy, { config });

      // Check Preamble
      expect(output).toContain('Read .claude/CLAUDE.md (Claude-specific workflow overlay)');

      // Check Skills
      expect(output).toContain('Check `.claude/skills` for available skills');
      expect(output).toContain('Check `.claude/agents` for agent configs');
    });

    it('uses GeminiCliStrategy when provided', () => {
      const strategy = new GeminiCliStrategy();
      const output = generateTaskInvocation(mockDoc, id, strategy, { config });

      // Check Preamble
      expect(output).toContain('Read GEMINI.md (Gemini-specific workflow overlay)');

      // Check Skills (Gemini strategy doesn't mention .claude/agents)
      expect(output).not.toContain('Check `.claude/agents` for available skills');
      expect(output).toContain('Check `.claude/skills` for available skills');
    });

    it('uses GenericStrategy when provided', () => {
      const strategy = new GenericStrategy();
      const output = generateTaskInvocation(mockDoc, id, strategy, { config });

      // Check Preamble (No overlay)
      expect(output).not.toContain('Read CLAUDE.md (Claude-specific workflow overlay)');
      expect(output).not.toContain('Read GEMINI.md (Gemini-specific workflow overlay)');
      expect(output).toContain('Read LUMENFLOW.md');
    });

    it('injects client blocks and skills guidance when provided', () => {
      const strategy = new GenericStrategy();
      const output = generateTaskInvocation(mockDoc, id, strategy, {
        client: {
          name: 'claude-code',
          config: {
            blocks: [
              {
                title: 'Claude Code Notes',
                content: 'Use agent skills for frontend tasks.',
              },
            ],
            skills: {
              instructions: 'Prefer tooling skills for CLI output.',
              recommended: ['wu-lifecycle', 'worktree-discipline'],
            },
          },
        },
        config,
      });

      expect(output).toContain('Client Guidance (claude-code)');
      expect(output).toContain('Claude Code Notes');
      expect(output).toContain('Client Skills Guidance (claude-code)');
      expect(output).toContain('Recommended skills');
    });
  });

  describe('generateCodexPrompt', () => {
    it('uses strategy for Codex prompts too', () => {
      const strategy = new GeminiCliStrategy();
      const output = generateCodexPrompt(mockDoc, id, strategy, { config });

      expect(output).toContain('Read GEMINI.md');
    });
  });
});
