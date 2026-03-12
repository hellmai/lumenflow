// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

export const AGENT_RUNTIME_PACK_ID = 'agent-runtime' as const;
export const AGENT_RUNTIME_PACK_VERSION = '0.1.0' as const;
export const AGENT_RUNTIME_DOMAIN = AGENT_RUNTIME_PACK_ID;
export const AGENT_RUNTIME_CONFIG_KEY = 'agent_runtime' as const;
export const AGENT_RUNTIME_POLICY_ID_PREFIX = `${AGENT_RUNTIME_PACK_ID}.policy` as const;
export const AGENT_RUNTIME_MANIFEST_FILE_NAME = 'manifest.yaml' as const;
export const AGENT_RUNTIME_CONFIG_SCHEMA_FILE = 'config.schema.json' as const;
export const SHA256_ALGORITHM = 'sha256' as const;
export const UTF8_ENCODING = 'utf8' as const;
export const AGENT_RUNTIME_STORAGE_PATTERN = '.agent-runtime/**' as const;
export const AGENT_RUNTIME_API_KEY_ENV = 'AGENT_RUNTIME_API_KEY' as const;
export const AGENT_RUNTIME_BASE_URL_ENV = 'AGENT_RUNTIME_BASE_URL' as const;
export const AGENT_RUNTIME_STATIC_PROVIDER_ALLOWLIST = ['model-provider.invalid:443'] as const;
export const AGENT_RUNTIME_STATIC_PROVIDER_URLS = ['https://model-provider.invalid/'] as const;
export const AGENT_RUNTIME_AGENT_INTENT_METADATA_KEY = 'agent_intent' as const;
export const AGENT_RUNTIME_AGENT_TURN_INDEX_METADATA_KEY = 'agent_turn_index' as const;
export const AGENT_RUNTIME_AGENT_TOOL_CALL_COUNT_METADATA_KEY = 'agent_tool_call_count' as const;
export const AGENT_RUNTIME_AGENT_WORKFLOW_NODE_ID_METADATA_KEY = 'agent_workflow_node_id' as const;
