#!/usr/bin/env node
// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * @file docs-sync.ts
 * LumenFlow docs:sync command for syncing agent docs to existing projects (WU-1083)
 * WU-1085: Added createWUParser for proper --help support
 * WU-1124: Refactored to read templates from bundled files (INIT-004 Phase 2)
 * WU-1362: Added branch guard to check branch before writing tracked files
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createWUParser,
  WU_OPTIONS,
  getDefaultConfig,
  createError,
  ErrorCodes,
  LUMENFLOW_CLIENT_IDS,
} from '@lumenflow/core';
import { createWuPaths } from '@lumenflow/core/wu-paths';
import { GIT_DIRECTORY_NAME, getConfig } from '@lumenflow/core/config';
// WU-1362: Import worktree guard utilities for branch checking
import { isMainBranch, isInWorktree } from '@lumenflow/core/core/worktree-guard';
// WU-2373: Import micro-worktree for isolation on main branch
import { withMicroWorktree, isInGitWorktree } from '@lumenflow/core/micro-worktree';
import { SCAFFOLDED_ONBOARDING_TEMPLATE_PATHS } from './onboarding-template-paths.js';
import { resolveCliTemplatesDir } from './template-directory-resolver.js';
import { updateMergeBlock, extractMergeBlock, MARKERS } from './merge-block.js';

export type VendorType = 'claude' | 'cursor' | 'windsurf' | 'cline' | 'aider' | 'all' | 'none';

/**
 * WU-1085: CLI option definitions for docs-sync command
 */
const DOCS_SYNC_OPTIONS = {
  vendor: {
    name: 'vendor',
    flags: '--vendor <type>',
    description: 'Vendor type (claude, cursor, windsurf, cline, aider, all, none)',
    default: 'claude',
  },
  force: WU_OPTIONS.force,
};

/**
 * WU-1085: Parse docs-sync command options using createWUParser
 * Provides proper --help, --version, and option parsing
 */
export function parseDocsSyncOptions(): {
  force: boolean;
  vendor: VendorType;
} {
  const opts = createWUParser({
    name: 'lumenflow-docs-sync',
    description:
      'Refresh managed docs, onboarding docs, and selected vendor bootstrap assets safely',
    options: Object.values(DOCS_SYNC_OPTIONS),
  });

  return {
    force: opts.force ?? false,
    vendor: (opts.vendor as VendorType) ?? 'claude',
  };
}

export interface SyncOptions {
  force: boolean;
  vendor?: VendorType;
  vendors?: VendorType[];
  refreshManagedOnboarding?: boolean;
}

export interface SyncResult {
  created: string[];
  skipped: string[];
  /** WU-1362: Warnings from branch guard or other checks */
  warnings?: string[];
}

function resolveDocsSyncDirectories(targetDir: string): {
  onboardingDir: string;
  skillsDir: string;
} {
  try {
    const config = getConfig({ projectRoot: targetDir, reload: true });
    return {
      onboardingDir: path.join(targetDir, config.directories.onboardingDir),
      skillsDir: path.join(targetDir, config.directories.skillsDir),
    };
  } catch {
    const defaults = getDefaultConfig();
    return {
      onboardingDir: path.join(targetDir, defaults.directories.onboardingDir),
      skillsDir: path.join(targetDir, defaults.directories.skillsDir),
    };
  }
}

/**
 * WU-1124: Get the templates directory path
 * Templates are bundled with the CLI package at dist/templates/
 * Falls back to src/templates/ for development
 */
export function getTemplatesDir(): string {
  return resolveCliTemplatesDir();
}

/**
 * WU-1124: Load a template file from the bundled templates directory
 * @param templatePath - Relative path from templates directory (e.g., 'core/ai/onboarding/quick-ref-commands.md.template')
 * @returns Template content as string
 */
export function loadTemplate(templatePath: string): string {
  const templatesDir = getTemplatesDir();
  const fullPath = path.join(templatesDir, templatePath);

  if (!fs.existsSync(fullPath)) {
    throw createError(
      ErrorCodes.FILE_NOT_FOUND,
      `Template not found: ${templatePath} (looked at ${fullPath})`,
    );
  }

  return fs.readFileSync(fullPath, 'utf-8');
}

