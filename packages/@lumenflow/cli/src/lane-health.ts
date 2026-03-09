#!/usr/bin/env node
// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Lane Health Command
 *
 * WU-1188: CLI command to diagnose lane configuration issues:
 * - Overlap detection between lane code_paths
 * - Coverage gaps (files not covered by UnsafeAny lane)
 * - Exit code 0 for healthy, 1 for issues
 *
 * Usage:
 *   pnpm lane:health              # Run health check
 *   pnpm lane:health --json       # Output as JSON
 *   pnpm lane:health --verbose    # Show all checked files
 */

import fg from 'fast-glob';
import { minimatch } from 'minimatch';
import chalk from 'chalk';
import { readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { createWUParser } from '@lumenflow/core/arg-parser';
import {
  findProjectRoot,
  GIT_DIRECTORY_NAME,
  getConfig,
  WORKSPACE_CONFIG_FILE_NAME,
} from '@lumenflow/core/config';
import { runCLI } from './cli-entry-point.js';
import { asRecord } from './object-guards.js';

/** Constants */
const LOG_PREFIX = '[lane:health]';
const CONFIG_FILE_NAME = WORKSPACE_CONFIG_FILE_NAME;
const MAX_DISPLAY_FILES = 5;
const MAX_DISPLAY_GAPS = 10;
const GIT_DIR_GLOB = `${GIT_DIRECTORY_NAME}/**`;
const RECURSIVE_GIT_DIR_GLOB = `**/${GIT_DIRECTORY_NAME}/**`;

/**
 * Minimal exclude patterns that are always applied regardless of .gitignore.
 * These cover infrastructure that .gitignore typically doesn't list.
 */
const BASELINE_EXCLUDE_PATTERNS = [
  'node_modules/**',
  GIT_DIR_GLOB,
  '.lumenflow/**',
  'worktrees/**',
];

/**
 * WU-2346: Parse a .gitignore file and return glob patterns suitable for fast-glob ignore.
 *
 * Handles:
 * - Comments (lines starting with #)
 * - Empty lines
 * - Directory patterns (trailing /) converted to glob patterns
 * - Patterns scoped to the .gitignore file's directory (for nested .gitignore files)
 *
 * Does NOT handle:
 * - Negation patterns (!) — these are skipped as fast-glob ignore doesn't support them
 *
 * @param filePath - Absolute path to the .gitignore file
 * @param projectRoot - Absolute path to the project root
 * @returns Array of glob patterns
 */
export function parseGitignorePatterns(filePath: string, projectRoot: string): string[] {
  try {
    const content = readFileSync(filePath, 'utf8');
    const dir = dirname(filePath);
    const relDir = relative(projectRoot, dir);
    const prefix = relDir ? `${relDir}/` : '';

    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && !line.startsWith('!'))
      .map((pattern) => {
        const isDirectoryPattern = pattern.endsWith('/');
        // WU-2353: For directory patterns, append ** to match contents
        let cleanPattern = isDirectoryPattern ? `${pattern}**` : pattern;

        // Root-anchored patterns (starting with /) are relative to the .gitignore's dir
        if (cleanPattern.startsWith('/')) {
          return `${prefix}${cleanPattern.slice(1)}`;
        }

        // WU-2353: Unanchored directory patterns match recursively in git.
        // e.g. `node_modules/` means `**/node_modules/` — matches at any depth.
        // Prepend **/ unless already prefixed with **/.
        if (isDirectoryPattern && !cleanPattern.startsWith('**/')) {
          cleanPattern = `**/${cleanPattern}`;
        }

        // Scope to the .gitignore file's directory (for non-directory, non-glob patterns)
        if (prefix && !cleanPattern.startsWith('*')) {
          return `${prefix}${cleanPattern}`;
        }
        return cleanPattern;
      });
  } catch {
    return [];
  }
}

/**
 * WU-2346: Collect exclude patterns from all .gitignore files in the project.
 *
 * Scans for .gitignore files recursively and merges their patterns with
 * the baseline exclusions. This is framework-agnostic — any project's
 * .gitignore patterns are automatically respected.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Array of glob patterns for fast-glob ignore
 */
