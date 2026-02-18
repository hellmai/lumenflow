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

export type LegalOpsPackManifest = SoftwareDeliveryPackManifest;

const LEGAL_OPS_PACK_ID = 'legal-ops' as const;
const LEGAL_OPS_PACK_VERSION = '0.1.0' as const;
const LEGAL_OPS_POLICY_ID_PREFIX = `${LEGAL_OPS_PACK_ID}` as const;

const FULL_WORKSPACE_SCOPE_PATTERN = '**';
const PENDING_RUNTIME_TOOL_ENTRY = 'tool-impl/pending-runtime-tools.ts#pendingRuntimeMigrationTool';

const TOOL_DEFINITIONS = {
  'contract:review': TOOL_PERMISSIONS.READ,
  'compliance:check': TOOL_PERMISSIONS.READ,
  'nda:generate': TOOL_PERMISSIONS.WRITE,
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

export const LEGAL_OPS_MANIFEST: LegalOpsPackManifest = {
  id: LEGAL_OPS_PACK_ID,
  version: LEGAL_OPS_PACK_VERSION,
  task_types: ['legal-task'],
  tools: createManifestTools(),
  policies: [
    {
      id: `${LEGAL_OPS_POLICY_ID_PREFIX}.confidentiality`,
      trigger: MANIFEST_POLICY_TRIGGERS.ON_COMPLETION,
      decision: MANIFEST_POLICY_DECISIONS.DENY,
    },
    {
      id: `${LEGAL_OPS_POLICY_ID_PREFIX}.jurisdiction-check`,
      trigger: MANIFEST_POLICY_TRIGGERS.ON_TOOL_REQUEST,
      decision: MANIFEST_POLICY_DECISIONS.DENY,
    },
    {
      id: `${LEGAL_OPS_POLICY_ID_PREFIX}.counsel-approval`,
      trigger: MANIFEST_POLICY_TRIGGERS.ON_CLAIM,
      decision: MANIFEST_POLICY_DECISIONS.DENY,
    },
  ],
  evidence_types: ['legal-review-record'],
  state_aliases: { active: 'in_progress' },
  lane_templates: [],
};
