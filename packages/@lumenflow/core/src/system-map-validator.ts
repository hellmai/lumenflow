#!/usr/bin/env node
/**
 * System Map Validator Library
 *
 * Validates SYSTEM-MAP.yaml integrity:
 * 1. All paths resolve to existing files/folders
 * 2. No orphan docs not in map
 * 3. Audience tags from canonical list
 * 4. quick_queries resolve correctly
 * 5. No PHI entries tagged for investor/public
 *
 * @module system-map-validator
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { parseYAML } from './wu-yaml.js';
import { ProcessExitError } from './error-handler.js';

/**
 * Canonical list of valid audience tags as defined in SYSTEM-MAP.yaml header
 * @type {string[]}
 */
export const CANONICAL_AUDIENCES = [
  'ceo',
  'cto',
  'engineer',
  'compliance',
  'investor',
  'agent',
  'patient',
  'clinician',
];

/**
 * Canonical list of valid classification levels
 * From least to most restrictive: public < internal < confidential < restricted
 * @type {string[]}
 */
export const CANONICAL_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'];

/**
 * Audiences that should NOT have access to restricted (PHI) data
 * These are considered "external" audiences who should never see PHI
 * Note: investor CAN see confidential (investor materials ARE confidential)
 * @type {string[]}
 */
const PHI_RESTRICTED_AUDIENCES = ['investor', 'patient', 'clinician', 'public'];

type SystemMapDocument = Record<string, unknown> & {
  quick_queries?: Record<string, unknown>;
};

interface SystemMapEntry {
  id?: unknown;
  path?: unknown;
  paths?: unknown;
  audiences?: unknown;
  classification?: unknown;
}

interface SystemMapValidationAggregate {
  valid: boolean;
  pathErrors: string[];
  orphanDocs: string[];
  audienceErrors: string[];
  queryErrors: string[];
  classificationErrors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatEntryId(entry: SystemMapEntry): string {
  return String(entry.id);
}

/**
 * Extract all document entries from system map (flattens all layer arrays)
 *
 * @param {object} systemMap - Parsed SYSTEM-MAP.yaml
 * @returns {Array<{id: string, path?: string, paths?: string[], audiences: string[], classification: string, summary: string}>}
 */
function extractAllEntries(systemMap: SystemMapDocument): SystemMapEntry[] {
  const entries: SystemMapEntry[] = [];
  const skipKeys = ['quick_queries'];

  for (const [key, value] of Object.entries(systemMap)) {
    if (skipKeys.includes(key)) continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (isRecord(entry)) {
          entries.push(entry as SystemMapEntry);
        }
      }
    }
  }

  return entries;
}

/**
 * Get all paths from an entry (handles both path and paths fields)
 *
 * @param {{path?: string, paths?: string[]}} entry - Document entry
 * @returns {string[]}
 */
function getEntryPaths(entry: SystemMapEntry): string[] {
  const result: string[] = [];
  if (typeof entry.path === 'string') result.push(entry.path);
  if (Array.isArray(entry.paths)) {
    for (const entryPath of entry.paths) {
      if (typeof entryPath === 'string') {
        result.push(entryPath);
      }
    }
  }
  return result;
}

/**
 * Build a set of all indexed paths from the system map
 *
 * @param {object} systemMap - Parsed SYSTEM-MAP.yaml
 * @returns {Set<string>}
 */
function buildIndexedPathsSet(systemMap: SystemMapDocument): Set<string> {
  const indexedPaths = new Set<string>();
  const entries = extractAllEntries(systemMap);

  for (const entry of entries) {
    const paths = getEntryPaths(entry);
    for (const p of paths) {
      indexedPaths.add(p);
      // For directory paths, also add the prefix for matching
      if (p.endsWith('/')) {
        indexedPaths.add(p);
      }
    }
  }

  return indexedPaths;
}

/**
 * Build a set of all document IDs from the system map
 *
 * @param {object} systemMap - Parsed SYSTEM-MAP.yaml
 * @returns {Set<string>}
 */
function buildIdSet(systemMap: SystemMapDocument): Set<string> {
  const idSet = new Set<string>();
  const entries = extractAllEntries(systemMap);

  for (const entry of entries) {
    if (typeof entry.id === 'string' && entry.id.length > 0) {
      idSet.add(entry.id);
    }
  }

  return idSet;
}

/**
 * Validate all paths in system map exist
 *
 * @param {object} systemMap - Parsed SYSTEM-MAP.yaml
 * @param {{exists: (path: string) => boolean}} deps - Dependencies
 * @returns {Promise<string[]>} Array of error messages
 */
export async function validatePaths(
  systemMap: SystemMapDocument,
  deps: { exists: (path: string) => boolean },
): Promise<string[]> {
  const errors: string[] = [];
  const entries = extractAllEntries(systemMap);

  for (const entry of entries) {
    const paths = getEntryPaths(entry);
    for (const p of paths) {
      if (!deps.exists(p)) {
        errors.push(`Path not found: ${p} (entry: ${formatEntryId(entry)})`);
      }
    }
  }

  return errors;
}

