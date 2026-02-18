// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import {
  MANIFEST_POLICY_DECISIONS,
  MANIFEST_POLICY_TRIGGERS,
  type SoftwareDeliveryManifestTool,
  type SoftwareDeliveryPackManifest,
} from '../software-delivery/manifest-schema.js';
import {
  TOOL_PERMISSIONS,
  TOOL_SCOPE_ACCESS,
  TOOL_SCOPE_TYPES,
  type PathScope,
  type ToolPermission,
} from '../software-delivery/tools/types.js';

export type DataPipelinePackManifest = SoftwareDeliveryPackManifest;

const DATA_PIPELINE_PACK_ID = 'data-pipeline' as const;
const DATA_PIPELINE_PACK_VERSION = '0.1.0' as const;
const DATA_PIPELINE_POLICY_ID_PREFIX = `${DATA_PIPELINE_PACK_ID}` as const;

const FULL_WORKSPACE_SCOPE_PATTERN = '**';
const PENDING_RUNTIME_TOOL_ENTRY = 'tool-impl/pending-runtime-tools.ts#pendingRuntimeMigrationTool';

const TOOL_DEFINITIONS = {
  'etl:extract': TOOL_PERMISSIONS.READ,
  'etl:transform': TOOL_PERMISSIONS.WRITE,
  'etl:load': TOOL_PERMISSIONS.WRITE,
  'pipeline:status': TOOL_PERMISSIONS.READ,
} as const satisfies Record<string, ToolPermission>;

type ToolName = keyof typeof TOOL_DEFINITIONS;

function requiredScopesForPermission(permission: ToolPermission): PathScope[] {
  return [
    {
      type: TOOL_SCOPE_TYPES.PATH,
      pattern: FULL_WORKSPACE_SCOPE_PATTERN,
      access:
        permission === TOOL_PERMISSIONS.READ ? TOOL_SCOPE_ACCESS.READ : TOOL_SCOPE_ACCESS.WRITE,
    },
  ];
}

function createManifestTools(): SoftwareDeliveryManifestTool[] {
  return (Object.keys(TOOL_DEFINITIONS) as ToolName[]).map((name) => {
    const permission = TOOL_DEFINITIONS[name];
    return {
      name,
      entry: PENDING_RUNTIME_TOOL_ENTRY,
      permission,
      required_scopes: requiredScopesForPermission(permission),
    };
  });
}

export const DATA_PIPELINE_MANIFEST: DataPipelinePackManifest = {
  id: DATA_PIPELINE_PACK_ID,
  version: DATA_PIPELINE_PACK_VERSION,
  task_types: ['data-pipeline-task'],
  tools: createManifestTools(),
  policies: [
    {
      id: `${DATA_PIPELINE_POLICY_ID_PREFIX}.data-retention`,
      trigger: MANIFEST_POLICY_TRIGGERS.ON_COMPLETION,
      decision: MANIFEST_POLICY_DECISIONS.DENY,
    },
    {
      id: `${DATA_PIPELINE_POLICY_ID_PREFIX}.schema-validation`,
      trigger: MANIFEST_POLICY_TRIGGERS.ON_TOOL_REQUEST,
      decision: MANIFEST_POLICY_DECISIONS.DENY,
    },
    {
      id: `${DATA_PIPELINE_POLICY_ID_PREFIX}.pipeline-approval`,
      trigger: MANIFEST_POLICY_TRIGGERS.ON_CLAIM,
      decision: MANIFEST_POLICY_DECISIONS.DENY,
    },
  ],
  evidence_types: ['pipeline-run-record'],
  state_aliases: { active: 'in_progress' },
  lane_templates: [],
};
