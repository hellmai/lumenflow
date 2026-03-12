// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import {
  AGENT_RUNTIME_API_KEY_ENV,
  AGENT_RUNTIME_BASE_URL_ENV,
  AGENT_RUNTIME_PACK_ID,
} from './constants.js';

export const AGENT_RUNTIME_PROVIDER_KINDS = {
  OPENAI_COMPATIBLE: 'openai_compatible',
} as const;

export const AGENT_RUNTIME_TURN_STATUSES = {
  REPLY: 'reply',
  TOOL_REQUEST: 'tool_request',
  COMPLETE: 'complete',
  ESCALATE: 'escalate',
} as const;

export const AGENT_RUNTIME_TOOL_NAMES = {
  EXECUTE_TURN: 'agent:execute-turn',
} as const;

export type AgentRuntimePackId = typeof AGENT_RUNTIME_PACK_ID;
export type AgentRuntimeProviderKind =
  (typeof AGENT_RUNTIME_PROVIDER_KINDS)[keyof typeof AGENT_RUNTIME_PROVIDER_KINDS];
export type AgentRuntimeTurnStatus =
  (typeof AGENT_RUNTIME_TURN_STATUSES)[keyof typeof AGENT_RUNTIME_TURN_STATUSES];
export type AgentRuntimeToolName =
  (typeof AGENT_RUNTIME_TOOL_NAMES)[keyof typeof AGENT_RUNTIME_TOOL_NAMES];

export interface AgentRuntimeModelProfileConfig {
  provider: AgentRuntimeProviderKind;
  model: string;
  api_key_env: string;
  base_url_env?: string;
}

export interface AgentRuntimeIntentConfig {
  description: string;
  allow_tools: string[];
  approval_required_tools?: string[];
}

export interface AgentRuntimeLimitsConfig {
  max_turns_per_session?: number;
  max_tool_calls_per_session?: number;
  max_input_bytes?: number;
}

export interface AgentRuntimePackConfig {
  default_model: string;
  models: Record<string, AgentRuntimeModelProfileConfig>;
  intents?: Record<string, AgentRuntimeIntentConfig>;
  limits?: AgentRuntimeLimitsConfig;
}

export interface AgentRuntimeMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_name?: string;
  tool_call_id?: string;
}

export interface AgentRuntimeToolCatalogEntry {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
}

export interface AgentRuntimeIntentCatalogEntry {
  id: string;
  description: string;
}

export interface AgentRuntimeExecuteTurnInput {
  session_id: string;
  messages: AgentRuntimeMessage[];
  model_profile: string;
  url: string;
  tool_catalog?: AgentRuntimeToolCatalogEntry[];
  intent_catalog?: AgentRuntimeIntentCatalogEntry[];
  limits?: AgentRuntimeLimitsConfig;
}

export interface AgentRuntimeRequestedTool {
  name: string;
  input: Record<string, unknown>;
}

export interface AgentRuntimeUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface AgentRuntimeProviderDescriptor {
  kind: AgentRuntimeProviderKind;
  model: string;
}

export interface AgentRuntimeExecuteTurnOutput {
  status: AgentRuntimeTurnStatus;
  intent: string;
  assistant_message: string;
  requested_tool?: AgentRuntimeRequestedTool;
  provider: AgentRuntimeProviderDescriptor;
  usage?: AgentRuntimeUsage;
  finish_reason: string;
}

export const AGENT_RUNTIME_DECLARED_ENVIRONMENT_VARIABLES = [
  AGENT_RUNTIME_API_KEY_ENV,
  AGENT_RUNTIME_BASE_URL_ENV,
] as const;

export type AgentRuntimeDeclaredEnvironmentVariable =
  (typeof AGENT_RUNTIME_DECLARED_ENVIRONMENT_VARIABLES)[number];
