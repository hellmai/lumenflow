// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * @file init-package-config.ts
 * WU-2399: Extracted from init.ts -- package.json scripts, prettier config,
 * dependency injection.
 *
 * Responsible for:
 * - Generating LumenFlow scripts from the public manifest
 * - Injecting scripts into package.json
 * - Adding devDependencies (prettier, @lumenflow/cli)
 * - Adding gate stub scripts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ScaffoldOptions } from './init.js';
import type { ScaffoldResult } from './init-scaffolding.js';
import { getPublicManifest } from './public-manifest.js';
import { GATE_STUB_SCRIPTS, SCRIPT_ARG_OVERRIDES } from './init-templates.js';

/**
 * WU-1517: Prettier version to add to devDependencies.
 * Uses caret range to allow minor/patch updates.
 */
export const PRETTIER_VERSION = '^3.8.0';

/** WU-1517: Prettier package name constant */
export const PRETTIER_PACKAGE_NAME = 'prettier';

/**
 * WU-1963: @lumenflow/cli version to add to devDependencies.
 * Uses caret range to allow minor/patch updates within the major version.
 * This ensures `pnpm wu:create`, `pnpm gates`, etc. resolve after `pnpm install`.
 */
export const CLI_PACKAGE_VERSION = '^3.0.0';

/** WU-1963: CLI package name constant */
export const CLI_PACKAGE_NAME = '@lumenflow/cli';

/**
 * WU-1307: LumenFlow scripts to inject into package.json
 * WU-1342: Expanded to include essential commands
 * WU-1433: Now derived from the public CLI manifest (WU-1432) instead of
 * hardcoded list. Ensures all public commands are exposed and avoids drift.
 */
export function generateLumenflowScripts(): Record<string, string> {
  const scripts: Record<string, string> = {};
  const manifest = getPublicManifest();

  for (const cmd of manifest) {
    // Use override if defined, otherwise map to the binary name
    scripts[cmd.name] = SCRIPT_ARG_OVERRIDES[cmd.name] ?? cmd.binName;
  }

  return scripts;
}

/**
 * WU-1300: Inject LumenFlow scripts into package.json
 * WU-1517: Also adds prettier devDependency
 * WU-1518: Also adds gate stub scripts (spec:linter, lint, typecheck)
 * WU-1747: format and format:check are now part of GATE_STUB_SCRIPTS
 * WU-1963: Also adds @lumenflow/cli devDependency so binary scripts resolve
 * WU-2399: Fix --force flag: when force is true, always overwrite existing values
 * - Creates package.json if it doesn't exist
 * - Preserves existing scripts (doesn't overwrite unless --force)
 * - Adds missing LumenFlow scripts
 * - Adds @lumenflow/cli to devDependencies (provides wu-create, gates, etc. binaries)
 * - Adds prettier to devDependencies
 * - Adds gate stub scripts for spec:linter, lint, typecheck, format, format:check
 */
export async function injectPackageJsonScripts(
  targetDir: string,
  options: ScaffoldOptions,
  result: ScaffoldResult,
): Promise<void> {
  const packageJsonPath = path.join(targetDir, 'package.json');
  let packageJson: Record<string, unknown>;

  if (fs.existsSync(packageJsonPath)) {
    // Read existing package.json
    const content = fs.readFileSync(packageJsonPath, 'utf-8');
    packageJson = JSON.parse(content) as Record<string, unknown>;
  } else {
    // Create minimal package.json
    packageJson = {
      name: path.basename(targetDir),
      version: '0.0.1',
      private: true,
    };
  }

  // Ensure scripts object exists
  if (!packageJson.scripts || typeof packageJson.scripts !== 'object') {
    packageJson.scripts = {};
  }

  const scripts = packageJson.scripts as Record<string, string>;
  let modified = false;

  // WU-1433: Derive scripts from public manifest (not hardcoded)
  // WU-2399: Fix --force flag: when force is true, always overwrite existing scripts
  const lumenflowScripts = generateLumenflowScripts();
  for (const [scriptName, scriptCommand] of Object.entries(lumenflowScripts)) {
    if (options.force || !(scriptName in scripts)) {
      scripts[scriptName] = scriptCommand;
      modified = true;
    }
  }

  // WU-1518: Add gate stub scripts (spec:linter, lint, typecheck, format, format:check)
  // WU-1747: format and format:check are now part of GATE_STUB_SCRIPTS with
  // auto-detection of prettier availability, so they pass immediately after init.
  // These stubs let `pnpm gates` pass on a fresh project without manual script additions.
  // Projects replace them with real tooling when ready.
  for (const [scriptName, scriptCommand] of Object.entries(GATE_STUB_SCRIPTS)) {
    if (options.force) {
      scripts[scriptName] = scriptCommand;
      modified = true;
    } else if (!(scriptName in scripts)) {
      scripts[scriptName] = scriptCommand;
      modified = true;
    }
  }

  // Ensure devDependencies object exists
  if (!packageJson.devDependencies || typeof packageJson.devDependencies !== 'object') {
    packageJson.devDependencies = {};
  }
  const devDeps = packageJson.devDependencies as Record<string, string>;

  // WU-1963: Add @lumenflow/cli to devDependencies so binary scripts resolve after pnpm install
  if (options.force || !(CLI_PACKAGE_NAME in devDeps)) {
    if (options.force && CLI_PACKAGE_NAME in devDeps) {
      devDeps[CLI_PACKAGE_NAME] = CLI_PACKAGE_VERSION;
      modified = true;
    } else if (!(CLI_PACKAGE_NAME in devDeps)) {
      devDeps[CLI_PACKAGE_NAME] = CLI_PACKAGE_VERSION;
      modified = true;
    }
  }

  // WU-1517: Add prettier to devDependencies
  // WU-2399: Fix --force flag: when force is true, always overwrite existing version
  if (options.force || !(PRETTIER_PACKAGE_NAME in devDeps)) {
    devDeps[PRETTIER_PACKAGE_NAME] = PRETTIER_VERSION;
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    result.created.push('package.json (scripts updated)');
  }
}