export function collectGitignoreExcludePatterns(projectRoot: string): string[] {
  const gitignoreFiles = fg.sync('**/.gitignore', {
    cwd: projectRoot,
    dot: true,
    ignore: ['node_modules/**', GIT_DIR_GLOB, 'worktrees/**'],
    onlyFiles: true,
    followSymbolicLinks: false,
    suppressErrors: true,
  });

  const patterns = [...BASELINE_EXCLUDE_PATTERNS];

  for (const gitignoreRelPath of gitignoreFiles) {
    const absPath = join(projectRoot, gitignoreRelPath);
    patterns.push(...parseGitignorePatterns(absPath, projectRoot));
  }

  return [...new Set(patterns)];
}

/** File extensions to check for coverage (code files only) */
const CODE_FILE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.rb',
  '.php',
];

// ============================================================================
// Types
// ============================================================================

/** Lane definition from config */
export interface LaneDefinition {
  name: string;
  code_paths: string[];
  wip_limit?: number;
}

/** Overlap detection result for a pair of lanes */
export interface LaneOverlap {
  lanes: [string, string];
  pattern: string;
  files: string[];
}

/** Result of overlap detection */
export interface OverlapDetectionResult {
  hasOverlaps: boolean;
  overlaps: LaneOverlap[];
}

/** Result of coverage gap detection */
export interface CoverageGapResult {
  hasGaps: boolean;
  uncoveredFiles: string[];
}

/** Options for coverage gap detection */
export interface CoverageGapOptions {
  projectRoot: string;
  excludePatterns?: string[];
  codeOnly?: boolean;
}

/** Complete lane health report */
export interface LaneHealthReport {
  overlaps: OverlapDetectionResult;
  gaps: CoverageGapResult;
  healthy: boolean;
}

// ============================================================================
// Lane Loading
// ============================================================================

/**
 * Parse lane definition from raw object
 */
function parseLaneDefinition(lane: unknown): LaneDefinition | null {
  const laneObj = asRecord(lane);
  if (!laneObj) {
    return null;
  }
  if (typeof laneObj.name !== 'string' || !Array.isArray(laneObj.code_paths)) {
    return null;
  }
  return {
    name: laneObj.name,
    code_paths: laneObj.code_paths.filter((p): p is string => typeof p === 'string'),
    wip_limit: typeof laneObj.wip_limit === 'number' ? laneObj.wip_limit : undefined,
  };
}

/**
 * Load lane definitions from workspace.yaml software_delivery.lanes.definitions
 *
 * @param projectRoot - Project root directory
 * @returns Array of lane definitions
 */
export function loadLaneDefinitions(projectRoot: string): LaneDefinition[] {
  try {
    const config = getConfig({
      projectRoot,
      reload: true,
      strictWorkspace: true,
    });
    return (config.lanes?.definitions ?? [])
      .map(parseLaneDefinition)
      .filter((lane: LaneDefinition | null): lane is LaneDefinition => lane !== null);
  } catch {
    return [];
  }
}

// ============================================================================
// Overlap Detection
// ============================================================================

/**
 * Check if two glob patterns can potentially overlap
 */
function patternsCanOverlap(patternA: string, patternB: string): boolean {
  const testPathA = patternA.replace(/\*\*/g, 'test/nested').replace(/\*/g, 'testfile');
  const testPathB = patternB.replace(/\*\*/g, 'test/nested').replace(/\*/g, 'testfile');
  return minimatch(testPathB, patternA) || minimatch(testPathA, patternB);
}

/**
 * Find concrete file intersection between two glob patterns
 */
function findOverlappingFiles(
  patternA: string,
  patternB: string,
  excludePatterns?: string[],
): string[] {
  const globOptions = {
    dot: true,
    ignore: excludePatterns ?? ['**/node_modules/**', RECURSIVE_GIT_DIR_GLOB, '**/worktrees/**'],
    followSymbolicLinks: false,
    suppressErrors: true,
  };

  const filesA = new Set(fg.sync(patternA, globOptions));
  const filesB = new Set(fg.sync(patternB, globOptions));

  return [...filesA].filter((file) => filesB.has(file));
}

/**
 * Check overlap between two lanes' code paths
 */
