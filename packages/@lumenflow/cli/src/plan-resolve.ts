// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Plan File Resolution (WU-2364)
 *
 * Resolves plan file paths without forcing a naming convention on consumers.
 * Resolution order:
 *   1. Explicit --file flag (relative to plansDir)
 *   2. Initiative related_plan field (for INIT-XX IDs)
 *   3. Glob fallback: find ${id}-*.md in plansDir
 *
 * Context: WU-2364
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { die } from '@lumenflow/core/error-handler';
import { WU_PATHS } from '@lumenflow/core/wu-paths';

/** Initiative ID pattern */
const INIT_ID_PATTERN = /^INIT-[A-Z0-9]+$/i;

/** lumenflow://plans/ URI prefix */
const PLAN_URI_PREFIX = 'lumenflow://plans/';

/**
 * Extract filename from a lumenflow://plans/ URI
 */
export function parseRelatedPlanUri(uri: string): string | undefined {
  if (!uri.startsWith(PLAN_URI_PREFIX)) {
    return undefined;
  }
  return uri.slice(PLAN_URI_PREFIX.length);
}

/**
 * Read the related_plan field from an initiative YAML file.
 *
 * Does a simple regex extraction to avoid adding a YAML parser dependency.
 */
export function readInitiativeRelatedPlan(initiativePath: string): string | undefined {
  if (!existsSync(initiativePath)) {
    return undefined;
  }
  const content = readFileSync(initiativePath, { encoding: 'utf-8' });
  const match = /^related_plan:\s*(.+)$/m.exec(content);
  if (!match) {
    return undefined;
  }
  return match[1].trim();
}

/**
 * Find plan files in plansDir that start with the given ID prefix.
 */
export function findPlansByIdPrefix(plansDir: string, id: string): string[] {
  if (!existsSync(plansDir)) {
    return [];
  }
  const prefix = `${id}-`.toLowerCase();
  const files = readdirSync(plansDir);
  return files
    .filter((f) => f.toLowerCase().startsWith(prefix) && f.endsWith('.md'))
    .map((f) => join(plansDir, f));
}

export interface ResolvePlanOptions {
  /** WU or Initiative ID */
  id: string;
  /** Explicit file path (from --file flag) */
  file?: string;
  /** Base directory to resolve paths (worktree root or cwd) */
  baseDir?: string;
}

/**
 * Resolve the plan file path for a given ID.
 *
 * Resolution order:
 *   1. Explicit --file (relative to plansDir, or absolute)
 *   2. Initiative related_plan (for INIT-XX IDs)
 *   3. Glob: ${id}-*.md in plansDir
 *
 * @returns Absolute path to the plan file
 * @throws via die() if plan cannot be resolved
 */
export function resolvePlanFile(opts: ResolvePlanOptions): string {
  const { id, file, baseDir } = opts;
  const plansDir = baseDir
    ? join(baseDir, WU_PATHS.PLANS_DIR())
    : WU_PATHS.PLANS_DIR();

  // 1. Explicit --file flag
  if (file) {
    const filePath = file.startsWith('/')
      ? file
      : join(plansDir, file);
    if (!existsSync(filePath)) {
      die(
        `Plan file not found: ${filePath}\n\n` +
          `Check the --file path and try again.`,
      );
    }
    return filePath;
  }

  // 2. Initiative related_plan (for INIT-XX IDs)
  if (INIT_ID_PATTERN.test(id)) {
    const initPath = baseDir
      ? join(baseDir, WU_PATHS.INITIATIVE(id))
      : WU_PATHS.INITIATIVE(id);
    const relatedPlan = readInitiativeRelatedPlan(initPath);
    if (relatedPlan) {
      const filename = parseRelatedPlanUri(relatedPlan) ?? relatedPlan;
      const planPath = join(plansDir, filename);
      if (existsSync(planPath)) {
        return planPath;
      }
    }
  }

  // 3. Glob fallback: find ${id}-*.md in plansDir
  const matches = findPlansByIdPrefix(plansDir, id);
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    const fileList = matches.map((m) => `  - ${basename(m)}`).join('\n');
    die(
      `Multiple plan files found for ${id}:\n\n${fileList}\n\n` +
        `Use --file <filename> to specify which one.`,
    );
  }

  // Nothing found
  die(
    `No plan file found for ${id}\n\n` +
      `Options:\n` +
      `  1. Specify the file directly: --file <filename>\n` +
      `  2. Create a plan: pnpm plan:create --id ${id} --title "Title"\n` +
      `  3. Link an existing plan to the initiative: pnpm initiative:plan --initiative ${id} --plan <path>`,
  );
}
