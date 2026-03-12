// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * @file init-safety-scripts.ts
 * WU-2399: Extracted from init.ts -- husky/git hooks, pre-commit setup,
 * gitignore/prettierignore scaffolding.
 *
 * Responsible for:
 * - Scaffolding .gitignore with LumenFlow exclusions
 * - Scaffolding .prettierignore
 * - Scaffolding scripts/safe-git wrapper
 * - Scaffolding .husky/pre-commit hook
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ScaffoldOptions } from './init.js';
import type { ScaffoldResult, FileMode } from './init-scaffolding.js';
import { createFile, createExecutableScript, loadTemplate } from './init-scaffolding.js';
import {
  GITIGNORE_TEMPLATE,
  REQUIRED_GITIGNORE_EXCLUSIONS,
  PRETTIERIGNORE_TEMPLATE,
  SAFE_GIT_TEMPLATE,
  PRE_COMMIT_TEMPLATE,
} from './init-templates.js';

/** Gitignore file name constant to avoid duplicate string lint error */
const GITIGNORE_FILE_NAME = '.gitignore';

/** Prettierignore file name constant to avoid duplicate string lint error */
const PRETTIERIGNORE_FILE_NAME = '.prettierignore';

/** WU-1408: Safety script path constants */
const SCRIPTS_DIR = 'scripts';
const SAFE_GIT_FILE = 'safe-git';
const HUSKY_DIR = '.husky';
const PRE_COMMIT_FILE = 'pre-commit';
const SAFE_GIT_TEMPLATE_PATH = 'core/scripts/safe-git.template';
const PRE_COMMIT_TEMPLATE_PATH = 'core/.husky/pre-commit.template';

/**
 * WU-1171: Determine file mode from options
 */
export function getFileMode(options: ScaffoldOptions): FileMode {
  if (options.force) {
    return 'force';
  }
  if (options.merge) {
    return 'merge';
  }
  return 'skip';
}

/**
 * WU-1342: Scaffold .gitignore file with LumenFlow exclusions
 * Supports merge mode to add exclusions to existing .gitignore
 * WU-2399: Fixed gitignore matching to parse lines and ignore comments
 */
export async function scaffoldGitignore(
  targetDir: string,
  options: ScaffoldOptions,
  result: ScaffoldResult,
): Promise<void> {
  const gitignorePath = path.join(targetDir, GITIGNORE_FILE_NAME);
  const fileMode = getFileMode(options);

  // WU-1965: Auto-merge lumenflow entries when .gitignore exists, regardless of mode.
  // Previously only merge mode triggered merging; skip mode would skip the entire file,
  // risking accidental commits of .lumenflow/telemetry, worktrees, etc.
  if ((fileMode === 'merge' || fileMode === 'skip') && fs.existsSync(gitignorePath)) {
    // Merge mode or skip mode with existing file: append LumenFlow exclusions if not already present
    const existingContent = fs.readFileSync(gitignorePath, 'utf-8');
    const linesToAdd: string[] = [];

    // WU-2399: Parse gitignore lines properly -- strip comments and blank lines,
    // compare against trimmed non-comment lines only. The old `existingContent.includes(pattern)`
    // would false-positive match comments like "# ignore node_modules".
    const existingNonCommentLines = new Set(
      existingContent
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#')),
    );

    // WU-1969: Use shared constant so merge path and full template cannot drift
    for (const { pattern, line } of REQUIRED_GITIGNORE_EXCLUSIONS) {
      if (!existingNonCommentLines.has(pattern) && !existingNonCommentLines.has(line)) {
        linesToAdd.push(line);
      }
    }

    if (linesToAdd.length > 0) {
      const separator = existingContent.endsWith('\n') ? '' : '\n';
      const lumenflowBlock = `${separator}
# LumenFlow (auto-added)
${linesToAdd.join('\n')}
`;
      fs.writeFileSync(gitignorePath, existingContent + lumenflowBlock);
      result.merged = result.merged ?? [];
      result.merged.push(GITIGNORE_FILE_NAME);
    } else {
      result.skipped.push(GITIGNORE_FILE_NAME);
    }
    return;
  }

  // Force mode or file doesn't exist: write full template
  await createFile(gitignorePath, GITIGNORE_TEMPLATE, fileMode, result, targetDir);
}

/**
 * WU-1517: Scaffold .prettierignore file with sane defaults
 * This is a core file scaffolded in all modes (full and minimal)
 * because it's required for format:check gate to pass.
 */
export async function scaffoldPrettierignore(
  targetDir: string,
  options: ScaffoldOptions,
  result: ScaffoldResult,
): Promise<void> {
  const prettierignorePath = path.join(targetDir, PRETTIERIGNORE_FILE_NAME);
  const fileMode = getFileMode(options);

  await createFile(prettierignorePath, PRETTIERIGNORE_TEMPLATE, fileMode, result, targetDir);
}

/**
 * WU-1408: Scaffold safety scripts (safe-git wrapper and pre-commit hook)
 * These are core safety components needed for LumenFlow enforcement:
 * - scripts/safe-git: Blocks dangerous git operations (e.g., manual worktree remove)
 * - .husky/pre-commit: Blocks direct commits to main/master, enforces WU workflow
 *
 * Both scripts are scaffolded in all modes (full and minimal) because they are
 * required for lumenflow-doctor to pass.
 */
export async function scaffoldSafetyScripts(
  targetDir: string,
  options: ScaffoldOptions,
  result: ScaffoldResult,
): Promise<void> {
  const fileMode = getFileMode(options);

  // Scaffold scripts/safe-git
  const safeGitPath = path.join(targetDir, SCRIPTS_DIR, SAFE_GIT_FILE);
  try {
    const safeGitTemplate = loadTemplate(SAFE_GIT_TEMPLATE_PATH);
    await createExecutableScript(safeGitPath, safeGitTemplate, fileMode, result, targetDir);
  } catch {
    // Fallback to hardcoded template if template file not found
    await createExecutableScript(safeGitPath, SAFE_GIT_TEMPLATE, fileMode, result, targetDir);
  }

  // Scaffold .husky/pre-commit
  const preCommitPath = path.join(targetDir, HUSKY_DIR, PRE_COMMIT_FILE);
  try {
    const preCommitTemplate = loadTemplate(PRE_COMMIT_TEMPLATE_PATH);
    await createExecutableScript(preCommitPath, preCommitTemplate, fileMode, result, targetDir);
  } catch {
    // Fallback to hardcoded template if template file not found
    await createExecutableScript(preCommitPath, PRE_COMMIT_TEMPLATE, fileMode, result, targetDir);
  }
}