function checkLanePairOverlap(
  laneA: LaneDefinition,
  laneB: LaneDefinition,
  excludePatterns?: string[],
): LaneOverlap[] {
  const overlaps: LaneOverlap[] = [];

  for (const pathA of laneA.code_paths) {
    for (const pathB of laneB.code_paths) {
      if (patternsCanOverlap(pathA, pathB)) {
        let files: string[] = [];
        try {
          files = findOverlappingFiles(pathA, pathB, excludePatterns);
        } catch {
          // Ignore filesystem errors
        }

        overlaps.push({
          lanes: [laneA.name, laneB.name],
          pattern: `${pathA} <-> ${pathB}`,
          files,
        });
      }
    }
  }

  return overlaps;
}

/**
 * Detect overlapping code_paths between lane definitions
 */
export function detectLaneOverlaps(
  lanes: LaneDefinition[],
  excludePatterns?: string[],
): OverlapDetectionResult {
  const overlaps: LaneOverlap[] = [];

  for (let i = 0; i < lanes.length; i++) {
    for (let j = i + 1; j < lanes.length; j++) {
      const pairOverlaps = checkLanePairOverlap(lanes[i], lanes[j], excludePatterns);
      overlaps.push(...pairOverlaps);
    }
  }

  return {
    hasOverlaps: overlaps.length > 0,
    overlaps,
  };
}

// ============================================================================
// Coverage Gap Detection
// ============================================================================

/**
 * Build pattern for code files
 */
function buildCodeFilesPattern(): string {
  const extensions = CODE_FILE_EXTENSIONS.map((ext) => ext.replace('.', '')).join(',');
  return `**/*.{${extensions}}`;
}

/**
 * Detect files not covered by UnsafeAny lane
 */
export function detectCoverageGaps(
  lanes: LaneDefinition[],
  options: CoverageGapOptions,
): CoverageGapResult {
  const {
    projectRoot,
    excludePatterns = collectGitignoreExcludePatterns(projectRoot),
    codeOnly = true,
  } = options;

  const allFilesPattern = codeOnly ? buildCodeFilesPattern() : '**/*';

  const globOptions = {
    cwd: projectRoot,
    dot: true,
    ignore: excludePatterns,
    onlyFiles: true,
    followSymbolicLinks: false,
    suppressErrors: true,
  };

  const allFiles = fg.sync(allFilesPattern, globOptions);
  const coveredFiles = new Set<string>();

  for (const lane of lanes) {
    for (const pattern of lane.code_paths) {
      const matchedFiles = fg.sync(pattern, {
        ...globOptions,
        ignore: ['**/node_modules/**', RECURSIVE_GIT_DIR_GLOB, '**/worktrees/**'],
      });
      matchedFiles.forEach((file) => coveredFiles.add(file));
    }
  }

  const uncoveredFiles = allFiles.filter((file) => !coveredFiles.has(file));

  return {
    hasGaps: uncoveredFiles.length > 0,
    uncoveredFiles,
  };
}

// ============================================================================
// Report Formatting
// ============================================================================

/**
 * Get exit code based on report health
 */
export function getExitCode(report: LaneHealthReport): number {
  return report.healthy ? 0 : 1;
}

/**
 * Format overlap section
 */
function formatOverlapSection(overlap: LaneOverlap): string[] {
  const lines: string[] = [];
  lines.push(`    ${chalk.cyan(overlap.lanes[0])} <-> ${chalk.cyan(overlap.lanes[1])}`);
  lines.push(`    Pattern: ${overlap.pattern}`);
  lines.push(`    Files (${overlap.files.length}):`);

  const displayFiles = overlap.files.slice(0, MAX_DISPLAY_FILES);
  displayFiles.forEach((file) => lines.push(`      - ${file}`));

  if (overlap.files.length > MAX_DISPLAY_FILES) {
    lines.push(`      ... and ${overlap.files.length - MAX_DISPLAY_FILES} more`);
  }
  lines.push('');
  return lines;
}

/**
 * Format lane health report as human-readable text
 */
