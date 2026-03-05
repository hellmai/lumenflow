// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @file init-lane-validation.ts
 * Lane config validation against inference hierarchy.
 *
 * WU-1745: Validate lane config against inference hierarchy at init time
 *
 * Cross-checks lane definitions in workspace.yaml software_delivery against
 * .lumenflow.lane-inference.yaml parents. Catches invalid parent names
 * (e.g., "Foundation: Core" when "Foundation" is not a valid parent)
 * at init time instead of deferring to wu:create.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import { WORKSPACE_CONFIG_FILE_NAME } from '@lumenflow/core/config';
import { WORKSPACE_V2_KEYS } from '@lumenflow/core/config-schema';
import { CONFIG_FILES } from '@lumenflow/core/wu-constants';

/** Separator between parent and sublane in lane names */
const LANE_NAME_SEPARATOR = ': ';
const SOFTWARE_DELIVERY_KEY = WORKSPACE_V2_KEYS.SOFTWARE_DELIVERY;

/** Lane definition from workspace.yaml software_delivery */
interface LaneDefinition {
  name: string;
  wip_limit?: number;
  code_paths?: string[];
}

export interface LaneTaxonomyMap {
  [parent: string]: string[];
}

/** Result of lane validation against inference hierarchy */
export interface LaneValidationResult {
  /** Warning messages for the user */
  warnings: string[];
  /** Lane names with invalid parents */
  invalidLanes: string[];
}

export interface LaneTaxonomyDriftResult {
  hasDrift: boolean;
  missingInInference: LaneTaxonomyMap;
  extraInInference: LaneTaxonomyMap;
}

/**
 * Extract the parent name from a "Parent: Sublane" lane name.
 *
 * @param laneName - Lane name in "Parent: Sublane" format
 * @returns The parent portion, or null if no separator found
 */
function extractParentName(laneName: string): string | null {
  const separatorIndex = laneName.indexOf(LANE_NAME_SEPARATOR);
  if (separatorIndex === -1) {
    return null;
  }
  return laneName.substring(0, separatorIndex);
}

function extractSubLaneName(laneName: string): string | null {
  const separatorIndex = laneName.indexOf(LANE_NAME_SEPARATOR);
  if (separatorIndex === -1) {
    return null;
  }

  const subLane = laneName.substring(separatorIndex + LANE_NAME_SEPARATOR.length).trim();
  return subLane.length > 0 ? subLane : null;
}

function sortMapValues(map: LaneTaxonomyMap): LaneTaxonomyMap {
  const sorted: LaneTaxonomyMap = {};
  for (const [parent, subLanes] of Object.entries(map)) {
    sorted[parent] = [...subLanes].sort((left, right) => left.localeCompare(right));
  }
  return sorted;
}

/**
 * Validate lane definitions from config against valid inference hierarchy parents.
 *
 * Checks that each lane's parent (the part before ": ") exists as a top-level
 * key in the lane inference hierarchy.
 *
 * @param configLanes - Lane definitions from workspace.yaml software_delivery
 * @param inferenceParents - Valid parent names from .lumenflow.lane-inference.yaml
 * @returns Validation result with warnings and invalid lane names
 */
export function validateLaneConfigAgainstInference(
  configLanes: LaneDefinition[],
  inferenceParents: string[],
): LaneValidationResult {
  const warnings: string[] = [];
  const invalidLanes: string[] = [];

  if (configLanes.length === 0) {
    return { warnings, invalidLanes };
  }

  const validParentSet = new Set(inferenceParents);

  for (const lane of configLanes) {
    const parent = extractParentName(lane.name);

    if (parent === null) {
      // Lane name doesn't use "Parent: Sublane" format
      warnings.push(
        `Lane "${lane.name}" does not use the required "Parent: Sublane" format. ` +
          `Valid parent names: ${inferenceParents.join(', ')}`,
      );
      invalidLanes.push(lane.name);
      continue;
    }

    if (!validParentSet.has(parent)) {
      warnings.push(
        `Lane "${lane.name}" uses invalid parent "${parent}". ` +
          `Valid parent names in lane-inference hierarchy: ${inferenceParents.join(', ')}`,
      );
      invalidLanes.push(lane.name);
    }
  }

  return { warnings, invalidLanes };
}

/**
 * Extract top-level parent names from a lane inference YAML file.
 *
 * The lane inference file uses hierarchical format:
 *   Parent:
 *     Sublane:
 *       code_paths: [...]
 *
 * This function returns the top-level keys (parent names).
 *
 * @param laneInferencePath - Path to .lumenflow.lane-inference.yaml
 * @returns Array of parent names, or empty array if file doesn't exist/is invalid
 */
