// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createError, ErrorCodes } from '@lumenflow/core';

const CLI_SCOPE_DIR = '@lumenflow';
const CLI_PACKAGE_DIR = 'cli';
const TEMPLATES_DIR = 'templates';
const PACKAGES_DIR = 'packages';

export interface ResolveCliTemplatesDirOptions {
  cwd?: string;
  moduleUrl?: string;
  existsSync?: (path: string) => boolean;
}

function collectAncestorDirectories(startDir: string): string[] {
  const directories: string[] = [];
  let current = path.resolve(startDir);

  while (true) {
    directories.push(current);
    const parent = path.dirname(current);
    if (parent === current) {
      return directories;
    }
    current = parent;
  }
}

function isCliPackageRoot(candidate: string): boolean {
  return (
    path.basename(candidate) === CLI_PACKAGE_DIR &&
    path.basename(path.dirname(candidate)) === CLI_SCOPE_DIR
  );
}

function collectCwdCandidates(cwd: string): string[] {
  const candidates: string[] = [];

  for (const directory of collectAncestorDirectories(cwd)) {
    if (isCliPackageRoot(directory)) {
      candidates.push(path.join(directory, TEMPLATES_DIR));
    }

    candidates.push(
      path.join(directory, PACKAGES_DIR, CLI_SCOPE_DIR, CLI_PACKAGE_DIR, TEMPLATES_DIR),
    );
  }

  return candidates;
}

function collectModuleCandidates(moduleUrl: string): string[] {
  const modulePath = fileURLToPath(moduleUrl);
  const moduleDir = path.dirname(modulePath);
  const packageRoot = path.resolve(moduleDir, '..');

  return [path.join(packageRoot, TEMPLATES_DIR)];
}

function dedupeCandidates(candidates: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const candidate of candidates) {
    const normalized = path.resolve(candidate);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(normalized);
  }

  return unique;
}

export function resolveCliTemplatesDir(options: ResolveCliTemplatesDirOptions = {}): string {
  const existsSync = options.existsSync ?? fs.existsSync;
  const cwd = options.cwd ?? process.cwd();
  const moduleUrl = options.moduleUrl ?? import.meta.url;

  const candidates = dedupeCandidates([
    ...collectCwdCandidates(cwd),
    ...collectModuleCandidates(moduleUrl),
  ]);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw createError(
    ErrorCodes.FILE_NOT_FOUND,
    `Templates directory not found. Checked: ${candidates.join(', ')}`,
  );
}
