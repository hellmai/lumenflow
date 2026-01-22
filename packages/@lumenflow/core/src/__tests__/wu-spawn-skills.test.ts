import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExistsSync = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
}));

import {
  resolveSkillsPaths,
  generateSkillsCatalogGuidance,
  generateSkillsSelectionSection,
} from '../wu-spawn-skills.js';
import { LumenFlowConfigSchema } from '../lumenflow-config-schema.js';

describe('wu-spawn skills resolution', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
  });

  it('prefers client override skillsDir when it exists', () => {
    mockExistsSync.mockImplementation((path) => path === '.codex/skills');

    const config = LumenFlowConfigSchema.parse({
      directories: {
        skillsDir: '.lumenflow/skills',
        agentsDir: '.lumenflow/agents',
      },
      agents: {
        clients: {
          'codex-cli': {
            skillsDir: '.codex/skills',
          },
        },
      },
    });

    const result = resolveSkillsPaths(config, 'codex-cli');
    expect(result.skillsDir).toBe('.codex/skills');
  });

  it('falls back to directories.skillsDir when present and existing', () => {
    mockExistsSync.mockImplementation((path) => path === '.lumenflow/skills');

    const config = LumenFlowConfigSchema.parse({
      directories: {
        skillsDir: '.lumenflow/skills',
        agentsDir: '.lumenflow/agents',
      },
    });

    const result = resolveSkillsPaths(config, 'claude-code');
    expect(result.skillsDir).toBe('.lumenflow/skills');
  });

  it('emits no-skills guidance when none configured or found', () => {
    mockExistsSync.mockReturnValue(false);

    const config = LumenFlowConfigSchema.parse({
      directories: {
        skillsDir: '.lumenflow/skills',
      },
    });

    const guidance = generateSkillsCatalogGuidance(config, 'claude-code');
    expect(guidance).toContain('No skills directories configured or found');
    expect(guidance).toContain('directories.skillsDir');
    expect(guidance).toContain('agents.clients.claude-code.skillsDir');
  });

  it('includes skills catalog guidance in selection section when paths exist', () => {
    mockExistsSync.mockImplementation(
      (path) => path === '.claude/skills' || path === '.claude/agents',
    );

    const config = LumenFlowConfigSchema.parse({
      directories: {
        skillsDir: '.claude/skills',
        agentsDir: '.claude/agents',
      },
    });

    const doc = {
      lane: 'Operations: Tooling',
      type: 'feature',
    };

    const section = generateSkillsSelectionSection(doc, config, 'claude-code');
    expect(section).toContain('Skills Catalog');
    expect(section).toContain('Check `.claude/skills`');
    expect(section).toContain('Check `.claude/agents`');
  });
});
