/**
 * @file legacy-migration.ts
 * @description Migration utility for renaming ._legacy directories to .lumenflow (WU-1075)
 *
 * This module provides a one-time migration function that renames the legacy
 * ._legacy directory to .lumenflow. It's safe to run multiple times - it will
 * only migrate if ._legacy exists and .lumenflow does not.
 *
 * @example
 * ```typescript
 * import { migrateLegacyToLumenflow } from '@lumenflow/core';
 *
 * // Run migration in project root
 * const result = migrateLegacyToLumenflow();
 * if (result.migrated) {
 *   console.log('Successfully migrated ._legacy/ → .lumenflow/');
 * }
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import { LUMENFLOW_PATHS } from './wu-constants.js';

/** Legacy directory name that was used before v1.5.0 */
const LEGACY_LUMENFLOW_DIR = '._legacy';

/**
 * Result of a migration attempt
 */
export interface MigrationResult {
  /** Whether migration was performed */
  migrated: boolean;
  /** Reason for the result */
  reason: 'migrated' | 'already_migrated' | 'no_legacy_dir' | 'both_exist';
  /** Path that was migrated from (if migrated) */
  fromPath?: string;
  /** Path that was migrated to (if migrated) */
  toPath?: string;
  /** Error message if migration failed */
  error?: string;
}

/**
 * Migrate ._legacy directory to .lumenflow
 *
 * This function safely renames the legacy ._legacy directory to .lumenflow.
 * It handles the following scenarios:
 *
 * - ._legacy exists, .lumenflow does not → Migrate (rename)
 * - ._legacy does not exist, .lumenflow exists → Already migrated (no-op)
 * - Neither exists → No legacy directory (no-op)
 * - Both exist → Conflict, manual resolution needed
 *
 * @param {string} [baseDir=process.cwd()] - Base directory to check for migration
 * @returns {MigrationResult} Result of the migration attempt
 */
export function migrateLegacyToLumenflow(baseDir: string = process.cwd()): MigrationResult {
  const legacyPath = path.join(baseDir, LEGACY_LUMENFLOW_DIR);
  const newPath = path.join(baseDir, LUMENFLOW_PATHS.BASE);

  const legacyExists = fs.existsSync(legacyPath);
  const newExists = fs.existsSync(newPath);

  // Both exist - conflict
  if (legacyExists && newExists) {
    return {
      migrated: false,
      reason: 'both_exist',
      fromPath: legacyPath,
      toPath: newPath,
      error:
        'Both ._legacy and .lumenflow directories exist. ' +
        'Please manually resolve by removing or merging ._legacy into .lumenflow.',
    };
  }

  // Already migrated
  if (!legacyExists && newExists) {
    return {
      migrated: false,
      reason: 'already_migrated',
      toPath: newPath,
    };
  }

  // No legacy directory
  if (!legacyExists && !newExists) {
    return {
      migrated: false,
      reason: 'no_legacy_dir',
    };
  }

  // Migrate: rename ._legacy → .lumenflow
  try {
    fs.renameSync(legacyPath, newPath);
    return {
      migrated: true,
      reason: 'migrated',
      fromPath: legacyPath,
      toPath: newPath,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      migrated: false,
      reason: 'migrated',
      fromPath: legacyPath,
      toPath: newPath,
      error: `Failed to rename: ${error}`,
    };
  }
}

/**
 * Check if migration is needed without performing it
 *
 * @param {string} [baseDir=process.cwd()] - Base directory to check
 * @returns {boolean} True if ._legacy exists and .lumenflow does not
 */
export function needsMigration(baseDir: string = process.cwd()): boolean {
  const legacyPath = path.join(baseDir, LEGACY_LUMENFLOW_DIR);
  const newPath = path.join(baseDir, LUMENFLOW_PATHS.BASE);

  return fs.existsSync(legacyPath) && !fs.existsSync(newPath);
}