export function extractInferenceParents(laneInferencePath: string): string[] {
  if (!fs.existsSync(laneInferencePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(laneInferencePath, 'utf-8');
    const parsed = yaml.parse(content) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
      return [];
    }
    // Top-level keys are parent names
    return Object.keys(parsed);
  } catch {
    return [];
  }
}

export function extractInferenceTaxonomy(laneInferencePath: string): LaneTaxonomyMap {
  if (!fs.existsSync(laneInferencePath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(laneInferencePath, 'utf-8');
    const parsed = yaml.parse(content) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const taxonomy: LaneTaxonomyMap = {};
    for (const [parent, subLanesRaw] of Object.entries(parsed)) {
      if (!subLanesRaw || typeof subLanesRaw !== 'object' || Array.isArray(subLanesRaw)) {
        taxonomy[parent] = [];
        continue;
      }
      taxonomy[parent] = Object.keys(subLanesRaw);
    }

    return sortMapValues(taxonomy);
  } catch {
    return {};
  }
}

export function extractConfigTaxonomy(configLanes: LaneDefinition[]): LaneTaxonomyMap {
  if (configLanes.length === 0) {
    return {};
  }

  const byParent = new Map<string, Set<string>>();

  for (const lane of configLanes) {
    const parent = extractParentName(lane.name);
    const subLane = extractSubLaneName(lane.name);
    if (!parent || !subLane) {
      continue;
    }

    const existing = byParent.get(parent) ?? new Set<string>();
    existing.add(subLane);
    byParent.set(parent, existing);
  }

  const taxonomy: LaneTaxonomyMap = {};
  for (const [parent, subLanes] of byParent.entries()) {
    taxonomy[parent] = [...subLanes].sort((left, right) => left.localeCompare(right));
  }

  return taxonomy;
}

export function detectLaneTaxonomyDrift(
  configLanes: LaneDefinition[],
  inferenceTaxonomy: LaneTaxonomyMap,
): LaneTaxonomyDriftResult {
  const configTaxonomy = extractConfigTaxonomy(configLanes);
  const allParents = new Set([...Object.keys(configTaxonomy), ...Object.keys(inferenceTaxonomy)]);

  const missingInInference: LaneTaxonomyMap = {};
  const extraInInference: LaneTaxonomyMap = {};

  for (const parent of allParents) {
    const configSubLanes = new Set(configTaxonomy[parent] ?? []);
    const inferenceSubLanes = new Set(inferenceTaxonomy[parent] ?? []);

    const missing = [...configSubLanes]
      .filter((subLane) => !inferenceSubLanes.has(subLane))
      .sort((left, right) => left.localeCompare(right));
    const extra = [...inferenceSubLanes]
      .filter((subLane) => !configSubLanes.has(subLane))
      .sort((left, right) => left.localeCompare(right));

    if (missing.length > 0) {
      missingInInference[parent] = missing;
    }
    if (extra.length > 0) {
      extraInInference[parent] = extra;
    }
  }

  return {
    hasDrift:
      Object.keys(missingInInference).length > 0 || Object.keys(extraInInference).length > 0,
    missingInInference,
    extraInInference,
  };
}

/**
 * Extract lane definitions from a workspace YAML file.
 *
 * @param configPath - Path to workspace.yaml
 * @returns Array of lane definitions, or empty array if not found
 */
export function extractConfigLanes(configPath: string): LaneDefinition[] {
  if (!fs.existsSync(configPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = yaml.parse(content) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
      return [];
    }
    const softwareDelivery = parsed[SOFTWARE_DELIVERY_KEY] as Record<string, unknown> | undefined;
    const lanes = softwareDelivery?.lanes as Record<string, unknown> | undefined;
    const definitions = lanes?.definitions;
    if (!Array.isArray(definitions)) {
      return [];
    }
    return definitions as LaneDefinition[];
  } catch {
    return [];
  }
}

/**
 * Run lane validation for a project directory.
 *
 * Reads both workspace.yaml and .lumenflow.lane-inference.yaml,
 * then validates that all lane parents exist in the inference hierarchy.
 *
 * @param targetDir - Project root directory
 * @returns Validation result with warnings and invalid lane names
 */
export function validateLanesForProject(targetDir: string): LaneValidationResult {
  const configPath = path.join(targetDir, WORKSPACE_CONFIG_FILE_NAME);
  const inferencePath = path.join(targetDir, CONFIG_FILES.LANE_INFERENCE);

  const configLanes = extractConfigLanes(configPath);
  const inferenceParents = extractInferenceParents(inferencePath);

  // If either file is missing or empty, skip validation
  if (configLanes.length === 0 || inferenceParents.length === 0) {
    return { warnings: [], invalidLanes: [] };
  }

  return validateLaneConfigAgainstInference(configLanes, inferenceParents);
}