/**
 * Find orphan docs not indexed in system map
 *
 * @param {object} systemMap - Parsed SYSTEM-MAP.yaml
 * @param {{glob: (pattern: string) => Promise<string[]>}} deps - Dependencies
 * @returns {Promise<string[]>} Array of orphan file paths
 */
export async function findOrphanDocs(
  systemMap: SystemMapDocument,
  deps: { glob: (pattern: string) => Promise<string[]> },
): Promise<string[]> {
  const indexedPaths = buildIndexedPathsSet(systemMap);

  // Get all docs files
  const allDocs = await deps.glob('docs/**/*.md');

  const orphans: string[] = [];
  for (const docPath of allDocs) {
    // Check if this doc is directly indexed
    if (indexedPaths.has(docPath)) continue;

    // Check if this doc falls under an indexed directory
    let isUnderIndexedDir = false;
    for (const indexedPath of indexedPaths) {
      const indexedPathStr = String(indexedPath);
      if (indexedPathStr.endsWith('/') && docPath.startsWith(indexedPathStr)) {
        isUnderIndexedDir = true;
        break;
      }
    }

    if (!isUnderIndexedDir) {
      orphans.push(docPath);
    }
  }

  return orphans;
}

/**
 * Validate audience tags against canonical list
 *
 * @param {object} systemMap - Parsed SYSTEM-MAP.yaml
 * @returns {string[]} Array of error messages
 */
export function validateAudienceTags(systemMap: SystemMapDocument): string[] {
  const errors: string[] = [];
  const entries = extractAllEntries(systemMap);

  for (const entry of entries) {
    if (!entry.audiences || !Array.isArray(entry.audiences)) {
      errors.push(`Entry ${formatEntryId(entry)} missing audiences array`);
      continue;
    }

    if (entry.audiences.length === 0) {
      errors.push(
        `Entry ${formatEntryId(entry)} has empty audiences array (must have at least one)`,
      );
      continue;
    }

    for (const audience of entry.audiences) {
      const audienceLabel = typeof audience === 'string' ? audience : String(audience);
      if (!CANONICAL_AUDIENCES.includes(audienceLabel)) {
        errors.push(`Invalid audience '${audienceLabel}' in entry ${formatEntryId(entry)}`);
      }
    }
  }

  return errors;
}

/**
 * Validate quick_queries reference valid document IDs
 *
 * @param {object} systemMap - Parsed SYSTEM-MAP.yaml
 * @returns {string[]} Array of error messages
 */
export function validateQuickQueries(systemMap: SystemMapDocument): string[] {
  const errors: string[] = [];

  if (!isRecord(systemMap.quick_queries)) {
    return errors;
  }

  const validIds = buildIdSet(systemMap);

  for (const [queryKey, queryValue] of Object.entries(systemMap.quick_queries)) {
    const query = isRecord(queryValue) ? queryValue : {};
    const primary = query.primary;
    // Check primary reference
    if (primary && !validIds.has(primary as string)) {
      errors.push(`Quick query '${queryKey}' references non-existent primary: ${String(primary)}`);
    }

    // Check related references
    if (Array.isArray(query.related)) {
      for (const related of query.related) {
        if (!validIds.has(related as string)) {
          errors.push(
            `Quick query '${queryKey}' references non-existent related: ${String(related)}`,
          );
        }
      }
    }
  }

  return errors;
}

/**
 * Validate classification prevents PHI routing to investor/public
 *
 * Rule: restricted (PHI) data should NOT be accessible to external audiences
 * - restricted = PHI data, must NOT go to investor/patient/clinician
 * - confidential = sensitive but OK for investor (investor docs ARE confidential)
 *
 * @param {object} systemMap - Parsed SYSTEM-MAP.yaml
 * @returns {string[]} Array of error messages
 */
export function validateClassificationRouting(systemMap: SystemMapDocument): string[] {
  const errors: string[] = [];
  const entries = extractAllEntries(systemMap);

  for (const entry of entries) {
    const classification = entry.classification;
    const audiences = Array.isArray(entry.audiences) ? entry.audiences : [];

    // Only check restricted classification (PHI data)
    // Confidential is OK for investors (investor materials are confidential by design)
    if (classification !== 'restricted') {
      continue;
    }

    // Check if any PHI-restricted audiences have access
    for (const audience of audiences) {
      const audienceLabel = typeof audience === 'string' ? audience : String(audience);
      if (PHI_RESTRICTED_AUDIENCES.includes(audienceLabel)) {
        errors.push(
          `PHI routing violation: ${formatEntryId(entry)} has restricted (PHI) classification but is accessible to '${audienceLabel}'`,
        );
      }
    }
  }

  return errors;
}

