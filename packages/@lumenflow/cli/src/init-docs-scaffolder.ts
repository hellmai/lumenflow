// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * @file init-docs-scaffolder.ts
 * WU-2399: Extracted from init.ts -- documentation generation and framework overlay logic.
 *
 * Responsible for:
 * - Full docs scaffolding (WU dirs, templates, backlog, status)
 * - Agent onboarding docs
 * - Claude skills
 * - Framework overlay files
 */

import * as path from 'node:path';
import { createError, ErrorCodes } from '@lumenflow/core';
import type { ScaffoldOptions } from './init.js';
import type { ScaffoldResult } from './init-scaffolding.js';
import { processTemplate, loadTemplate, createFile, createDirectory } from './init-scaffolding.js';
import {
  BACKLOG_TEMPLATE,
  STATUS_TEMPLATE,
  WU_TEMPLATE_YAML,
  FRAMEWORK_HINT_TEMPLATE,
  FRAMEWORK_OVERLAY_TEMPLATE,
  WU_LIFECYCLE_SKILL_TEMPLATE,
  WORKTREE_DISCIPLINE_SKILL_TEMPLATE,
  LUMENFLOW_GATES_SKILL_TEMPLATE,
} from './init-templates.js';
import { SCAFFOLDED_ONBOARDING_TEMPLATE_PATHS } from './onboarding-template-paths.js';

/**
 * Normalize a framework name into display + slug
 */
export function normalizeFrameworkName(framework: string): { name: string; slug: string } {
  const name = framework.trim();
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    // Remove leading dashes and trailing dashes separately (explicit precedence)
    .replace(/^-+/, '')

    .replace(/-+$/, '');

  if (!slug) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, `Invalid framework name: "${framework}"`);
  }

  return { name, slug };
}

/**
 * WU-1083: Scaffold agent onboarding documentation
 * WU-1300: Added starting-prompt.md
 * WU-1309: Added onboarding docs scaffold with dynamic docs path resolution
 */
export async function scaffoldAgentOnboardingDocs(
  targetDir: string,
  options: ScaffoldOptions,
  result: ScaffoldResult,
  tokens: Record<string, string>,
): Promise<void> {
  // WU-1309: Use dynamic onboarding path from tokens
  const onboardingDir = path.join(targetDir, tokens.DOCS_ONBOARDING_PATH);

  await createDirectory(onboardingDir, result, targetDir);

  for (const [outputFile, templatePath] of Object.entries(SCAFFOLDED_ONBOARDING_TEMPLATE_PATHS)) {
    await createFile(
      path.join(onboardingDir, outputFile),
      processTemplate(loadTemplate(templatePath), tokens),
      options.force,
      result,
      targetDir,
    );
  }
}

/**
 * WU-1083: Scaffold Claude skills
 */
export async function scaffoldClaudeSkills(
  targetDir: string,
  options: ScaffoldOptions,
  result: ScaffoldResult,
  tokens: Record<string, string>,
): Promise<void> {
  const skillsDir = path.join(targetDir, '.claude', 'skills');

  // wu-lifecycle skill
  const wuLifecycleDir = path.join(skillsDir, 'wu-lifecycle');
  await createDirectory(wuLifecycleDir, result, targetDir);
  await createFile(
    path.join(wuLifecycleDir, 'SKILL.md'),
    processTemplate(WU_LIFECYCLE_SKILL_TEMPLATE, tokens),
    true,
    result,
    targetDir,
  );

  // worktree-discipline skill
  const worktreeDir = path.join(skillsDir, 'worktree-discipline');
  await createDirectory(worktreeDir, result, targetDir);
  await createFile(
    path.join(worktreeDir, 'SKILL.md'),
    processTemplate(WORKTREE_DISCIPLINE_SKILL_TEMPLATE, tokens),
    true,
    result,
    targetDir,
  );

  // lumenflow-gates skill
  const gatesDir = path.join(skillsDir, 'lumenflow-gates');
  await createDirectory(gatesDir, result, targetDir);
  await createFile(
    path.join(gatesDir, 'SKILL.md'),
    processTemplate(LUMENFLOW_GATES_SKILL_TEMPLATE, tokens),
    true,
    result,
    targetDir,
  );
}

export async function scaffoldFullDocs(
  targetDir: string,
  options: ScaffoldOptions,
  result: ScaffoldResult,
  tokens: Record<string, string>,
): Promise<void> {
  // WU-1309: Use config-derived docs paths from tokens (computed in scaffoldProject)
  const wuDir = path.join(targetDir, tokens.DOCS_WU_DIR_PATH);
  const templatesDir = path.join(targetDir, tokens.DOCS_TEMPLATES_DIR_PATH);

  await createDirectory(wuDir, result, targetDir);
  await createDirectory(templatesDir, result, targetDir);
  await createFile(path.join(wuDir, '.gitkeep'), '', options.force, result, targetDir);

  await createFile(
    path.join(targetDir, tokens.DOCS_BACKLOG_PATH),
    BACKLOG_TEMPLATE,
    true,
    result,
    targetDir,
  );

  await createFile(
    path.join(targetDir, tokens.DOCS_STATUS_PATH),
    STATUS_TEMPLATE,
    true,
    result,
    targetDir,
  );

  await createFile(
    path.join(templatesDir, 'wu-template.yaml'),
    processTemplate(WU_TEMPLATE_YAML, tokens),
    true,
    result,
    targetDir,
  );

  // WU-1083: Scaffold agent onboarding docs with --full
  await scaffoldAgentOnboardingDocs(targetDir, options, result, tokens);
}

/** Framework hint file name constant */
const FRAMEWORK_HINT_FILE = '.lumenflow.framework.yaml';

export async function scaffoldFrameworkOverlay(
  targetDir: string,
  options: ScaffoldOptions,
  result: ScaffoldResult,
  tokens: Record<string, string>,
): Promise<void> {
  if (!options.framework) {
    return;
  }

  const { name, slug } = normalizeFrameworkName(options.framework);
  const frameworkTokens = {
    ...tokens,
    FRAMEWORK_NAME: name,
    FRAMEWORK_SLUG: slug,
  };

  await createFile(
    path.join(targetDir, FRAMEWORK_HINT_FILE),
    processTemplate(FRAMEWORK_HINT_TEMPLATE, frameworkTokens),
    options.force,
    result,
    targetDir,
  );

  // WU-1309: Use dynamic operations path from tokens
  const overlayDir = path.join(targetDir, tokens.DOCS_OPERATIONS_PATH, '_frameworks', slug);
  await createDirectory(overlayDir, result, targetDir);

  await createFile(
    path.join(overlayDir, 'README.md'),
    processTemplate(FRAMEWORK_OVERLAY_TEMPLATE, frameworkTokens),
    options.force,
    result,
    targetDir,
  );
}
