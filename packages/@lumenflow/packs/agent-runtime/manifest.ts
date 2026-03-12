// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import {
  DomainPackManifestSchema,
  POLICY_TRIGGERS,
  type DomainPackManifest,
} from '@lumenflow/kernel';
import {
  AGENT_RUNTIME_API_KEY_ENV,
  AGENT_RUNTIME_BASE_URL_ENV,
  AGENT_RUNTIME_CONFIG_KEY,
  AGENT_RUNTIME_CONFIG_SCHEMA_FILE,
  AGENT_RUNTIME_PACK_ID,
  AGENT_RUNTIME_PACK_VERSION,
  AGENT_RUNTIME_POLICY_ID_PREFIX,
  AGENT_RUNTIME_STATIC_PROVIDER_ALLOWLIST,
  AGENT_RUNTIME_STATIC_PROVIDER_URLS,
  AGENT_RUNTIME_STORAGE_PATTERN,
} from './constants.js';
import {
  AGENT_RUNTIME_PROVIDER_KINDS,
  AGENT_RUNTIME_TOOL_NAMES,
  AGENT_RUNTIME_TURN_STATUSES,
  type AgentRuntimeToolName,
} from './types.js';

const EXECUTE_TURN_TOOL_ENTRY = 'tool-impl/agent-turn-tools.ts#agentExecuteTurnTool';
const CAPABILITY_FACTORY_ENTRY = 'capability-factory.ts#createAgentRuntimeCapabilityFactory';
const POLICY_FACTORY_ENTRY = 'policy-factory.ts#createAgentRuntimePolicyFactory';

const EXECUTE_TURN_INPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    session_id: { type: 'string', minLength: 1 },
    model_profile: { type: 'string', minLength: 1 },
    url: {
      type: 'string',
      enum: [...AGENT_RUNTIME_STATIC_PROVIDER_URLS],
    },
    messages: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          role: {
            type: 'string',
            enum: ['system', 'user', 'assistant', 'tool'],
          },
          content: { type: 'string' },
          tool_name: { type: 'string' },
          tool_call_id: { type: 'string' },
        },
        required: ['role', 'content'],
        additionalProperties: false,
      },
    },
    tool_catalog: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
          input_schema: {
            type: 'object',
            additionalProperties: true,
          },
        },
        required: ['name', 'description'],
        additionalProperties: false,
      },
    },
    intent_catalog: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
        },
        required: ['id', 'description'],
        additionalProperties: false,
      },
    },
    limits: {
      type: 'object',
      properties: {
        max_turns_per_session: { type: 'integer', minimum: 1 },
        max_tool_calls_per_session: { type: 'integer', minimum: 1 },
        max_input_bytes: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
  },
  required: ['session_id', 'model_profile', 'url', 'messages'],
  additionalProperties: false,
};

const EXECUTE_TURN_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: Object.values(AGENT_RUNTIME_TURN_STATUSES),
    },
    intent: { type: 'string', minLength: 1 },
    assistant_message: { type: 'string' },
    requested_tool: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        input: {
          type: 'object',
          additionalProperties: true,
        },
      },
      required: ['name', 'input'],
      additionalProperties: false,
    },
    provider: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: Object.values(AGENT_RUNTIME_PROVIDER_KINDS),
        },
        model: { type: 'string', minLength: 1 },
      },
      required: ['kind', 'model'],
      additionalProperties: false,
    },
    usage: {
      type: 'object',
      properties: {
        input_tokens: { type: 'integer', minimum: 0 },
        output_tokens: { type: 'integer', minimum: 0 },
        total_tokens: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
    finish_reason: { type: 'string', minLength: 1 },
  },
  required: ['status', 'intent', 'assistant_message', 'provider', 'finish_reason'],
  additionalProperties: false,
};

const MANIFEST_TOOL_DEFINITIONS = [
  {
    name: AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN,
    entry: EXECUTE_TURN_TOOL_ENTRY,
    permission: 'write',
    required_scopes: [
      { type: 'path', pattern: AGENT_RUNTIME_STORAGE_PATTERN, access: 'read' },
      { type: 'path', pattern: AGENT_RUNTIME_STORAGE_PATTERN, access: 'write' },
      {
        type: 'network',
        posture: 'allowlist',
        allowlist_entries: [...AGENT_RUNTIME_STATIC_PROVIDER_ALLOWLIST],
      },
    ],
    required_env: [AGENT_RUNTIME_API_KEY_ENV, AGENT_RUNTIME_BASE_URL_ENV],
    input_schema: EXECUTE_TURN_INPUT_SCHEMA,
    output_schema: EXECUTE_TURN_OUTPUT_SCHEMA,
  },
] as const;

export const AGENT_RUNTIME_MANIFEST = DomainPackManifestSchema.parse({
  id: AGENT_RUNTIME_PACK_ID,
  version: AGENT_RUNTIME_PACK_VERSION,
  config_key: AGENT_RUNTIME_CONFIG_KEY,
  config_schema: AGENT_RUNTIME_CONFIG_SCHEMA_FILE,
  capability_factory: CAPABILITY_FACTORY_ENTRY,
  policy_factory: POLICY_FACTORY_ENTRY,
  task_types: ['agent-session'],
  tools: MANIFEST_TOOL_DEFINITIONS,
  policies: [
    {
      id: `${AGENT_RUNTIME_POLICY_ID_PREFIX}.default`,
      trigger: POLICY_TRIGGERS.ON_TOOL_REQUEST,
      decision: 'allow',
      reason: 'Pack baseline allow; dynamic intent gating is applied by the pack policy factory.',
    },
  ],
  evidence_types: ['agent-runtime.turn', 'agent-runtime.provider-call'],
  state_aliases: {
    paused: 'waiting',
  },
  lane_templates: [],
}) satisfies DomainPackManifest;

export type AgentRuntimePackManifest = typeof AGENT_RUNTIME_MANIFEST;
export type AgentRuntimeManifestTool = AgentRuntimePackManifest['tools'][number];

export const AGENT_RUNTIME_MANIFEST_TOOL_NAMES = AGENT_RUNTIME_MANIFEST.tools.map(
  (tool) => tool.name,
) as readonly AgentRuntimeToolName[];

export function getAgentRuntimeManifestToolByName(
  name: string,
): AgentRuntimeManifestTool | undefined {
  return AGENT_RUNTIME_MANIFEST.tools.find((tool) => tool.name === name);
}
