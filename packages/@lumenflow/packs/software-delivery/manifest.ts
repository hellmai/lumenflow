// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import {
  SOFTWARE_DELIVERY_MANIFEST_FILE_NAME,
  SOFTWARE_DELIVERY_PACK_ID,
  SOFTWARE_DELIVERY_PACK_VERSION,
  SOFTWARE_DELIVERY_POLICY_ID_PREFIX,
  UTF8_ENCODING,
} from './constants.js';
import type { PathScope } from './tools/types.js';

interface Parser<T> {
  parse(input: unknown): T;
}

export interface SoftwareDeliveryManifestTool {
  name: string;
  entry: string;
  permission: 'read' | 'write' | 'admin';
  required_scopes: PathScope[];
  internal_only?: boolean;
}

export interface SoftwareDeliveryManifestPolicy {
  id: string;
  trigger: 'on_tool_request' | 'on_claim' | 'on_completion' | 'on_evidence_added';
  decision: 'allow' | 'deny';
  reason?: string;
}

export interface SoftwareDeliveryPackManifest {
  id: string;
  version: string;
  task_types: string[];
  tools: SoftwareDeliveryManifestTool[];
  policies: SoftwareDeliveryManifestPolicy[];
  evidence_types: string[];
  state_aliases: Record<string, string>;
  lane_templates: Array<{ id: string }>;
}

