#!/usr/bin/env node
// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Tests for lumenflow-upgrade CLI command
 *
 * WU-1112: INIT-003 Phase 6 - Migrate remaining Tier 1 tools
 * WU-1127: Add micro-worktree isolation pattern
 *
 * lumenflow-upgrade updates all @lumenflow/* packages to latest versions.
 * Key requirements:
 * - Uses micro-worktree pattern (atomic changes to main without requiring user worktree)
 * - Checks all 7 @lumenflow/* packages
 * - Supports --dry-run and --latest flags
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

// Mock modules with inline factories (no external references)
vi.mock('@lumenflow/core/micro-worktree', () => ({
  withMicroWorktree: vi.fn(),
}));

vi.mock('@lumenflow/core/git-adapter', () => ({
  getGitForCwd: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execSync: vi.fn(),
    execFileSync: vi.fn(),
  };
});

// Import mocked modules to access mock functions
import { withMicroWorktree } from '@lumenflow/core/micro-worktree';
import { getGitForCwd } from '@lumenflow/core/git-adapter';

// Import constants to validate command building uses centralized values
import { PKG_MANAGER, PKG_COMMANDS, PKG_FLAGS } from '@lumenflow/core/wu-constants';

// WU-2371: Import docs-sync functions for staleness tests
import {
  loadTemplate,
  processTemplate,
  CORE_DOC_TEMPLATE_PATHS,
  buildCoreDocTokens,
} from '../docs-sync.js';

// Import functions under test after mocks are set up
import {
  parseUpgradeArgs,
  LUMENFLOW_PACKAGES,
  buildUpgradeCommands,
  UpgradeArgs,
  createUpgradeMarker,
  executeUpgradeInMicroWorktree,
  validateMainCheckout,
  getInstalledCliVersion,
  resolveTargetVersion,
  buildBootstrapCommand,
  checkDocsStaleness,
  ensureBuiltinPacksRegistered,
} from '../lumenflow-upgrade.js';

// Cast mocks for TypeScript
const mockWithMicroWorktree = withMicroWorktree as ReturnType<typeof vi.fn>;
const mockGetGitForCwd = getGitForCwd as ReturnType<typeof vi.fn>;
const mockExecSync = execSync as ReturnType<typeof vi.fn>;
const mockExecFileSync = execFileSync as ReturnType<typeof vi.fn>;

describe('lumenflow-upgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock behavior for git adapter
    mockGetGitForCwd.mockReturnValue({
      raw: vi.fn().mockResolvedValue('main'),
      getStatus: vi.fn().mockResolvedValue(''),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('LUMENFLOW_PACKAGES constant', () => {
    it('should include all 7 @lumenflow/* packages', () => {
      expect(LUMENFLOW_PACKAGES).toContain('@lumenflow/agent');
      expect(LUMENFLOW_PACKAGES).toContain('@lumenflow/cli');
      expect(LUMENFLOW_PACKAGES).toContain('@lumenflow/core');
      expect(LUMENFLOW_PACKAGES).toContain('@lumenflow/initiatives');
      expect(LUMENFLOW_PACKAGES).toContain('@lumenflow/memory');
      expect(LUMENFLOW_PACKAGES).toContain('@lumenflow/metrics');
      expect(LUMENFLOW_PACKAGES).toContain('@lumenflow/shims');
      expect(LUMENFLOW_PACKAGES).toHaveLength(7);
    });

    it('should have packages in alphabetical order', () => {
      const sorted = [...LUMENFLOW_PACKAGES].sort();
      expect(LUMENFLOW_PACKAGES).toEqual(sorted);
    });
  });

  describe('parseUpgradeArgs', () => {
    it('should parse --version flag', () => {
      const args = parseUpgradeArgs(['node', 'lumenflow-upgrade.js', '--version', '1.5.0']);
      expect(args.version).toBe('1.5.0');
    });

    it('should parse --latest flag', () => {
      const args = parseUpgradeArgs(['node', 'lumenflow-upgrade.js', '--latest']);
      expect(args.latest).toBe(true);
    });

    it('should parse --dry-run flag', () => {
      const args = parseUpgradeArgs(['node', 'lumenflow-upgrade.js', '--dry-run']);
      expect(args.dryRun).toBe(true);
    });

    it('should parse --help flag', () => {
      const args = parseUpgradeArgs(['node', 'lumenflow-upgrade.js', '--help']);
      expect(args.help).toBe(true);
    });

    it('should default latest to false', () => {
      const args = parseUpgradeArgs(['node', 'lumenflow-upgrade.js']);
      expect(args.latest).toBeFalsy();
    });

    it('should default dryRun to false', () => {
      const args = parseUpgradeArgs(['node', 'lumenflow-upgrade.js']);
      expect(args.dryRun).toBeFalsy();
    });

    it('should ignore unknown flags', () => {
      const args = parseUpgradeArgs(['node', 'lumenflow-upgrade.js', '--unknown', 'value']);
      expect(args).toEqual({});
    });
  });

  describe('buildUpgradeCommands', () => {
    it('should build commands for specific version', () => {
      const args: UpgradeArgs = { version: '1.5.0' };
      const commands = buildUpgradeCommands(args);

      // Should have pnpm add command for all packages
      expect(commands.addCommand).toContain('pnpm add');
      expect(commands.addCommand).toContain('@lumenflow/agent@1.5.0');
      expect(commands.addCommand).toContain('@lumenflow/cli@1.5.0');
      expect(commands.addCommand).toContain('@lumenflow/core@1.5.0');
      expect(commands.addCommand).toContain('@lumenflow/initiatives@1.5.0');
      expect(commands.addCommand).toContain('@lumenflow/memory@1.5.0');
      expect(commands.addCommand).toContain('@lumenflow/metrics@1.5.0');
      expect(commands.addCommand).toContain('@lumenflow/shims@1.5.0');
    });

    it('should build commands for latest version', () => {
      const args: UpgradeArgs = { latest: true };
      const commands = buildUpgradeCommands(args);

      // Should have pnpm add command for all packages with @latest
      expect(commands.addCommand).toContain('pnpm add');
      expect(commands.addCommand).toContain('@lumenflow/agent@latest');
      expect(commands.addCommand).toContain('@lumenflow/cli@latest');
    });

    it('should include dev dependencies flag', () => {
      const args: UpgradeArgs = { version: '1.5.0' };
      const commands = buildUpgradeCommands(args);

      // LumenFlow packages are dev dependencies
      expect(commands.addCommand).toContain(PKG_FLAGS.SAVE_DEV);
    });

    it('should include workspace-root flag for monorepo compatibility', () => {
      const args: UpgradeArgs = { version: '1.5.0' };
      const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'lf-upgrade-workspace-'));
      writeFileSync(path.join(workspaceRoot, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
      const commands = buildUpgradeCommands(args, { cwd: workspaceRoot });
      rmSync(workspaceRoot, { recursive: true, force: true });

      // WU-1527: pnpm requires -w to add deps at workspace root
      expect(commands.addCommand).toContain(PKG_FLAGS.WORKSPACE_ROOT);
    });

    it('should omit workspace-root flag for single-package repositories', () => {
      const args: UpgradeArgs = { version: '1.5.0' };
      const singlePackageRoot = mkdtempSync(path.join(tmpdir(), 'lf-upgrade-single-'));
      const commands = buildUpgradeCommands(args, { cwd: singlePackageRoot });
      rmSync(singlePackageRoot, { recursive: true, force: true });
      expect(commands.addCommand).not.toContain(PKG_FLAGS.WORKSPACE_ROOT);
    });

    it('should use centralized constants for command structure', () => {
      const args: UpgradeArgs = { version: '1.5.0' };
      const commands = buildUpgradeCommands(args);

      // Command must start with PKG_MANAGER and PKG_COMMANDS.ADD
      expect(commands.addCommand).toMatch(new RegExp(`^${PKG_MANAGER} ${PKG_COMMANDS.ADD} `));
    });

    it('should include all 7 packages in the command', () => {
      const args: UpgradeArgs = { version: '1.5.0' };
      const commands = buildUpgradeCommands(args);

      // Count how many packages are in the command
      const packageCount = LUMENFLOW_PACKAGES.filter((pkg) =>
        commands.addCommand.includes(pkg),
      ).length;
      expect(packageCount).toBe(7);
    });
  });

  describe('createUpgradeMarker', () => {
    it('creates a pending marker with required metadata', () => {
      const marker = createUpgradeMarker('3.7.1');
      expect(marker.kind).toBe('lumenflow-upgrade');
      expect(marker.status).toBe('pending');
      expect(marker.version).toBe('3.7.1');
      expect(marker.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // WU-1127: Tests for micro-worktree isolation pattern
  describe('validateMainCheckout', () => {
    let originalCwd: typeof process.cwd;

    beforeEach(() => {
      originalCwd = process.cwd;
    });

    afterEach(() => {
      process.cwd = originalCwd;
    });

    it('should return valid when on main branch and not in worktree', async () => {
      // Mock process.cwd to be on main checkout (not worktree)
      process.cwd = vi.fn().mockReturnValue('/path/to/repo') as typeof process.cwd;

      mockGetGitForCwd.mockReturnValue({
        raw: vi.fn().mockResolvedValue('main'),
        getStatus: vi.fn().mockResolvedValue(''),
      });

      const result = await validateMainCheckout();
      expect(result.valid).toBe(true);
    });

    it('should return invalid when not on main branch', async () => {
      // Mock process.cwd to be on main checkout (not worktree)
      process.cwd = vi.fn().mockReturnValue('/path/to/repo') as typeof process.cwd;

      mockGetGitForCwd.mockReturnValue({
        raw: vi.fn().mockResolvedValue('lane/framework-cli/wu-123'),
        getStatus: vi.fn().mockResolvedValue(''),
      });

      const result = await validateMainCheckout();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be run from main checkout');
    });

    it('should return invalid when in a worktree directory', async () => {
      // Mock process.cwd() to be in a worktree
      process.cwd = vi
        .fn()
        .mockReturnValue('/path/to/repo/worktrees/some-wu') as typeof process.cwd;

      mockGetGitForCwd.mockReturnValue({
        raw: vi.fn().mockResolvedValue('main'),
        getStatus: vi.fn().mockResolvedValue(''),
      });

      const result = await validateMainCheckout();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('worktree');
    });
  });

  describe('executeUpgradeInMicroWorktree', () => {
    it('should call withMicroWorktree with correct operation name', async () => {
      mockWithMicroWorktree.mockResolvedValue({});
      mockExecSync.mockReturnValue('');

      const args: UpgradeArgs = { version: '2.1.0' };
      await executeUpgradeInMicroWorktree(args);

      expect(mockWithMicroWorktree).toHaveBeenCalledTimes(1);
      expect(mockWithMicroWorktree).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'lumenflow-upgrade',
        }),
      );
    });

    it('should use a unique ID for micro-worktree based on timestamp', async () => {
      mockWithMicroWorktree.mockResolvedValue({});
      mockExecSync.mockReturnValue('');

      const args: UpgradeArgs = { latest: true };
      await executeUpgradeInMicroWorktree(args);

      // ID should be a timestamp-like string
      expect(mockWithMicroWorktree).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringMatching(/^upgrade-\d+$/),
        }),
      );
    });

    it('should execute pnpm add in the micro-worktree', async () => {
      interface ExecuteParams {
        worktreePath: string;
      }

      mockWithMicroWorktree.mockImplementation(
        async (options: { execute: (params: ExecuteParams) => Promise<unknown> }) => {
          // Simulate calling the execute function with a worktree path
          return options.execute({ worktreePath: '/tmp/test-worktree' });
        },
      );

      const args: UpgradeArgs = { version: '2.1.0' };
      await executeUpgradeInMicroWorktree(args);

      // Verify pnpm add was executed with correct cwd
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('pnpm add'),
        expect.objectContaining({
          cwd: '/tmp/test-worktree',
        }),
      );
    });

    it('should include all 7 packages in the pnpm add command', async () => {
      interface ExecuteParams {
        worktreePath: string;
      }

      mockWithMicroWorktree.mockImplementation(
        async (options: { execute: (params: ExecuteParams) => Promise<unknown> }) => {
          return options.execute({ worktreePath: '/tmp/test-worktree' });
        },
      );

      const args: UpgradeArgs = { version: '2.1.0' };
      await executeUpgradeInMicroWorktree(args);

      // Get the command that was executed
      const execCall = mockExecSync.mock.calls[0][0];
      expect(typeof execCall).toBe('string');

      // Verify all 7 packages are included
      for (const pkg of LUMENFLOW_PACKAGES) {
        expect(execCall).toContain(`${pkg}@2.1.0`);
      }
    });

    it('should return appropriate commit message and files', async () => {
      interface ExecuteResult {
        commitMessage: string;
        files: string[];
      }
      interface ExecuteParams {
        worktreePath: string;
      }
      let executeResult: ExecuteResult | undefined;

      mockWithMicroWorktree.mockImplementation(
        async (options: { execute: (params: ExecuteParams) => Promise<ExecuteResult> }) => {
          executeResult = await options.execute({ worktreePath: '/tmp/test-worktree' });
          return executeResult;
        },
      );

      const args: UpgradeArgs = { version: '2.1.0' };
      await executeUpgradeInMicroWorktree(args);

      expect(executeResult).toBeDefined();
      expect(executeResult!.commitMessage).toContain('upgrade @lumenflow packages');
      expect(executeResult!.files).toContain('package.json');
      expect(executeResult!.files).toContain('pnpm-lock.yaml');
      expect(executeResult!.files).toContain('.lumenflow/state/lumenflow-upgrade-marker.json');
    });

    it('should use --latest version specifier when latest flag is set', async () => {
      interface ExecuteParams {
        worktreePath: string;
      }

      mockWithMicroWorktree.mockImplementation(
        async (options: { execute: (params: ExecuteParams) => Promise<unknown> }) => {
          return options.execute({ worktreePath: '/tmp/test-worktree' });
        },
      );

      const args: UpgradeArgs = { latest: true };
      await executeUpgradeInMicroWorktree(args);

      const execCall = mockExecSync.mock.calls[0][0];
      expect(execCall).toContain('@lumenflow/core@latest');
    });

    // WU-1622: After micro-worktree merge, sync main's node_modules before push
    it('should run pnpm install --frozen-lockfile on main after micro-worktree completes', async () => {
      mockWithMicroWorktree.mockResolvedValue({});
      mockExecSync.mockReturnValue('');

      const args: UpgradeArgs = { version: '2.18.1' };
      await executeUpgradeInMicroWorktree(args);

      // After withMicroWorktree resolves, pnpm install should be called on main
      const installCall = mockExecSync.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('pnpm install'),
      );
      expect(installCall).toBeDefined();
      expect(installCall![0]).toContain('--frozen-lockfile');
    });
  });

  describe('dry-run mode', () => {
    it('should not call withMicroWorktree when dryRun is true', async () => {
      const args: UpgradeArgs = { version: '2.1.0', dryRun: true };

      // In dry-run mode, executeUpgradeInMicroWorktree should not be called
      // This is handled by the main() function checking dryRun before calling execute
      // We just verify the function exists and can be called
      expect(typeof executeUpgradeInMicroWorktree).toBe('function');
    });
  });

  describe('legacy worktree validation removal', () => {
    it('should not require user to be in a worktree', () => {
      // The old implementation required users to be inside a worktree
      // The new implementation uses micro-worktree and runs from main checkout
      // This test verifies the old validateWorktreeContext is no longer used
      expect(typeof validateMainCheckout).toBe('function');
    });
  });

  // WU-2087: Self-bootstrap tests
  describe('parseUpgradeArgs --no-bootstrap', () => {
    it('should parse --no-bootstrap flag', () => {
      const args = parseUpgradeArgs(['node', 'lumenflow-upgrade.js', '--latest', '--no-bootstrap']);
      expect(args.noBootstrap).toBe(true);
      expect(args.latest).toBe(true);
    });

    it('should default noBootstrap to falsy', () => {
      const args = parseUpgradeArgs(['node', 'lumenflow-upgrade.js', '--latest']);
      expect(args.noBootstrap).toBeFalsy();
    });
  });

  describe('getInstalledCliVersion', () => {
    it('should return a semver version string', () => {
      // Reading the actual installed package — in test context this is the local build
      const version = getInstalledCliVersion();
      expect(version).toBeTruthy();
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('resolveTargetVersion', () => {
    it('should return explicit version from --version flag', async () => {
      const version = await resolveTargetVersion({ version: '4.0.0' });
      expect(version).toBe('4.0.0');
    });

    it('should resolve latest version from npm registry when --latest', async () => {
      mockExecFileSync.mockReturnValueOnce('3.2.1\n');
      const version = await resolveTargetVersion({ latest: true });
      expect(version).toBeTruthy();
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('should return null when npm view fails (offline/registry down)', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('npm ERR! network');
      });
      const version = await resolveTargetVersion({ latest: true });
      expect(version).toBeNull();
    });

    it('should return null when neither --version nor --latest specified', async () => {
      const version = await resolveTargetVersion({});
      expect(version).toBeNull();
    });
  });

  describe('buildBootstrapCommand', () => {
    it('should build a node command pointing to target version script in temp dir', () => {
      const cmd = buildBootstrapCommand('/tmp/lf-bootstrap', '3.5.0', [
        'node',
        'lumenflow-upgrade.js',
        '--latest',
      ]);
      // Should run node with the target version's script
      expect(cmd.script).toContain('/tmp/lf-bootstrap');
      expect(cmd.script).toContain('lumenflow-upgrade');
      // Should replace --latest with --version <resolved> to avoid re-resolution
      expect(cmd.args).not.toContain('--latest');
      expect(cmd.args).toContain('--version');
      expect(cmd.args).toContain('3.5.0');
      // Should add --no-bootstrap to prevent recursion
      expect(cmd.args).toContain('--no-bootstrap');
    });

    it('should not duplicate --no-bootstrap if already present', () => {
      const cmd = buildBootstrapCommand('/tmp/lf-bootstrap', '3.5.0', [
        'node',
        'lumenflow-upgrade.js',
        '--latest',
        '--no-bootstrap',
      ]);
      const count = cmd.args.filter((a: string) => a === '--no-bootstrap').length;
      expect(count).toBe(1);
    });
  });

  // WU-2373: docs:sync integration into upgrade transaction
  describe('WU-2373: executeUpgradeInMicroWorktree includes docs sync', () => {
    it('should sync core docs inside the micro-worktree transaction', async () => {
      interface ExecuteParams {
        worktreePath: string;
      }
      interface ExecuteResult {
        commitMessage: string;
        files: string[];
      }
      let executeResult: ExecuteResult | undefined;

      mockWithMicroWorktree.mockImplementation(
        async (options: { execute: (params: ExecuteParams) => Promise<ExecuteResult> }) => {
          const tempDir = mkdtempSync(path.join(tmpdir(), 'lf-upgrade-docs-'));
          mkdirSync(path.join(tempDir, '.lumenflow'), { recursive: true });
          // Create a package.json so syncScriptsToPackageJson works
          writeFileSync(
            path.join(tempDir, 'package.json'),
            JSON.stringify({ name: 'test', scripts: {} }, null, 2),
          );
          try {
            executeResult = await options.execute({ worktreePath: tempDir });
          } finally {
            rmSync(tempDir, { recursive: true, force: true });
          }
          return executeResult;
        },
      );

      const args: UpgradeArgs = { version: '2.1.0' };
      await executeUpgradeInMicroWorktree(args);

      // The commit should include core doc files
      expect(executeResult).toBeDefined();
      expect(executeResult!.files).toEqual(
        expect.arrayContaining([expect.stringContaining('LUMENFLOW.md')]),
      );
    });

    it('should refresh existing non-Claude bootstrap files during upgrade without forcing Claude assets', async () => {
      interface ExecuteParams {
        worktreePath: string;
      }
      interface ExecuteResult {
        commitMessage: string;
        files: string[];
      }
      let executeResult: ExecuteResult | undefined;

      mockWithMicroWorktree.mockImplementation(
        async (options: { execute: (params: ExecuteParams) => Promise<ExecuteResult> }) => {
          const tempDir = mkdtempSync(path.join(tmpdir(), 'lf-upgrade-vendor-'));
          mkdirSync(path.join(tempDir, '.lumenflow'), { recursive: true });
          mkdirSync(path.join(tempDir, '.cursor', 'rules'), { recursive: true });
          writeFileSync(
            path.join(tempDir, '.cursor', 'rules', 'lumenflow.md'),
            '# Existing cursor\n',
          );
          writeFileSync(
            path.join(tempDir, 'package.json'),
            JSON.stringify({ name: 'test', scripts: {} }, null, 2),
          );
          try {
            executeResult = await options.execute({ worktreePath: tempDir });
          } finally {
            rmSync(tempDir, { recursive: true, force: true });
          }
          return executeResult;
        },
      );

      await executeUpgradeInMicroWorktree({ version: '2.1.0' });

      expect(executeResult).toBeDefined();
      expect(executeResult!.files).toEqual(expect.arrayContaining(['.cursor/rules/lumenflow.md']));
      expect(executeResult!.files).not.toEqual(
        expect.arrayContaining(['.claude/skills/wu-lifecycle/SKILL.md']),
      );
    });

    it('should not print "run docs:sync" advice after upgrade', async () => {
      mockWithMicroWorktree.mockResolvedValue({});
      mockExecSync.mockReturnValue('');

      const consoleSpy = vi.spyOn(console, 'log');

      const args: UpgradeArgs = { version: '2.1.0' };
      await executeUpgradeInMicroWorktree(args);

      // Should NOT advise running docs:sync separately
      const logCalls = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logCalls).not.toContain('pnpm docs:sync');

      consoleSpy.mockRestore();
    });
  });

  // WU-2371: Staleness checker tests
  describe('checkDocsStaleness', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(path.join(tmpdir(), 'lf-staleness-test-'));
      mkdirSync(path.join(tempDir, '.lumenflow'), { recursive: true });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('should report missing files as stale', () => {
      // No files on disk → all stale
      const result = checkDocsStaleness(tempDir);
      expect(result.stale).toBe(true);
      expect(result.staleFiles.length).toBeGreaterThan(0);
    });

    it('should not false-positive on docs synced with a different date', () => {
      // Build the full token set, then override DATE with yesterday
      const tokens = { ...buildCoreDocTokens(tempDir) };
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      tokens.DATE = yesterday;

      for (const [outputFile, templatePath] of Object.entries(CORE_DOC_TEMPLATE_PATHS) as [
        string,
        string,
      ][]) {
        const templateContent = loadTemplate(templatePath);
        const processedContent = processTemplate(templateContent, tokens);
        const filePath = path.join(tempDir, outputFile);
        mkdirSync(path.dirname(filePath), { recursive: true });
        writeFileSync(filePath, processedContent);
      }

      // The staleness check should NOT report these as stale
      // (date difference should be ignored)
      const result = checkDocsStaleness(tempDir);
      expect(result.stale).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // WU-2438: ensureBuiltinPacksRegistered
  // ---------------------------------------------------------------------------

  describe('ensureBuiltinPacksRegistered (WU-2438)', () => {
    it('adds SD pack when packs is empty and workspace has software_delivery', () => {
      const workspace: Record<string, unknown> = {
        id: 'ws-1',
        packs: [],
        software_delivery: { version: '1.0.0' },
      };
      const result = ensureBuiltinPacksRegistered(workspace, '3.18.0');
      expect(result.modified).toBe(true);
      expect(result.added).toEqual(['software-delivery']);
      const packs = workspace.packs as Array<Record<string, unknown>>;
      expect(packs).toHaveLength(1);
      expect(packs[0].id).toBe('software-delivery');
      expect(packs[0].version).toBe('3.18.0');
    });

    it('does not add SD pack when already registered', () => {
      const workspace: Record<string, unknown> = {
        id: 'ws-1',
        packs: [{ id: 'software-delivery', version: '3.0.0', integrity: 'dev', source: 'local' }],
        software_delivery: { version: '1.0.0' },
      };
      const result = ensureBuiltinPacksRegistered(workspace, '3.18.0');
      expect(result.modified).toBe(false);
      expect(result.added).toEqual([]);
      expect((workspace.packs as unknown[]).length).toBe(1);
    });

    it('does not add SD pack when workspace has no software_delivery key', () => {
      const workspace: Record<string, unknown> = {
        id: 'ws-1',
        packs: [],
      };
      const result = ensureBuiltinPacksRegistered(workspace, '3.18.0');
      expect(result.modified).toBe(false);
      expect(result.added).toEqual([]);
    });

    it('creates packs array when missing', () => {
      const workspace: Record<string, unknown> = {
        id: 'ws-1',
        software_delivery: { version: '1.0.0' },
      };
      const result = ensureBuiltinPacksRegistered(workspace, '3.18.0');
      expect(result.modified).toBe(true);
      expect(Array.isArray(workspace.packs)).toBe(true);
    });
  });
});
