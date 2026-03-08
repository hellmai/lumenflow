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

      expect(patterns).toContain('node_modules/**');
      expect(patterns).toContain('dist/**');
      expect(patterns).toContain('.next/**');
      expect(patterns).toContain('coverage/**');
      expect(patterns).toContain('*.log');
    });

    it('ignores comments and empty lines', async () => {
      const { parseGitignorePatterns } = await import('../dist/lane-health.js');

      projectRoot = mkdtempSync(path.join(tmpdir(), TEMP_PROJECT_PREFIX));
      const gitignorePath = path.join(projectRoot, '.gitignore');
      writeFileSync(gitignorePath, '# Comment\n\nnode_modules/\n\n# Another comment\ndist/\n');

      const patterns = parseGitignorePatterns(gitignorePath, projectRoot);

      expect(patterns).toEqual(['node_modules/**', 'dist/**']);
    });

    it('skips negation patterns', async () => {
      const { parseGitignorePatterns } = await import('../dist/lane-health.js');

      projectRoot = mkdtempSync(path.join(tmpdir(), TEMP_PROJECT_PREFIX));
      const gitignorePath = path.join(projectRoot, '.gitignore');
      writeFileSync(gitignorePath, 'dist/\n!dist/important.js\n*.log\n');

      const patterns = parseGitignorePatterns(gitignorePath, projectRoot);

      expect(patterns).toContain('dist/**');
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

      expect(patterns).toContain('packages/app/build/**');
      // *.tmp starts with * so it's not scoped — glob patterns with leading * match anywhere
      expect(patterns).toContain('*.tmp');
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

      projectRoot = createProjectFixture([
        'packages/core/src/index.ts',
      ]);
      writeFileSync(
        path.join(projectRoot, '.gitignore'),
        'dist/\n.next/\ncoverage/\n',
      );

      const patterns = collectGitignoreExcludePatterns(projectRoot);

      // Baseline patterns always present
      expect(patterns).toContain('node_modules/**');
      expect(patterns).toContain('.lumenflow/**');
      expect(patterns).toContain('worktrees/**');
      // From .gitignore
      expect(patterns).toContain('dist/**');
      expect(patterns).toContain('.next/**');
      expect(patterns).toContain('coverage/**');
    });

    it('deduplicates patterns', async () => {
      const { collectGitignoreExcludePatterns } = await import('../dist/lane-health.js');

      projectRoot = createProjectFixture([
        'packages/core/src/index.ts',
      ]);
      writeFileSync(
        path.join(projectRoot, '.gitignore'),
        'node_modules/\ndist/\n',
      );

      const patterns = collectGitignoreExcludePatterns(projectRoot);

      // node_modules/** should appear only once (baseline + .gitignore)
      const nodeModulesCount = patterns.filter((p: string) => p === 'node_modules/**').length;
      expect(nodeModulesCount).toBe(1);
    });
  });

  describe('detectCoverageGaps with gitignore', () => {
    it('excludes gitignored files from coverage gap detection', async () => {
      const { detectCoverageGaps, collectGitignoreExcludePatterns } = await import(
        '../dist/lane-health.js'
      );

      projectRoot = createProjectFixture([
        'packages/core/src/index.ts',
        'packages/cli/src/index.ts',
        'dist/bundle.js',
        '.next/server.js',
      ]);
      writeFileSync(
        path.join(projectRoot, '.gitignore'),
        'dist/\n.next/\n',
      );

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