export function formatLaneHealthReport(report: LaneHealthReport): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(chalk.bold('='.repeat(60)));
  lines.push(chalk.bold.cyan('  Lane Health Report'));
  lines.push(chalk.bold('='.repeat(60)));
  lines.push('');

  // Status
  if (report.healthy) {
    lines.push(chalk.green.bold('  Status: healthy'));
    lines.push('');
    lines.push('  All lane configurations are valid:');
    lines.push('    - No overlapping code_paths detected');
    lines.push('    - All code files covered by lanes');
  } else {
    lines.push(chalk.red.bold('  Status: Issues detected'));
  }
  lines.push('');

  // Overlaps
  if (report.overlaps.hasOverlaps) {
    lines.push(chalk.yellow.bold('  Overlapping Code Paths'));
    lines.push('  ' + '-'.repeat(40));
    lines.push('');
    report.overlaps.overlaps.forEach((overlap) => {
      lines.push(...formatOverlapSection(overlap));
    });
  }

  // Coverage gaps
  if (report.gaps.hasGaps) {
    lines.push(chalk.yellow.bold('  Coverage Gaps'));
    lines.push('  ' + '-'.repeat(40));
    lines.push('');
    lines.push(`    ${report.gaps.uncoveredFiles.length} files not covered by UnsafeAny lane:`);
    lines.push('');

    const displayFiles = report.gaps.uncoveredFiles.slice(0, MAX_DISPLAY_GAPS);
    displayFiles.forEach((file) => lines.push(`      - ${file}`));

    if (report.gaps.uncoveredFiles.length > MAX_DISPLAY_GAPS) {
      lines.push(`      ... and ${report.gaps.uncoveredFiles.length - MAX_DISPLAY_GAPS} more`);
    }
    lines.push('');
  }

  lines.push(chalk.bold('='.repeat(60)));
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// CLI Entry Point
// ============================================================================

/** Logger for CLI output */

const log = console.log.bind(console);

const warn = console.warn.bind(console);

/**
 * Run lane health check
 */
export function runLaneHealthCheck(options: {
  projectRoot?: string;
  checkCoverage?: boolean;
  excludePatterns?: string[];
}): LaneHealthReport {
  const { projectRoot = findProjectRoot(), checkCoverage = true, excludePatterns } = options;

  const lanes = loadLaneDefinitions(projectRoot);

  if (lanes.length === 0) {
    warn(`${LOG_PREFIX} No lane definitions found in ${CONFIG_FILE_NAME}`);
    return {
      overlaps: { hasOverlaps: false, overlaps: [] },
      gaps: { hasGaps: false, uncoveredFiles: [] },
      healthy: true,
    };
  }

  // WU-2346: Collect gitignore-based exclude patterns for both overlap and coverage detection
  const effectiveExcludePatterns = excludePatterns ?? collectGitignoreExcludePatterns(projectRoot);
  const overlaps = detectLaneOverlaps(lanes, effectiveExcludePatterns);
  let gaps: CoverageGapResult = { hasGaps: false, uncoveredFiles: [] };

  if (checkCoverage) {
    gaps = detectCoverageGaps(lanes, { projectRoot, excludePatterns: effectiveExcludePatterns });
  }

  return {
    overlaps,
    gaps,
    healthy: !overlaps.hasOverlaps && !gaps.hasGaps,
  };
}

/**
 * Main entry point
 */
export async function main(): Promise<void> {
  const args = createWUParser({
    name: 'lane-health',
    description: 'Check lane configuration health (WU-1188)',
    options: [
      { name: 'json', flags: '-j, --json', type: 'boolean', description: 'Output as JSON' },
      {
        name: 'verbose',
        flags: '-v, --verbose',
        type: 'boolean',
        description: 'Show verbose output',
      },
      {
        name: 'no-coverage',
        flags: '--no-coverage',
        type: 'boolean',
        description: 'Skip coverage gap detection',
      },
    ],
    required: [],
  });

  const {
    json,
    verbose,
    'no-coverage': noCoverage,
  } = args as {
    json?: boolean;
    verbose?: boolean;
    'no-coverage'?: boolean;
  };

  const projectRoot = findProjectRoot();

  if (verbose) {
    log(`${LOG_PREFIX} Checking lane health in: ${projectRoot}`);
  }

  const report = runLaneHealthCheck({
    projectRoot,
    checkCoverage: !noCoverage,
  });

  if (json) {
    log(JSON.stringify(report, null, 2));
  } else {
    log(formatLaneHealthReport(report));
  }

  process.exit(getExitCode(report));
}

// WU-1181: Use import.meta.main instead of process.argv[1] comparison
if (import.meta.main) {
  void runCLI(main);
}