function asRecord(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${label} must be an object.`);
  }
  return input as Record<string, unknown>;
}

function parseNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function parseStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map((entry, index) => parseNonEmptyString(entry, `${label}[${index}]`));
}

function isSemver(value: string): boolean {
  let core = value;
  const prereleaseIndex = core.indexOf('-');
  if (prereleaseIndex >= 0) {
    core = core.slice(0, prereleaseIndex);
  }
  const metadataIndex = core.indexOf('+');
  if (metadataIndex >= 0) {
    core = core.slice(0, metadataIndex);
  }
  const parts = core.split('.');
  if (parts.length !== 3) {
    return false;
  }
  return parts.every(
    (part) => part.length > 0 && [...part].every((char) => char >= '0' && char <= '9'),
  );
}

const AllowedPolicyTriggers = new Set([
  'on_tool_request',
  'on_claim',
  'on_completion',
  'on_evidence_added',
]);
const AllowedPolicyDecisions = new Set(['allow', 'deny']);
const AllowedToolPermissions = new Set(['read', 'write', 'admin']);

function parsePathScope(input: unknown, label: string): PathScope {
  const scope = asRecord(input, label);
  const type = parseNonEmptyString(scope.type, `${label}.type`);
  const pattern = parseNonEmptyString(scope.pattern, `${label}.pattern`);
  const access = parseNonEmptyString(scope.access, `${label}.access`);

  if (type !== 'path') {
    throw new Error(`${label}.type must be "path".`);
  }
  if (access !== 'read' && access !== 'write') {
    throw new Error(`${label}.access must be "read" or "write".`);
  }

  return {
    type: 'path',
    pattern,
    access,
  };
}

function parseRequiredScopes(value: unknown, label: string): PathScope[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }

  return value.map((entry, index) => parsePathScope(entry, `${label}[${index}]`));
}

function parsePolicy(input: unknown, index: number): SoftwareDeliveryManifestPolicy {
  const policy = asRecord(input, `policies[${index}]`);
  const trigger = parseNonEmptyString(policy.trigger, `policies[${index}].trigger`);
  const decision = parseNonEmptyString(policy.decision, `policies[${index}].decision`);
  if (!AllowedPolicyTriggers.has(trigger)) {
    throw new Error(`policies[${index}].trigger is invalid.`);
  }
  if (!AllowedPolicyDecisions.has(decision)) {
    throw new Error(`policies[${index}].decision is invalid.`);
  }
  return {
    id: parseNonEmptyString(policy.id, `policies[${index}].id`),
    trigger: trigger as SoftwareDeliveryManifestPolicy['trigger'],
    decision: decision as SoftwareDeliveryManifestPolicy['decision'],
    reason:
      policy.reason === undefined
        ? undefined
        : parseNonEmptyString(policy.reason, `policies[${index}].reason`),
  };
}

function parseTool(input: unknown, index: number): SoftwareDeliveryManifestTool {
  const tool = asRecord(input, `tools[${index}]`);
  const permission =
    tool.permission === undefined
      ? 'read'
      : parseNonEmptyString(tool.permission, `tools[${index}].permission`);
  if (!AllowedToolPermissions.has(permission)) {
    throw new Error(`tools[${index}].permission is invalid.`);
  }

  return {
    name: parseNonEmptyString(tool.name, `tools[${index}].name`),
    entry: parseNonEmptyString(tool.entry, `tools[${index}].entry`),
    permission: permission as SoftwareDeliveryManifestTool['permission'],
    required_scopes: parseRequiredScopes(tool.required_scopes, `tools[${index}].required_scopes`),
    internal_only:
      tool.internal_only === undefined
        ? undefined
        : (() => {
            if (typeof tool.internal_only !== 'boolean') {
              throw new Error(`tools[${index}].internal_only must be boolean.`);
            }
            return tool.internal_only;
          })(),
  };
}

function parseStateAliases(input: unknown): Record<string, string> {
  const aliases = asRecord(input ?? {}, 'state_aliases');
  const parsed: Record<string, string> = {};
  for (const [key, value] of Object.entries(aliases)) {
    parsed[parseNonEmptyString(key, 'state_aliases key')] = parseNonEmptyString(
      value,
      `state_aliases.${key}`,
    );
  }
  return parsed;
}

export const SoftwareDeliveryManifestSchema: Parser<SoftwareDeliveryPackManifest> = {
  parse(input: unknown): SoftwareDeliveryPackManifest {
    const manifest = asRecord(input, 'manifest');
    const version = parseNonEmptyString(manifest.version, 'version');
    if (!isSemver(version)) {
      throw new Error('version must be semver.');
    }
    const taskTypes = parseStringArray(manifest.task_types, 'task_types');
    if (taskTypes.length === 0) {
      throw new Error('task_types must include at least one item.');
    }

    const toolsValue = manifest.tools ?? [];
    if (!Array.isArray(toolsValue)) {
      throw new Error('tools must be an array.');
    }
    const policiesValue = manifest.policies ?? [];
    if (!Array.isArray(policiesValue)) {
      throw new Error('policies must be an array.');
    }
    const laneTemplatesValue = manifest.lane_templates ?? [];
    if (!Array.isArray(laneTemplatesValue)) {
      throw new Error('lane_templates must be an array.');
    }

    return {
      id: parseNonEmptyString(manifest.id, 'id'),
      version,
      task_types: taskTypes,
      tools: toolsValue.map((tool, index) => parseTool(tool, index)),
      policies: policiesValue.map((policy, index) => parsePolicy(policy, index)),
      evidence_types: parseStringArray(manifest.evidence_types ?? [], 'evidence_types'),
      state_aliases: parseStateAliases(manifest.state_aliases),
      lane_templates: laneTemplatesValue.map((laneTemplate, index) => {
        const entry = asRecord(laneTemplate, `lane_templates[${index}]`);
        return { id: parseNonEmptyString(entry.id, `lane_templates[${index}].id`) };
      }),
    };
  },
};

const SOFTWARE_DELIVERY_MANIFEST_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  SOFTWARE_DELIVERY_MANIFEST_FILE_NAME,
);

function assertManifestIdentity(manifest: SoftwareDeliveryPackManifest): void {
  if (manifest.id !== SOFTWARE_DELIVERY_PACK_ID) {
    throw new Error(
      `manifest id mismatch: expected "${SOFTWARE_DELIVERY_PACK_ID}", got "${manifest.id}"`,
    );
  }
  if (manifest.version !== SOFTWARE_DELIVERY_PACK_VERSION) {
    throw new Error(
      `manifest version mismatch: expected "${SOFTWARE_DELIVERY_PACK_VERSION}", got "${manifest.version}"`,
    );
  }
  for (const policy of manifest.policies) {
    if (!policy.id.startsWith(SOFTWARE_DELIVERY_POLICY_ID_PREFIX)) {
      throw new Error(
        `policy id "${policy.id}" must start with "${SOFTWARE_DELIVERY_POLICY_ID_PREFIX}"`,
      );
    }
  }
}

function loadSoftwareDeliveryManifestFromYaml(): SoftwareDeliveryPackManifest {
  const manifestSource = readFileSync(SOFTWARE_DELIVERY_MANIFEST_PATH, UTF8_ENCODING);
  const parsed = SoftwareDeliveryManifestSchema.parse(YAML.parse(manifestSource));
  assertManifestIdentity(parsed);
  return parsed;
}

export const SOFTWARE_DELIVERY_MANIFEST: SoftwareDeliveryPackManifest =
  loadSoftwareDeliveryManifestFromYaml();
