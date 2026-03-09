/**
 * @file lane-health-gitignore.test.ts
 * WU-2346: Tests for gitignore-based exclusion patterns in lane:health
 *
 * Separate file from lane-health.test.ts because those tests mock fs.readFileSync
 * at the top level, which conflicts with parseGitignorePatterns reading real files.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const TEMP_PROJECT_PREFIX = 'lane-health-gitignore-test-';
const FIXTURE_FILE_CONTENT = '// lane-health fixture\n';
const MKDIR_RECURSIVE = { recursive: true } as const;
const RM_RECURSIVE_FORCE = { recursive: true, force: true } as const;

function createProjectFixture(filePaths: readonly string[]): string {
  const projectRoot = mkdtempSync(path.join(tmpdir(), TEMP_PROJECT_PREFIX));

  for (const relativePath of filePaths) {
    const absolutePath = path.join(projectRoot, relativePath);
    mkdirSync(path.dirname(absolutePath), MKDIR_RECURSIVE);
    writeFileSync(absolutePath, FIXTURE_FILE_CONTENT);
  }

  return projectRoot;
}

function cleanupProjectFixture(projectRoot: string): void {
  rmSync(projectRoot, RM_RECURSIVE_FORCE);
}

describe('lane-health gitignore integration (WU-2346)', () => {
  let projectRoot: string | null = null;

  afterEach(() => {
    if (projectRoot) {
      cleanupProjectFixture(projectRoot);
      projectRoot = null;
    }
  });

  describe('parseGitignorePatterns', () => {
    it('parses basic gitignore patterns from root .gitignore', async () => {
      const { parseGitignorePatterns } = await import('../dist/lane-health.js');

      projectRoot = mkdtempSync(path.join(tmpdir(), TEMP_PROJECT_PREFIX));
      const gitignorePath = path.join(projectRoot, '.gitignore');
      writeFileSync(gitignorePath, 'node_modules/\ndist/\n.next/\ncoverage/\n*.log\n');

      const patterns = parseGitignorePatterns(gitignorePath, projectRoot);

      // WU-2353: Unanchored dir patterns get **/ prefix for recursive matching
      expect(patterns).toContain('**/node_modules/**');
      expect(patterns).toContain('**/dist/**');
      expect(patterns).toContain('**/.next/**');
      expect(patterns).toContain('**/coverage/**');
      expect(patterns).toContain('*.log');
    });

    it('ignores comments and empty lines', async () => {
      const { parseGitignorePatterns } = await import('../dist/lane-health.js');

      projectRoot = mkdtempSync(path.join(tmpdir(), TEMP_PROJECT_PREFIX));
      const gitignorePath = path.join(projectRoot, '.gitignore');
      writeFileSync(gitignorePath, '# Comment\n\nnode_modules/\n\n# Another comment\ndist/\n');

      const patterns = parseGitignorePatterns(gitignorePath, projectRoot);

      // WU-2353: Unanchored dir patterns get **/ prefix
      expect(patterns).toEqual(['**/node_modules/**', '**/dist/**']);
    });

    it('skips negation patterns', async () => {
      const { parseGitignorePatterns } = await import('../dist/lane-health.js');

      projectRoot = mkdtempSync(path.join(tmpdir(), TEMP_PROJECT_PREFIX));
      const gitignorePath = path.join(projectRoot, '.gitignore');
      writeFileSync(gitignorePath, 'dist/\n!dist/important.js\n*.log\n');

      const patterns = parseGitignorePatterns(gitignorePath, projectRoot);

      // WU-2353: Unanchored dir patterns get **/ prefix
      expect(patterns).toContain('**/dist/**');
      expect(patterns).toContain('*.log');
      expect(patterns).not.toContain('!dist/important.js');
    });

    it('scopes nested .gitignore patterns to their directory', async () => {
      const { parseGitignorePatterns } = await import('../dist/lane-health.js');

      projectRoot = mkdtempSync(path.join(tmpdir(), TEMP_PROJECT_PREFIX));
      const nestedDir = path.join(projectRoot, 'packages', 'app');
      mkdirSync(nestedDir, MKDIR_RECURSIVE);
      const gitignorePath = path.join(nestedDir, '.gitignore');
      writeFileSync(gitignorePath, 'build/\n*.tmp\n');

      const patterns = parseGitignorePatterns(gitignorePath, projectRoot);

      // WU-2353: Unanchored dir pattern in nested gitignore gets **/ prefix
      expect(patterns).toContain('**/build/**');
      // *.tmp starts with * so it's not scoped — glob patterns with leading * match anywhere
      expect(patterns).toContain('*.tmp');
    });

    it('handles anchored directory patterns without recursive prefix (WU-2353)', async () => {
      const { parseGitignorePatterns } = await import('../dist/lane-health.js');

      projectRoot = mkdtempSync(path.join(tmpdir(), TEMP_PROJECT_PREFIX));
      const gitignorePath = path.join(projectRoot, '.gitignore');
      writeFileSync(gitignorePath, '/build/\n/tmp/\n');

      const patterns = parseGitignorePatterns(gitignorePath, projectRoot);

      // Anchored patterns (leading /) should NOT get **/ prefix
      expect(patterns).toContain('build/**');
      expect(patterns).toContain('tmp/**');
      expect(patterns).not.toContain('**/build/**');
      expect(patterns).not.toContain('**/tmp/**');
    });

    it('does not double-prefix already-globbed patterns (WU-2353)', async () => {
      const { parseGitignorePatterns } = await import('../dist/lane-health.js');

      projectRoot = mkdtempSync(path.join(tmpdir(), TEMP_PROJECT_PREFIX));
      const gitignorePath = path.join(projectRoot, '.gitignore');
      writeFileSync(gitignorePath, '**/dist/\n');

      const patterns = parseGitignorePatterns(gitignorePath, projectRoot);

      expect(patterns).toContain('**/dist/**');
      // Should NOT have ****/dist/**
      expect(patterns.every((p: string) => !p.includes('****'))).toBe(true);
    });

    it('handles unanchored directory patterns recursively (WU-2353)', async () => {
      const { parseGitignorePatterns } = await import('../dist/lane-health.js');

      projectRoot = mkdtempSync(path.join(tmpdir(), TEMP_PROJECT_PREFIX));
      const gitignorePath = path.join(projectRoot, '.gitignore');
      writeFileSync(gitignorePath, 'vendor/\n__pycache__/\n');

      const patterns = parseGitignorePatterns(gitignorePath, projectRoot);

      expect(patterns).toContain('**/vendor/**');
      expect(patterns).toContain('**/__pycache__/**');
    });

    it('returns empty array for missing file', async () => {
      const { parseGitignorePatterns } = await import('../dist/lane-health.js');

      const patterns = parseGitignorePatterns('/nonexistent/.gitignore', '/nonexistent');

      expect(patterns).toEqual([]);
    });
  });

  describe('collectGitignoreExcludePatterns', () => {
    it('collects patterns from root .gitignore plus baseline', async () => {
      const { collectGitignoreExcludePatterns } = await import('../dist/lane-health.js');

      projectRoot = createProjectFixture(['packages/core/src/index.ts']);
      writeFileSync(path.join(projectRoot, '.gitignore'), 'dist/\n.next/\ncoverage/\n');

      const patterns = collectGitignoreExcludePatterns(projectRoot);

      // Baseline patterns always present
      expect(patterns).toContain('node_modules/**');
      expect(patterns).toContain('.lumenflow/**');
      expect(patterns).toContain('worktrees/**');
      // From .gitignore — WU-2353: unanchored dir patterns get **/ prefix
      expect(patterns).toContain('**/dist/**');
      expect(patterns).toContain('**/.next/**');
      expect(patterns).toContain('**/coverage/**');
    });

    it('deduplicates patterns', async () => {
      const { collectGitignoreExcludePatterns } = await import('../dist/lane-health.js');

      projectRoot = createProjectFixture(['packages/core/src/index.ts']);
      writeFileSync(path.join(projectRoot, '.gitignore'), 'node_modules/\ndist/\n');

      const patterns = collectGitignoreExcludePatterns(projectRoot);

      // WU-2353: .gitignore produces **/node_modules/** while baseline has node_modules/**
      // Both should be present (different patterns) but each only once
      const baselineCount = patterns.filter((p: string) => p === 'node_modules/**').length;
      expect(baselineCount).toBe(1);
      const gitignoreCount = patterns.filter((p: string) => p === '**/node_modules/**').length;
      expect(gitignoreCount).toBe(1);
      // **/dist/** from .gitignore should appear once
      const distCount = patterns.filter((p: string) => p === '**/dist/**').length;
      expect(distCount).toBe(1);
    });
  });

  describe('detectCoverageGaps with gitignore', () => {
    it('excludes gitignored files from coverage gap detection', async () => {
      const { detectCoverageGaps, collectGitignoreExcludePatterns } =
        await import('../dist/lane-health.js');

      projectRoot = createProjectFixture([
        'packages/core/src/index.ts',
        'packages/cli/src/index.ts',
        'dist/bundle.js',
        '.next/server.js',
      ]);
      writeFileSync(path.join(projectRoot, '.gitignore'), 'dist/\n.next/\n');

      const lanes = [
        { name: 'Core', code_paths: ['packages/core/**'] },
        { name: 'CLI', code_paths: ['packages/cli/**'] },
      ];

      const excludePatterns = collectGitignoreExcludePatterns(projectRoot);
      const result = detectCoverageGaps(lanes, {
        projectRoot,
        excludePatterns,
      });

      // dist/ and .next/ should be excluded, so no gaps
      expect(result.hasGaps).toBe(false);
      expect(result.uncoveredFiles).toEqual([]);
    });
  });
});
