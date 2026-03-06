// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveCliTemplatesDir } from '../template-directory-resolver.js';

function createCliLayout(root: string): {
  packageRoot: string;
  templatesDir: string;
  distDir: string;
} {
  const packageRoot = path.join(root, 'packages', '@lumenflow', 'cli');
  const templatesDir = path.join(packageRoot, 'templates');
  const distDir = path.join(packageRoot, 'dist');

  mkdirSync(path.join(templatesDir, 'core', 'ai', 'onboarding'), { recursive: true });
  mkdirSync(distDir, { recursive: true });

  return { packageRoot, templatesDir, distDir };
}

describe('resolveCliTemplatesDir', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots) {
      rmSync(root, { recursive: true, force: true });
    }
    tempRoots.length = 0;
  });

  it('prefers worktree templates when dist resolves to the main checkout', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'template-dir-resolver-'));
    tempRoots.push(fixtureRoot);

    const mainRoot = path.join(fixtureRoot, 'main');
    const worktreeRoot = path.join(fixtureRoot, 'worktree');
    const mainLayout = createCliLayout(mainRoot);
    const worktreeLayout = createCliLayout(worktreeRoot);

    rmSync(worktreeLayout.distDir, { recursive: true, force: true });
    symlinkSync(mainLayout.distDir, worktreeLayout.distDir, 'dir');

    writeFileSync(
      path.join(
        worktreeLayout.templatesDir,
        'core',
        'ai',
        'onboarding',
        'first-15-mins.md.template',
      ),
      '# Branch-only template\n',
      'utf-8',
    );

    const moduleUrl = pathToFileURL(path.join(mainLayout.distDir, 'init-scaffolding.js')).href;

    expect(
      resolveCliTemplatesDir({
        cwd: worktreeRoot,
        moduleUrl,
      }),
    ).toBe(worktreeLayout.templatesDir);
  });

  it('supports package-local cwd values inside the claimed worktree', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'template-dir-resolver-'));
    tempRoots.push(fixtureRoot);

    const mainRoot = path.join(fixtureRoot, 'main');
    const worktreeRoot = path.join(fixtureRoot, 'worktree');
    const mainLayout = createCliLayout(mainRoot);
    const worktreeLayout = createCliLayout(worktreeRoot);
    const cliSrcDir = path.join(worktreeLayout.packageRoot, 'src');

    mkdirSync(cliSrcDir, { recursive: true });
    rmSync(worktreeLayout.distDir, { recursive: true, force: true });
    symlinkSync(mainLayout.distDir, worktreeLayout.distDir, 'dir');

    const moduleUrl = pathToFileURL(path.join(mainLayout.distDir, 'docs-sync.js')).href;

    expect(
      resolveCliTemplatesDir({
        cwd: cliSrcDir,
        moduleUrl,
      }),
    ).toBe(worktreeLayout.templatesDir);
  });

  it('falls back to the module package templates when cwd is outside any repo checkout', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'template-dir-resolver-'));
    tempRoots.push(fixtureRoot);

    const mainRoot = path.join(fixtureRoot, 'main');
    const outsideRoot = path.join(fixtureRoot, 'outside');
    const mainLayout = createCliLayout(mainRoot);

    mkdirSync(outsideRoot, { recursive: true });

    const moduleUrl = pathToFileURL(path.join(mainLayout.distDir, 'init-scaffolding.js')).href;

    expect(
      resolveCliTemplatesDir({
        cwd: outsideRoot,
        moduleUrl,
      }),
    ).toBe(mainLayout.templatesDir);
  });
});