/**
 * Get current date in YYYY-MM-DD format
 */
function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Process template content by replacing placeholders
 */
export function processTemplate(content: string, tokens: Record<string, string>): string {
  let output = content;
  for (const [key, value] of Object.entries(tokens)) {
    // eslint-disable-next-line security/detect-non-literal-regexp -- key is from internal token map, not user input
    output = output.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return output;
}

/**
 * WU-2371: Build full token set for core doc template rendering.
 * Matches the token set used by init.ts to ensure all placeholders are resolved.
 */
export function buildCoreDocTokens(targetDir: string): Record<string, string> {
  const wuPaths = createWuPaths({ projectRoot: targetDir });
  const wuDir = wuPaths.WU_DIR().split(path.sep).join('/');
  const tasksDir = path.posix.dirname(wuDir);
  const onboardingPath = wuPaths.ONBOARDING_DIR().split(path.sep).join('/');
  const quickRefPath = wuPaths.QUICK_REF_PATH().split(path.sep).join('/');
  const operationsPath = path.posix.dirname(tasksDir);
  const backlogPath = wuPaths.BACKLOG().split(path.sep).join('/');
  const statusPath = wuPaths.STATUS().split(path.sep).join('/');

  return {
    DATE: getCurrentDate(),
    PROJECT_ROOT: '<project-root>',
    QUICK_REF_LINK: quickRefPath,
    DOCS_OPERATIONS_PATH: operationsPath,
    DOCS_TASKS_PATH: tasksDir,
    DOCS_ONBOARDING_PATH: onboardingPath,
    DOCS_WU_DIR_PATH: wuDir,
    DOCS_TEMPLATES_DIR_PATH: `${tasksDir}/templates`,
    DOCS_BACKLOG_PATH: backlogPath,
    DOCS_STATUS_PATH: statusPath,
  };
}

function getRelativePath(targetDir: string, filePath: string): string {
  return path.relative(targetDir, filePath).split(path.sep).join('/');
}

/**
 * Create a directory if missing
 */
async function createDirectory(
  dirPath: string,
  result: SyncResult,
  targetDir: string,
): Promise<void> {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    result.created.push(getRelativePath(targetDir, dirPath));
  }
}

/**
 * Create a file, respecting force option
 */