/**
 * Validate entire system map
 *
 * @param {object} systemMap - Parsed SYSTEM-MAP.yaml
 * @param {{exists: (path: string) => boolean, glob: (pattern: string) => Promise<string[]>}} deps - Dependencies
 * @returns {Promise<{valid: boolean, pathErrors: string[], orphanDocs: string[], audienceErrors: string[], queryErrors: string[], classificationErrors: string[]}>}
 */
export async function validateSystemMap(
  systemMap: SystemMapDocument,
  deps: { exists: (path: string) => boolean; glob: (pattern: string) => Promise<string[]> },
): Promise<SystemMapValidationAggregate> {
  const pathErrors = await validatePaths(systemMap, deps);
  const orphanDocs = await findOrphanDocs(systemMap, deps);
  const audienceErrors = validateAudienceTags(systemMap);
  const queryErrors = validateQuickQueries(systemMap);
  const classificationErrors = validateClassificationRouting(systemMap);

  const valid =
    pathErrors.length === 0 &&
    orphanDocs.length === 0 &&
    audienceErrors.length === 0 &&
    queryErrors.length === 0 &&
    classificationErrors.length === 0;

  return {
    valid,
    pathErrors,
    orphanDocs,
    audienceErrors,
    queryErrors,
    classificationErrors,
  };
}

const DEFAULT_SYSTEM_MAP_PATH = 'SYSTEM-MAP.yaml';

export interface SystemMapValidationResult {
  valid: boolean;
  skipped: boolean;
  pathErrors: string[];
  orphanDocs: string[];
  audienceErrors: string[];
  queryErrors: string[];
  classificationErrors: string[];
}

export async function runSystemMapValidation(
  options: {
    cwd?: string;
    systemMapPath?: string;
    logger?: {
      log: (message: string) => void;
      warn?: (message: string) => void;
      error?: (message: string) => void;
    };
  } = {},
): Promise<SystemMapValidationResult> {
  const { cwd = process.cwd(), systemMapPath, logger = console } = options;
  const resolvedPath = systemMapPath ?? path.join(cwd, DEFAULT_SYSTEM_MAP_PATH);

  if (!existsSync(resolvedPath)) {
    logger.warn?.(`[system-map] ${resolvedPath} not found; skipping validation.`);
    return {
      valid: true,
      skipped: true,
      pathErrors: [],
      orphanDocs: [],
      audienceErrors: [],
      queryErrors: [],
      classificationErrors: [],
    };
  }

  let systemMap: SystemMapDocument;
  try {
    const raw = readFileSync(resolvedPath, 'utf-8');
    const parsed = parseYAML(raw);
    if (!isRecord(parsed)) {
      throw new Error('SYSTEM-MAP.yaml root must be a mapping/object');
    }
    systemMap = parsed as SystemMapDocument;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error?.(`[system-map] Failed to read or parse ${resolvedPath}: ${message}`);
    return {
      valid: false,
      skipped: false,
      pathErrors: [message],
      orphanDocs: [],
      audienceErrors: [],
      queryErrors: [],
      classificationErrors: [],
    };
  }

  const result = await validateSystemMap(systemMap, {
    exists: (pathToCheck: string) => existsSync(pathToCheck),
    glob: (pattern: string) => fg(pattern, { dot: false }),
  });

  return {
    valid: result.valid,
    skipped: false,
    pathErrors: result.pathErrors,
    orphanDocs: result.orphanDocs,
    audienceErrors: result.audienceErrors,
    queryErrors: result.queryErrors,
    classificationErrors: result.classificationErrors,
  };
}

function emitErrors(label: string, errors: string[]): void {
  if (!errors || errors.length === 0) return;
  console.error(`\n${label}:`);
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
}

async function runCLI() {
  const systemMapPath = process.env.SYSTEM_MAP_PATH || DEFAULT_SYSTEM_MAP_PATH;
  const result = await runSystemMapValidation({ systemMapPath });

  if (!result.valid) {
    console.error('\n[system-map] Validation failed');
    emitErrors('Missing paths', result.pathErrors);
    emitErrors('Orphan docs', result.orphanDocs);
    emitErrors('Invalid audiences', result.audienceErrors);
    emitErrors('Invalid quick queries', result.queryErrors);
    emitErrors('Classification routing violations', result.classificationErrors);
    throw new ProcessExitError('[system-map] Validation failed', 1);
  }

  if (result.skipped) {
    throw new ProcessExitError('[system-map] Skipped (no map found)', 0);
  }

  console.log('[system-map] Validation passed');
  throw new ProcessExitError('[system-map] Validation passed', 0);
}

if (import.meta.main) {
  runCLI().catch((error) => {
    if (error instanceof ProcessExitError) {
      process.exit(error.exitCode);
    }
    console.error('[system-map] Validation failed:', error);
    process.exit(1);
  });
}
