// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @file docs-sync-safety.test.ts
 * Tests for safe docs lifecycle (WU-2383)
 *
 * Validates that:
 * - LUMENFLOW.md is force-synced (fully managed)
 * - AGENTS.md uses merge-block markers
 * - User content outside markers is preserved on upgrade
 * - Round-trip: init -> user edits -> upgrade -> edits preserved
 * - Reserved skills are updatable; user skills never touched
 * - Migration guard detects LUMENFLOW.md drift
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { MARKERS } from '../merge-block.js';
import {
  CORE_DOC_TEMPLATE_PATHS,
  MANAGED_DOC_PATHS,
  BOOTSTRAP_DOC_PATHS,
  syncCoreDocs,
  syncSkills,
  RESERVED_SKILL_NAMES,
} from '../docs-sync.js';
import { createFile, type ScaffoldResult } from '../init-scaffolding.js';

describe('WU-2383: safe docs lifecycle', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-sync-safety-'));
    // Create .lumenflow dir so constraints.md can be written
    fs.mkdirSync(path.join(tempDir, '.lumenflow'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('file ownership categorization', () => {
    it('should categorize LUMENFLOW.md as managed', () => {
      expect(MANAGED_DOC_PATHS).toHaveProperty('LUMENFLOW.md');
    });

    it('should categorize .lumenflow/constraints.md as managed', () => {
      expect(MANAGED_DOC_PATHS).toHaveProperty('.lumenflow/constraints.md');
    });

    it('should categorize AGENTS.md as bootstrap (merge-block)', () => {
      expect(BOOTSTRAP_DOC_PATHS).toHaveProperty('AGENTS.md');
    });

    it('should not have AGENTS.md in managed docs', () => {
      expect(MANAGED_DOC_PATHS).not.toHaveProperty('AGENTS.md');
    });

    it('should have all core docs accounted for in managed + bootstrap', () => {
      const allKeys = [...Object.keys(MANAGED_DOC_PATHS), ...Object.keys(BOOTSTRAP_DOC_PATHS)];
      for (const key of Object.keys(CORE_DOC_TEMPLATE_PATHS)) {
        expect(allKeys).toContain(key);
      }
    });
  });

  describe('syncCoreDocs — managed docs (LUMENFLOW.md, constraints.md)', () => {
    it('should always write LUMENFLOW.md even when it exists and force=false', async () => {
      const lumenflowPath = path.join(tempDir, 'LUMENFLOW.md');
      fs.writeFileSync(lumenflowPath, '# Old content\n');

      const result = await syncCoreDocs(tempDir, { force: false });

      const content = fs.readFileSync(lumenflowPath, 'utf-8');
      expect(content).not.toBe('# Old content\n');
      expect(result.created).toContain('LUMENFLOW.md');
    });

    it('should always write constraints.md even when it exists and force=false', async () => {
      const constraintsPath = path.join(tempDir, '.lumenflow', 'constraints.md');
      fs.writeFileSync(constraintsPath, '# Old constraints\n');

      const result = await syncCoreDocs(tempDir, { force: false });

      const content = fs.readFileSync(constraintsPath, 'utf-8');
      expect(content).not.toBe('# Old constraints\n');
      expect(result.created).toContain('.lumenflow/constraints.md');
    });
  });

  describe('syncCoreDocs — bootstrap docs (AGENTS.md)', () => {
    it('should create AGENTS.md with markers when file does not exist', async () => {
      await syncCoreDocs(tempDir, { force: false });

      const agentsPath = path.join(tempDir, 'AGENTS.md');
      expect(fs.existsSync(agentsPath)).toBe(true);

      const content = fs.readFileSync(agentsPath, 'utf-8');
      expect(content).toContain(MARKERS.START);
      expect(content).toContain(MARKERS.END);
    });

    it('should inject merge-block into existing AGENTS.md without destroying user content', async () => {
      const agentsPath = path.join(tempDir, 'AGENTS.md');
      fs.writeFileSync(
        agentsPath,
        '# My Project Agent Rules\n\nCustom instructions for my team.\n',
      );

      await syncCoreDocs(tempDir, { force: false });

      const content = fs.readFileSync(agentsPath, 'utf-8');
      // User content preserved
      expect(content).toContain('# My Project Agent Rules');
      expect(content).toContain('Custom instructions for my team.');
      // LumenFlow block injected
      expect(content).toContain(MARKERS.START);
      expect(content).toContain(MARKERS.END);
    });

    it('should update only the merge-block when AGENTS.md already has markers', async () => {
      const agentsPath = path.join(tempDir, 'AGENTS.md');
      fs.writeFileSync(
        agentsPath,
        `# My Custom Header

User content above.

${MARKERS.START}
Old LumenFlow content
${MARKERS.END}

User content below.
`,
      );

      await syncCoreDocs(tempDir, { force: false });

      const content = fs.readFileSync(agentsPath, 'utf-8');
      // User content preserved
      expect(content).toContain('# My Custom Header');
      expect(content).toContain('User content above.');
      expect(content).toContain('User content below.');
      // Old block content replaced
      expect(content).not.toContain('Old LumenFlow content');
      // New block content present
      expect(content).toContain(MARKERS.START);
      expect(content).toContain(MARKERS.END);
    });

    it('should NOT force-overwrite AGENTS.md even when force=true (uses merge-block)', async () => {
      const agentsPath = path.join(tempDir, 'AGENTS.md');
      fs.writeFileSync(
        agentsPath,
        `# Custom Header

My custom rules.

${MARKERS.START}
Old managed content
${MARKERS.END}

More custom rules.
`,
      );

      await syncCoreDocs(tempDir, { force: true });

      const content = fs.readFileSync(agentsPath, 'utf-8');
      // User content STILL preserved even with force=true
      expect(content).toContain('# Custom Header');
      expect(content).toContain('My custom rules.');
      expect(content).toContain('More custom rules.');
    });
  });

  describe('round-trip: init -> user edits -> upgrade -> edits preserved', () => {
    it('should preserve user edits across multiple sync cycles', async () => {
      // Step 1: Initial sync (simulates init)
      await syncCoreDocs(tempDir, { force: false });

      // Step 2: User adds custom content outside markers
      const agentsPath = path.join(tempDir, 'AGENTS.md');
      let content = fs.readFileSync(agentsPath, 'utf-8');
      content = `# My Project\n\nMy custom agent instructions.\n\n${content}`;
      fs.writeFileSync(agentsPath, content);

      // Step 3: Second sync (simulates upgrade)
      await syncCoreDocs(tempDir, { force: false });

      // Step 4: Verify user content preserved
      const finalContent = fs.readFileSync(agentsPath, 'utf-8');
      expect(finalContent).toContain('# My Project');
      expect(finalContent).toContain('My custom agent instructions.');
      expect(finalContent).toContain(MARKERS.START);
      expect(finalContent).toContain(MARKERS.END);
    });
  });

  describe('AGENTS.md bootstrap content quality', () => {
    it('should contain real bootstrap instructions, not just a link', async () => {
      await syncCoreDocs(tempDir, { force: false });

      const agentsPath = path.join(tempDir, 'AGENTS.md');
      const content = fs.readFileSync(agentsPath, 'utf-8');

      // Extract content between markers
      const startIdx = content.indexOf(MARKERS.START);
      const endIdx = content.indexOf(MARKERS.END);
      const blockContent = content.slice(startIdx + MARKERS.START.length, endIdx);

      // Must contain substantive instructions (not just a link)
      expect(blockContent.length).toBeGreaterThan(100);
      // Must reference LUMENFLOW.md
      expect(blockContent).toContain('LUMENFLOW.md');
    });
  });

  describe('LUMENFLOW.local.md reference', () => {
    it('should reference LUMENFLOW.local.md in LUMENFLOW.md template output', async () => {
      await syncCoreDocs(tempDir, { force: false });

      const lumenflowPath = path.join(tempDir, 'LUMENFLOW.md');
      const content = fs.readFileSync(lumenflowPath, 'utf-8');
      expect(content).toContain('LUMENFLOW.local.md');
    });

    it('should reference LUMENFLOW.local.md in AGENTS.md template output', async () => {
      await syncCoreDocs(tempDir, { force: false });

      const agentsPath = path.join(tempDir, 'AGENTS.md');
      const content = fs.readFileSync(agentsPath, 'utf-8');
      expect(content).toContain('LUMENFLOW.local.md');
    });
  });

  describe('migration guard for LUMENFLOW.md', () => {
    it('should back up user-modified LUMENFLOW.md to LUMENFLOW.local.md on first sync', async () => {
      // Create a hand-edited LUMENFLOW.md
      const lumenflowPath = path.join(tempDir, 'LUMENFLOW.md');
      fs.writeFileSync(lumenflowPath, '# My Custom Workflow\n\nCustom instructions here.\n');

      const result = await syncCoreDocs(tempDir, { force: false });

      // LUMENFLOW.local.md should be created with the user's custom content
      const localPath = path.join(tempDir, 'LUMENFLOW.local.md');
      expect(fs.existsSync(localPath)).toBe(true);
      const localContent = fs.readFileSync(localPath, 'utf-8');
      expect(localContent).toContain('# My Custom Workflow');
      expect(localContent).toContain('Custom instructions here.');

      // LUMENFLOW.md should be overwritten with template
      const content = fs.readFileSync(lumenflowPath, 'utf-8');
      expect(content).not.toContain('# My Custom Workflow');
      expect(content).toContain('LUMENFLOW.local.md');

      // Warning should be emitted
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
      expect(result.warnings![0]).toContain('LUMENFLOW.local.md');
    });

    it('should not create LUMENFLOW.local.md if it already exists', async () => {
      const lumenflowPath = path.join(tempDir, 'LUMENFLOW.md');
      fs.writeFileSync(lumenflowPath, '# Modified LUMENFLOW\n');
      const localPath = path.join(tempDir, 'LUMENFLOW.local.md');
      fs.writeFileSync(localPath, '# Existing local overrides\n');

      await syncCoreDocs(tempDir, { force: false });

      // LUMENFLOW.local.md should NOT be overwritten
      const localContent = fs.readFileSync(localPath, 'utf-8');
      expect(localContent).toBe('# Existing local overrides\n');
    });

    it('should not create LUMENFLOW.local.md if LUMENFLOW.md matches template', async () => {
      // First sync to get the template content
      await syncCoreDocs(tempDir, { force: false });

      // Second sync should not create .local.md
      await syncCoreDocs(tempDir, { force: false });

      const localPath = path.join(tempDir, 'LUMENFLOW.local.md');
      expect(fs.existsSync(localPath)).toBe(false);
    });
  });

  describe('createFile merge-block mode (WU-2383)', () => {
    it('should inject merge-block into existing file preserving user content', async () => {
      const filePath = path.join(tempDir, 'VENDOR.md');
      fs.writeFileSync(filePath, '# My Custom Config\n\nUser notes here.\n');

      const result: ScaffoldResult = { created: [], skipped: [] };
      await createFile(filePath, 'LumenFlow managed content', 'merge-block', result, tempDir);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('# My Custom Config');
      expect(content).toContain('User notes here.');
      expect(content).toContain(MARKERS.START);
      expect(content).toContain('LumenFlow managed content');
      expect(content).toContain(MARKERS.END);
      expect(result.merged).toContain('VENDOR.md');
    });

    it('should create new file with markers when file does not exist', async () => {
      const filePath = path.join(tempDir, 'NEW-VENDOR.md');

      const result: ScaffoldResult = { created: [], skipped: [] };
      await createFile(filePath, 'New managed content', 'merge-block', result, tempDir);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain(MARKERS.START);
      expect(content).toContain('New managed content');
      expect(content).toContain(MARKERS.END);
      expect(result.created).toContain('NEW-VENDOR.md');
    });

    it('should update existing merge-block without touching user content', async () => {
      const filePath = path.join(tempDir, 'EXISTING.md');
      fs.writeFileSync(
        filePath,
        `User header\n\n${MARKERS.START}\nOld content\n${MARKERS.END}\n\nUser footer\n`,
      );

      const result: ScaffoldResult = { created: [], skipped: [] };
      await createFile(filePath, 'Updated content', 'merge-block', result, tempDir);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('User header');
      expect(content).toContain('User footer');
      expect(content).not.toContain('Old content');
      expect(content).toContain('Updated content');
      expect(result.merged).toContain('EXISTING.md');
    });

    it('should skip when merge-block content is unchanged', async () => {
      const filePath = path.join(tempDir, 'UNCHANGED.md');
      fs.writeFileSync(filePath, `${MARKERS.START}\nSame content\n${MARKERS.END}\n`);

      const result: ScaffoldResult = { created: [], skipped: [] };
      await createFile(filePath, 'Same content', 'merge-block', result, tempDir);

      expect(result.skipped).toContain('UNCHANGED.md');
    });
  });

  describe('skills allowlist', () => {
    it('should export a reserved skills allowlist', () => {
      expect(RESERVED_SKILL_NAMES).toBeInstanceOf(Array);
      expect(RESERVED_SKILL_NAMES.length).toBeGreaterThan(0);
      expect(RESERVED_SKILL_NAMES).toContain('wu-lifecycle');
      expect(RESERVED_SKILL_NAMES).toContain('worktree-discipline');
      expect(RESERVED_SKILL_NAMES).toContain('lumenflow-gates');
    });

    it('should update reserved skills even when force=false', async () => {
      // Create skills dir with stale reserved skill
      const skillsDir = path.join(tempDir, '.claude', 'skills', 'wu-lifecycle');
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), '# Old skill content\n');

      const result = await syncSkills(tempDir, { force: false, vendor: 'claude' });

      const content = fs.readFileSync(path.join(skillsDir, 'SKILL.md'), 'utf-8');
      expect(content).not.toBe('# Old skill content\n');
      expect(result.created).toContain('.claude/skills/wu-lifecycle/SKILL.md');
    });

    it('should never touch user-created skills outside the allowlist', async () => {
      // Create a user-owned skill
      const userSkillDir = path.join(tempDir, '.claude', 'skills', 'my-custom-skill');
      fs.mkdirSync(userSkillDir, { recursive: true });
      fs.writeFileSync(path.join(userSkillDir, 'SKILL.md'), '# My custom skill\n');

      await syncSkills(tempDir, { force: true, vendor: 'claude' });

      // User skill untouched
      const content = fs.readFileSync(path.join(userSkillDir, 'SKILL.md'), 'utf-8');
      expect(content).toBe('# My custom skill\n');
    });
  });
});