async function createFile(
  filePath: string,
  content: string,
  force: boolean,
  result: SyncResult,
  targetDir: string,
): Promise<void> {
  const relativePath = getRelativePath(targetDir, filePath);

  if (fs.existsSync(filePath) && !force) {
    result.skipped.push(relativePath);
    return;
  }

  const parentDir = path.dirname(filePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  fs.writeFileSync(filePath, content);
  result.created.push(relativePath);
}

/**
 * WU-2366: Template paths for core docs synced by docs:sync
 * Maps output file paths (relative to targetDir) to template paths (relative to templates dir)
 */
export const CORE_DOC_TEMPLATE_PATHS: Record<string, string> = {
  'LUMENFLOW.md': 'core/LUMENFLOW.md.template',
  'AGENTS.md': 'core/AGENTS.md.template',
  '.lumenflow/constraints.md': 'core/.lumenflow/constraints.md.template',
};

/**
 * WU-2383: Managed docs — 100% LumenFlow-owned, safe to force-sync on upgrade.
 * Users MUST NOT edit these files; use LUMENFLOW.local.md for project-specific additions.
 */
export const MANAGED_DOC_PATHS: Record<string, string> = {
  'LUMENFLOW.md': 'core/LUMENFLOW.md.template',
  '.lumenflow/constraints.md': 'core/.lumenflow/constraints.md.template',
};

/**
 * WU-2383: Bootstrap docs — shared files using merge-block markers.
 * LumenFlow content lives between LUMENFLOW:START/END markers.
 * User content outside markers is never touched.
 */
export const BOOTSTRAP_DOC_PATHS: Record<string, string> = {
  'AGENTS.md': 'core/AGENTS.md.template',
};

type SupportedBootstrapVendor = Exclude<VendorType, 'all' | 'none' | 'aider'>;

export const VENDOR_BOOTSTRAP_TEMPLATE_PATHS: Record<
  SupportedBootstrapVendor,
  Record<string, string>
> = {
  claude: {
    'CLAUDE.md': 'vendors/claude/.claude/CLAUDE.md.template',
  },
  cursor: {
    '.cursor/rules/lumenflow.md': 'vendors/cursor/.cursor/rules/lumenflow.md.template',
  },
  windsurf: {
    '.windsurf/rules/lumenflow.md': 'vendors/windsurf/.windsurf/rules/lumenflow.md.template',
  },
  cline: {
    '.clinerules': 'vendors/cline/.clinerules.template',
  },
};

const CLAUDE_VENDOR_TEMPLATE_ROOT = ['vendors', 'claude', '.claude'].join('/');
const CLAUDE_SKILLS_TEMPLATE_ROOT = `${CLAUDE_VENDOR_TEMPLATE_ROOT}/skills`;

/**
 * WU-1124: Template paths for Claude skills
 * Maps skill names to template paths
 */
const SKILL_TEMPLATE_PATHS: Record<string, string> = {
  'wu-lifecycle': `${CLAUDE_SKILLS_TEMPLATE_ROOT}/wu-lifecycle/SKILL.md.template`,
  'worktree-discipline': `${CLAUDE_SKILLS_TEMPLATE_ROOT}/worktree-discipline/SKILL.md.template`,
  'lumenflow-gates': `${CLAUDE_SKILLS_TEMPLATE_ROOT}/lumenflow-gates/SKILL.md.template`,
};

/**
 * WU-2383: Exact allowlist of LumenFlow-owned skill names.
 * These skills are managed and updatable on upgrade.
 * User-created skills outside this list are never touched.
 */
export const RESERVED_SKILL_NAMES: string[] = Object.keys(SKILL_TEMPLATE_PATHS);

function mergeBootstrapContent(
  filePath: string,
  processedContent: string,
  targetDir: string,
  result: SyncResult,
): void {
  const relativePath = path.relative(targetDir, filePath).split(path.sep).join('/');

  if (fs.existsSync(filePath)) {
    const existingContent = fs.readFileSync(filePath, 'utf-8');
    const migratedLegacyContent = migrateLegacyBootstrapScaffold(existingContent, processedContent);
    if (migratedLegacyContent !== null) {
      if (migratedLegacyContent === existingContent) {
        result.skipped.push(relativePath);
      } else {
        fs.writeFileSync(filePath, migratedLegacyContent);
        result.created.push(relativePath);
      }
      return;
    }

    const mergeResult = updateMergeBlock(existingContent, processedContent);

    if (mergeResult.updated) {
      fs.writeFileSync(filePath, mergeResult.content);
      result.created.push(relativePath);
    } else {
      result.skipped.push(relativePath);
    }

    if (mergeResult.warning) {
      result.warnings = result.warnings ?? [];
      result.warnings.push(`${relativePath}: ${mergeResult.warning}`);
    }
    return;
  }

  const wrappedContent = `${MARKERS.START}\n${processedContent}\n${MARKERS.END}\n`;
  const parentDir = path.dirname(filePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  fs.writeFileSync(filePath, wrappedContent);
  result.created.push(relativePath);
}

const DATE_PATTERN = /\d{4}-\d{2}-\d{2}/g;
const DATE_PLACEHOLDER = 'XXXX-XX-XX';

function normalizeScaffoldContent(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(DATE_PATTERN, DATE_PLACEHOLDER).trim();
}

function getMeaningfulLines(content: string): string[] {
  return normalizeScaffoldContent(content)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasMatchingTitle(existingContent: string, templateContent: string): boolean {
  const existingTitle = getMeaningfulLines(existingContent)[0] ?? '';
  const templateTitle = getMeaningfulLines(templateContent)[0] ?? '';
  return existingTitle.length > 0 && existingTitle === templateTitle;
}

function isScaffoldLikeContent(existingContent: string, templateContent: string): boolean {
  const normalizedExisting = normalizeScaffoldContent(existingContent);
  const normalizedTemplate = normalizeScaffoldContent(templateContent);

  if (normalizedExisting === normalizedTemplate) {
    return true;
  }

  if (!hasMatchingTitle(existingContent, templateContent)) {
    return false;
  }

  const existingLines = new Set(getMeaningfulLines(existingContent));
  const templateLines = getMeaningfulLines(templateContent);
  if (templateLines.length === 0) {
    return false;
  }

  const overlapCount = templateLines.filter((line) => existingLines.has(line)).length;
  return overlapCount / templateLines.length >= 0.6;
}

function renderBootstrapContentWithPreservedAdditions(
  beforeLines: string[],
  processedContent: string,
  afterLines: string[],
  lineEnding: '\n' | '\r\n',
): string {
  const sections: string[] = [];

  const before = beforeLines.join(lineEnding).trim();
  if (before) {
    sections.push(before);
  }

  sections.push([MARKERS.START, processedContent, MARKERS.END].join(lineEnding));

  const after = afterLines.join(lineEnding).trim();
  if (after) {
    sections.push(after);
  }

  return sections.join(`${lineEnding}${lineEnding}`) + lineEnding;
}

function migrateLegacyBootstrapScaffold(
  existingContent: string,
  processedContent: string,
): string | null {
  const extraction = extractMergeBlock(existingContent);
  if (extraction.found || extraction.malformed) {
    return null;
  }

  if (!isScaffoldLikeContent(existingContent, processedContent)) {
    return null;
  }

  const lineEnding = existingContent.includes('\r\n') ? '\r\n' : '\n';
  const existingLines = existingContent.replace(/\r\n/g, '\n').split('\n');
  const templateLines = processedContent.replace(/\r\n/g, '\n').split('\n');
  const firstTemplateLine = templateLines.find((line) => line.trim().length > 0);
  const lastTemplateLine = [...templateLines].reverse().find((line) => line.trim().length > 0);

  if (!firstTemplateLine || !lastTemplateLine) {
    return [MARKERS.START, processedContent, MARKERS.END, ''].join(lineEnding);
  }

  const firstIndex = existingLines.findIndex((line) => line.trim() === firstTemplateLine.trim());
  const reverseIndex = [...existingLines]
    .reverse()
    .findIndex((line) => line.trim() === lastTemplateLine.trim());
  const lastIndex = reverseIndex === -1 ? -1 : existingLines.length - reverseIndex - 1;

  if (firstIndex === -1 || lastIndex === -1 || lastIndex < firstIndex) {
    return [MARKERS.START, processedContent, MARKERS.END, ''].join(lineEnding);
  }

  return renderBootstrapContentWithPreservedAdditions(
    existingLines.slice(0, firstIndex),
    processedContent,
    existingLines.slice(lastIndex + 1),
    lineEnding,
  );
}

function normalizeConfiguredVendor(clientName: string): VendorType | null {
  switch (clientName) {
    case 'claude':
    case LUMENFLOW_CLIENT_IDS.CLAUDE_CODE:
      return 'claude';
    case 'cursor':
      return 'cursor';
    case 'windsurf':
      return 'windsurf';
    case 'cline':
      return 'cline';
    default:
      return null;
  }
}

export function inferConfiguredVendors(targetDir: string): VendorType[] {
  const inferred = new Set<VendorType>();
  const workspacePath = path.join(targetDir, 'workspace.yaml');

  for (const [vendor, files] of Object.entries(VENDOR_BOOTSTRAP_TEMPLATE_PATHS) as [
    SupportedBootstrapVendor,
    Record<string, string>,
  ][]) {
    if (Object.keys(files).some((relPath) => fs.existsSync(path.join(targetDir, relPath)))) {
      inferred.add(vendor);
    }
  }

  if (!fs.existsSync(workspacePath)) {
    return [...inferred];
  }

  try {
    const config = getConfig({ projectRoot: targetDir, reload: true });
    const configuredClients = new Set<string>([
      config.agents.defaultClient,
      ...Object.keys(config.agents.clients ?? {}),
    ]);

    for (const clientName of configuredClients) {
      const vendor = normalizeConfiguredVendor(clientName);
      if (vendor) {
        inferred.add(vendor);
      }
    }
  } catch {
    // Fall back to file-based detection only.
  }

  return [...inferred];
}

function resolveSelectedVendors(vendor?: VendorType, vendors?: VendorType[]): VendorType[] {
  if (vendors && vendors.length > 0) {
    return [...vendors];
  }

  if (!vendor || vendor === 'none') {
    return [];
  }

  if (vendor === 'all') {
    return Object.keys(VENDOR_BOOTSTRAP_TEMPLATE_PATHS) as Exclude<
      VendorType,
      'all' | 'none' | 'aider'
    >[];
  }

  if (vendor === 'aider') {
    return [];
  }

  return [vendor];
}

/**
 * Sync agent onboarding docs to an existing project
 * WU-1124: Now reads templates from bundled files instead of hardcoded strings
 */
export async function syncAgentDocs(targetDir: string, options: SyncOptions): Promise<SyncResult> {
  const result: SyncResult = {
    created: [],
    skipped: [],
  };

  const tokens = buildCoreDocTokens(targetDir);

  const { onboardingDir } = resolveDocsSyncDirectories(targetDir);

  await createDirectory(onboardingDir, result, targetDir);

  // WU-1124: Load and process templates from bundled files
  for (const [outputFile, templatePath] of Object.entries(SCAFFOLDED_ONBOARDING_TEMPLATE_PATHS)) {
    const templateContent = loadTemplate(templatePath);
    const processedContent = processTemplate(templateContent, tokens);
    const outputPath = path.join(onboardingDir, outputFile);

    if (
      fs.existsSync(outputPath) &&
      !options.force &&
      !(
        options.refreshManagedOnboarding &&
        isScaffoldLikeContent(fs.readFileSync(outputPath, 'utf-8'), processedContent)
      )
    ) {
      result.skipped.push(getRelativePath(targetDir, outputPath));
      continue;
    }

    await createFile(outputPath, processedContent, true, result, targetDir);
  }

  return result;
}

/**
 * Sync Claude skills to an existing project
 * WU-1124: Now reads templates from bundled files instead of hardcoded strings
 * WU-2383: Reserved skill names are always updated (allowlist-based).
 *          User-created skills outside the allowlist are never touched.
 */
export async function syncSkills(targetDir: string, options: SyncOptions): Promise<SyncResult> {
  const result: SyncResult = {
    created: [],
    skipped: [],
  };

  const selectedVendors = resolveSelectedVendors(options.vendor, options.vendors);
  if (!selectedVendors.includes('claude')) {
    return result;
  }

  const tokens = {
    DATE: getCurrentDate(),
  };

  const { skillsDir } = resolveDocsSyncDirectories(targetDir);

  // WU-2383: Only sync skills in the reserved allowlist. User-created skills are never touched.
  for (const [skillName, templatePath] of Object.entries(SKILL_TEMPLATE_PATHS)) {
    const skillDir = path.join(skillsDir, skillName);
    await createDirectory(skillDir, result, targetDir);

    const templateContent = loadTemplate(templatePath);
    const processedContent = processTemplate(templateContent, tokens);

    // WU-2383: Reserved skills are always written (managed content).
    // force=true for reserved skills regardless of caller's force flag.
    await createFile(path.join(skillDir, 'SKILL.md'), processedContent, true, result, targetDir);
  }

  return result;
}

export async function syncVendorBootstraps(
  targetDir: string,
  options: SyncOptions,
): Promise<SyncResult> {
  const result: SyncResult = {
    created: [],
    skipped: [],
  };

  const tokens = buildCoreDocTokens(targetDir);
  const selectedVendors = resolveSelectedVendors(options.vendor, options.vendors);

  for (const vendor of selectedVendors) {
    const templateMap = VENDOR_BOOTSTRAP_TEMPLATE_PATHS[vendor as SupportedBootstrapVendor];
    if (!templateMap) {
      continue;
    }

    for (const [outputFile, templatePath] of Object.entries(templateMap)) {
      const processedContent = processTemplate(loadTemplate(templatePath), tokens);
      mergeBootstrapContent(path.join(targetDir, outputFile), processedContent, targetDir, result);
    }
  }

  return result;
}

/**
 * WU-2366: Sync core docs (LUMENFLOW.md, AGENTS.md, constraints.md) to an existing project
 * WU-2383: Split into managed docs (force-sync) and bootstrap docs (merge-block).
 *
 * Managed docs (LUMENFLOW.md, constraints.md) are always written from template.
 * Bootstrap docs (AGENTS.md) use merge-block markers to preserve user content.
 */
export async function syncCoreDocs(targetDir: string, _options: SyncOptions): Promise<SyncResult> {
  const result: SyncResult = {
    created: [],
    skipped: [],
  };

  const tokens = buildCoreDocTokens(targetDir);

  // WU-2383: Managed docs — always write from template (these are 100% LumenFlow-owned)
  for (const [outputFile, templatePath] of Object.entries(MANAGED_DOC_PATHS)) {
    const templateContent = loadTemplate(templatePath);
    const processedContent = processTemplate(templateContent, tokens);
    const filePath = path.join(targetDir, outputFile);

    // WU-2383: Migration guard — if user has hand-edited a managed file,
    // back up to .local.md before overwriting (first upgrade only).
    if (outputFile === 'LUMENFLOW.md' && fs.existsSync(filePath)) {
      const existingContent = fs.readFileSync(filePath, 'utf-8');
      const normalizedExisting = existingContent.replace(DATE_PATTERN, DATE_PLACEHOLDER);
      const normalizedTemplate = processedContent.replace(DATE_PATTERN, DATE_PLACEHOLDER);

      if (
        normalizedExisting !== normalizedTemplate &&
        !isScaffoldLikeContent(existingContent, processedContent)
      ) {
        const localPath = path.join(targetDir, 'LUMENFLOW.local.md');
        if (!fs.existsSync(localPath)) {
          // First drift detection: save user's custom content to .local.md
          fs.writeFileSync(localPath, existingContent);
          result.warnings = result.warnings ?? [];
          result.warnings.push(
            `LUMENFLOW.md has local modifications. Backed up to LUMENFLOW.local.md before overwriting.`,
          );
          result.created.push('LUMENFLOW.local.md');
        }
      }
    }

    // Always write managed docs regardless of force flag
    await createFile(filePath, processedContent, true, result, targetDir);
  }

  // WU-2383: Bootstrap docs — use merge-block to preserve user content
  for (const [outputFile, templatePath] of Object.entries(BOOTSTRAP_DOC_PATHS)) {
    const templateContent = loadTemplate(templatePath);
    const processedContent = processTemplate(templateContent, tokens);
    const filePath = path.join(targetDir, outputFile);
    mergeBootstrapContent(filePath, processedContent, targetDir, result);
  }

  return result;
}

/** Log prefix for console output */
const LOG_PREFIX = '[lumenflow docs:sync]';

/** Operation name for micro-worktree */
const OPERATION_NAME = 'docs-sync';

/**
 * WU-2373: Determine whether docs:sync should use micro-worktree isolation.
 *
 * Returns true when on main branch AND not in a worktree.
 * Returns false when in a worktree, on a non-main branch, or not in git.
 */
async function shouldUseMicroWorktree(targetDir: string): Promise<boolean> {
  // If running inside a git worktree, write directly (existing behavior)
  if (isInGitWorktree()) {
    return false;
  }

  // Check if we're in a worktree via path-based detection
  if (isInWorktree({ cwd: targetDir })) {
    return false;
  }

  // Only check if target is a git repository
  const gitDir = path.join(targetDir, GIT_DIRECTORY_NAME);
  if (!fs.existsSync(gitDir)) {
    return false;
  }

  // Check if on main branch
  try {
    return await isMainBranch();
  } catch {
    return false;
  }
}

/**
 * WU-2373: Execute all docs sync operations in a given directory.
 * Shared logic used by both direct-write and micro-worktree paths.
 *
 * @returns Object with created files list and commit message
 */
export async function executeDocsSyncInDir(
  targetDir: string,
  options: SyncOptions & { vendor?: VendorType },
): Promise<{ created: string[]; skipped: string[]; allFiles: string[] }> {
  const selectedVendors =
    options.vendor === undefined
      ? inferConfiguredVendors(targetDir)
      : resolveSelectedVendors(options.vendor, options.vendors);
  const coreResult = await syncCoreDocs(targetDir, { force: options.force });
  const docsResult = await syncAgentDocs(targetDir, {
    force: options.force,
    refreshManagedOnboarding: options.refreshManagedOnboarding,
  });
  const vendorBootstrapResult = await syncVendorBootstraps(targetDir, {
    force: options.force,
    vendors: selectedVendors,
  });
  const skillsResult = await syncSkills(targetDir, {
    force: options.force,
    vendors: selectedVendors,
  });

  const created = [
    ...coreResult.created,
    ...docsResult.created,
    ...vendorBootstrapResult.created,
    ...skillsResult.created,
  ];
  const skipped = [
    ...coreResult.skipped,
    ...docsResult.skipped,
    ...vendorBootstrapResult.skipped,
    ...skillsResult.skipped,
  ];
  const allFiles = [...created];

  return { created, skipped, allFiles };
}

/**
 * WU-2373: Run docs:sync with micro-worktree isolation when on main branch.
 *
 * When on main branch and not in a worktree, uses withMicroWorktree to:
 * 1. Create a temporary worktree
 * 2. Write synced docs there
 * 3. Commit and push atomically
 *
 * When in a worktree or on a non-main branch, writes directly to cwd (preserving
 * existing behavior).
 *
 * @param options - Sync options (force, vendor)
 */
export async function runDocsSyncWithIsolation(
  options: SyncOptions & { vendor?: VendorType },
): Promise<void> {
  const targetDir = process.cwd();

  const useMicroWorktree = await shouldUseMicroWorktree(targetDir);

  if (useMicroWorktree) {
    console.log(`${LOG_PREFIX} Using micro-worktree isolation (WU-2373)`);

    const syncId = `sync-${Date.now()}`;

    await withMicroWorktree({
      operation: OPERATION_NAME,
      id: syncId,
      logPrefix: LOG_PREFIX,
      execute: async ({ worktreePath }) => {
        const { created, skipped, allFiles } = await executeDocsSyncInDir(worktreePath, options);

        if (created.length > 0) {
          console.log('\nCreated:');
          created.forEach((f) => console.log(`  + ${f}`));
        }

        if (skipped.length > 0) {
          console.log('\nSkipped (already up to date or not selected for sync):');
          skipped.forEach((f) => console.log(`  - ${f}`));
        }

        return {
          commitMessage: 'chore: docs:sync core docs, onboarding, and vendor assets',
          files: allFiles,
        };
      },
    });

    console.log(`\n${LOG_PREFIX} Done!`);
  } else {
    // Direct write path (in worktree or non-main branch)
    const { created, skipped } = await executeDocsSyncInDir(targetDir, options);

    if (created.length > 0) {
      console.log('\nCreated:');
      created.forEach((f) => console.log(`  + ${f}`));
    }

    if (skipped.length > 0) {
      console.log('\nSkipped (already up to date or not selected for sync):');
      skipped.forEach((f) => console.log(`  - ${f}`));
    }

    console.log(`\n${LOG_PREFIX} Done!`);
  }
}

/**
 * CLI entry point for docs:sync command
 * WU-1085: Updated to use parseDocsSyncOptions for proper --help support
 * WU-1362: Added branch guard check
 * WU-2373: Uses micro-worktree isolation on main branch
 */
export async function main(): Promise<void> {
  const opts = parseDocsSyncOptions();

  console.log(`${LOG_PREFIX} Syncing core docs, onboarding docs, and vendor assets...`);
  console.log(`  Vendor: ${opts.vendor}`);
  console.log(`  Force: ${opts.force}`);

  await runDocsSyncWithIsolation({ force: opts.force, vendor: opts.vendor });
}

// CLI entry point (WU-1071 pattern: import.meta.main)
import { runCLI } from './cli-entry-point.js';
if (import.meta.main) {
  void runCLI(main);
}
