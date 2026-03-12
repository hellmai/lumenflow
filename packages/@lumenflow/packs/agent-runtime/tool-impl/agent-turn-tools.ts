// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { TOOL_ERROR_CODES, type ExecutionContext, type ToolOutput } from '@lumenflow/kernel';
import {
  AGENT_RUNTIME_AGENT_TOOL_CALL_COUNT_METADATA_KEY,
  AGENT_RUNTIME_AGENT_TURN_INDEX_METADATA_KEY,
  AGENT_RUNTIME_API_KEY_ENV,
  AGENT_RUNTIME_BASE_URL_ENV,
} from '../constants.js';
import type {
  AgentRuntimeExecuteTurnInput,
  AgentRuntimeIntentCatalogEntry,
  AgentRuntimeLimitsConfig,
  AgentRuntimeMessage,
  AgentRuntimeToolCatalogEntry,
} from '../types.js';
import { STATIC_PROVIDER_CAPABILITY_BASELINE, executeProviderTurn } from './provider-adapters.js';

const LIMIT_EXCEEDED_ERROR_CODE = 'LIMIT_EXCEEDED';
const MISSING_ENVIRONMENT_ERROR_CODE = 'MISSING_ENVIRONMENT';
const CONFIGURATION_ERROR_CODE = 'CONFIGURATION_ERROR';
const PROVIDER_CALL_COUNT_ONE = 1;
const PROVIDER_CALL_COUNT_ZERO = 0;

interface ValidatedTurnInput extends AgentRuntimeExecuteTurnInput {
  messages: AgentRuntimeMessage[];
  tool_catalog: AgentRuntimeToolCatalogEntry[];
  intent_catalog: AgentRuntimeIntentCatalogEntry[];
  limits?: AgentRuntimeLimitsConfig;
}

interface ResolvedProviderEnvironment {
  apiKey: string;
  baseUrl: string;
}

export async function agentExecuteTurnTool(
  input: unknown,
  ctx: ExecutionContext,
): Promise<ToolOutput> {
  const parsedInput = validateExecuteTurnInput(input);
  if (!parsedInput.ok) {
    return createFailureOutput(TOOL_ERROR_CODES.INVALID_INPUT, parsedInput.message);
  }

  const validatedInput = parsedInput.value;
  const limitFailure = enforceExecutionLimits(validatedInput, ctx);
  if (limitFailure) {
    return limitFailure;
  }

  const environmentResult = resolveProviderEnvironment(validatedInput);
  if (!environmentResult.ok) {
    return environmentResult.output;
  }

  const providerResult = await executeProviderTurn({
    kind: STATIC_PROVIDER_CAPABILITY_BASELINE.kind,
    model: validatedInput.model_profile,
    url: validatedInput.url,
    apiKey: environmentResult.value.apiKey,
    messages: validatedInput.messages,
    toolCatalog: validatedInput.tool_catalog,
    intentCatalog: validatedInput.intent_catalog,
  });

  const metadata = createToolMetadata({
    provider_call_count: PROVIDER_CALL_COUNT_ONE,
    request_url: validatedInput.url,
    configured_base_url: environmentResult.value.baseUrl,
    ...(providerResult.metadata.response_status !== undefined
      ? { response_status: providerResult.metadata.response_status }
      : {}),
  });

  if (!providerResult.ok) {
    return {
      success: false,
      error: providerResult.error,
      metadata,
    };
  }

  return {
    success: true,
    data: providerResult.output,
    metadata,
  };
}

function validateExecuteTurnInput(
  input: unknown,
): { ok: true; value: ValidatedTurnInput } | { ok: false; message: string } {
  const record = asRecord(input);
  if (!record) {
    return { ok: false, message: 'Input must be an object.' };
  }

  if (
    hasUnexpectedKeys(record, [
      'session_id',
      'model_profile',
      'url',
      'messages',
      'tool_catalog',
      'intent_catalog',
      'limits',
    ])
  ) {
    return { ok: false, message: 'Input contains unknown properties.' };
  }

  const sessionId = readNonEmptyString(record.session_id);
  if (!sessionId) {
    return { ok: false, message: 'session_id is required.' };
  }

  const modelProfile = readNonEmptyString(record.model_profile);
  if (!modelProfile) {
    return { ok: false, message: 'model_profile is required.' };
  }

  const url = readNonEmptyString(record.url);
  if (!url) {
    return { ok: false, message: 'url is required.' };
  }
  if (!STATIC_PROVIDER_CAPABILITY_BASELINE.allowed_urls.includes(url)) {
    return {
      ok: false,
      message: `url must match one of the declared agent-runtime provider URLs: ${STATIC_PROVIDER_CAPABILITY_BASELINE.allowed_urls.join(', ')}`,
    };
  }

  const messages = validateMessages(record.messages);
  if (!messages.ok) {
    return messages;
  }

  const toolCatalog = validateToolCatalog(record.tool_catalog);
  if (!toolCatalog.ok) {
    return toolCatalog;
  }

  const intentCatalog = validateIntentCatalog(record.intent_catalog);
  if (!intentCatalog.ok) {
    return intentCatalog;
  }

  const limits = validateLimits(record.limits);
  if (!limits.ok) {
    return limits;
  }

  return {
    ok: true,
    value: {
      session_id: sessionId,
      model_profile: modelProfile,
      url,
      messages: messages.value,
      tool_catalog: toolCatalog.value,
      intent_catalog: intentCatalog.value,
      ...(limits.value ? { limits: limits.value } : {}),
    },
  };
}

function validateMessages(
  value: unknown,
): { ok: true; value: AgentRuntimeMessage[] } | { ok: false; message: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, message: 'messages must be a non-empty array.' };
  }

  const messages: AgentRuntimeMessage[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) {
      return { ok: false, message: 'messages entries must be objects.' };
    }
    if (hasUnexpectedKeys(record, ['role', 'content', 'tool_name', 'tool_call_id'])) {
      return { ok: false, message: 'messages entries contain unknown properties.' };
    }

    const role = readNonEmptyString(record.role);
    if (!isMessageRole(role)) {
      return {
        ok: false,
        message: 'messages.role must be one of system, user, assistant, or tool.',
      };
    }

    const content = readString(record.content);
    if (content === null) {
      return { ok: false, message: 'messages.content must be a string.' };
    }

    const toolName = readOptionalNonEmptyString(record.tool_name);
    if (record.tool_name !== undefined && toolName === null) {
      return { ok: false, message: 'messages.tool_name must be a non-empty string when provided.' };
    }

    const toolCallId = readOptionalNonEmptyString(record.tool_call_id);
    if (record.tool_call_id !== undefined && toolCallId === null) {
      return {
        ok: false,
        message: 'messages.tool_call_id must be a non-empty string when provided.',
      };
    }

    messages.push({
      role,
      content,
      ...(toolName ? { tool_name: toolName } : {}),
      ...(toolCallId ? { tool_call_id: toolCallId } : {}),
    });
  }

  return { ok: true, value: messages };
}

function validateToolCatalog(
  value: unknown,
): { ok: true; value: AgentRuntimeToolCatalogEntry[] } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(value)) {
    return { ok: false, message: 'tool_catalog must be an array when provided.' };
  }

  const toolCatalog: AgentRuntimeToolCatalogEntry[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) {
      return { ok: false, message: 'tool_catalog entries must be objects.' };
    }
    if (hasUnexpectedKeys(record, ['name', 'description', 'input_schema'])) {
      return { ok: false, message: 'tool_catalog entries contain unknown properties.' };
    }

    const name = readNonEmptyString(record.name);
    const description = readNonEmptyString(record.description);
    if (!name || !description) {
      return {
        ok: false,
        message: 'tool_catalog entries require non-empty name and description.',
      };
    }

    const inputSchema = record.input_schema;
    if (inputSchema !== undefined && !asRecord(inputSchema)) {
      return { ok: false, message: 'tool_catalog.input_schema must be an object when provided.' };
    }

    toolCatalog.push({
      name,
      description,
      ...(inputSchema !== undefined
        ? { input_schema: inputSchema as Record<string, unknown> }
        : {}),
    });
  }

  return { ok: true, value: toolCatalog };
}

function validateIntentCatalog(
  value: unknown,
): { ok: true; value: AgentRuntimeIntentCatalogEntry[] } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(value)) {
    return { ok: false, message: 'intent_catalog must be an array when provided.' };
  }

  const intentCatalog: AgentRuntimeIntentCatalogEntry[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) {
      return { ok: false, message: 'intent_catalog entries must be objects.' };
    }
    if (hasUnexpectedKeys(record, ['id', 'description'])) {
      return { ok: false, message: 'intent_catalog entries contain unknown properties.' };
    }

    const id = readNonEmptyString(record.id);
    const description = readNonEmptyString(record.description);
    if (!id || !description) {
      return {
        ok: false,
        message: 'intent_catalog entries require non-empty id and description.',
      };
    }

    intentCatalog.push({ id, description });
  }

  return { ok: true, value: intentCatalog };
}

function validateLimits(
  value: unknown,
): { ok: true; value?: AgentRuntimeLimitsConfig } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true };
  }

  const record = asRecord(value);
  if (!record) {
    return { ok: false, message: 'limits must be an object when provided.' };
  }
  if (
    hasUnexpectedKeys(record, [
      'max_turns_per_session',
      'max_tool_calls_per_session',
      'max_input_bytes',
    ])
  ) {
    return { ok: false, message: 'limits contains unknown properties.' };
  }

  const maxTurnsPerSession = readOptionalPositiveInteger(record.max_turns_per_session);
  if (record.max_turns_per_session !== undefined && maxTurnsPerSession === null) {
    return { ok: false, message: 'limits.max_turns_per_session must be a positive integer.' };
  }

  const maxToolCallsPerSession = readOptionalPositiveInteger(record.max_tool_calls_per_session);
  if (record.max_tool_calls_per_session !== undefined && maxToolCallsPerSession === null) {
    return {
      ok: false,
      message: 'limits.max_tool_calls_per_session must be a positive integer.',
    };
  }

  const maxInputBytes = readOptionalPositiveInteger(record.max_input_bytes);
  if (record.max_input_bytes !== undefined && maxInputBytes === null) {
    return { ok: false, message: 'limits.max_input_bytes must be a positive integer.' };
  }

  return {
    ok: true,
    value: {
      ...(maxTurnsPerSession !== null ? { max_turns_per_session: maxTurnsPerSession } : {}),
      ...(maxToolCallsPerSession !== null
        ? { max_tool_calls_per_session: maxToolCallsPerSession }
        : {}),
      ...(maxInputBytes !== null ? { max_input_bytes: maxInputBytes } : {}),
    },
  };
}

function enforceExecutionLimits(
  input: ValidatedTurnInput,
  ctx: ExecutionContext,
): ToolOutput | null {
  const maxInputBytes = input.limits?.max_input_bytes;
  if (maxInputBytes !== undefined) {
    const inputBytes = Buffer.byteLength(JSON.stringify(input), 'utf8');
    if (inputBytes > maxInputBytes) {
      return createFailureOutput(
        LIMIT_EXCEEDED_ERROR_CODE,
        `Serialized turn input exceeded max_input_bytes (${inputBytes} > ${maxInputBytes}).`,
        {
          provider_call_count: PROVIDER_CALL_COUNT_ZERO,
          input_bytes: inputBytes,
          max_input_bytes: maxInputBytes,
        },
      );
    }
  }

  const maxTurnsPerSession = input.limits?.max_turns_per_session;
  if (maxTurnsPerSession !== undefined) {
    const turnIndex = readAgentTurnIndex(ctx);
    if (turnIndex !== null && turnIndex >= maxTurnsPerSession) {
      return createFailureOutput(
        LIMIT_EXCEEDED_ERROR_CODE,
        `Execution metadata ${AGENT_RUNTIME_AGENT_TURN_INDEX_METADATA_KEY}=${turnIndex} reached max_turns_per_session=${maxTurnsPerSession}.`,
        {
          provider_call_count: PROVIDER_CALL_COUNT_ZERO,
          [AGENT_RUNTIME_AGENT_TURN_INDEX_METADATA_KEY]: turnIndex,
          max_turns_per_session: maxTurnsPerSession,
        },
      );
    }
  }

  const maxToolCallsPerSession = input.limits?.max_tool_calls_per_session;
  if (maxToolCallsPerSession !== undefined) {
    const toolCallCount = readAgentToolCallCount(ctx);
    if (toolCallCount !== null && toolCallCount >= maxToolCallsPerSession) {
      return createFailureOutput(
        LIMIT_EXCEEDED_ERROR_CODE,
        `Execution metadata ${AGENT_RUNTIME_AGENT_TOOL_CALL_COUNT_METADATA_KEY}=${toolCallCount} reached max_tool_calls_per_session=${maxToolCallsPerSession}.`,
        {
          provider_call_count: PROVIDER_CALL_COUNT_ZERO,
          [AGENT_RUNTIME_AGENT_TOOL_CALL_COUNT_METADATA_KEY]: toolCallCount,
          max_tool_calls_per_session: maxToolCallsPerSession,
        },
      );
    }
  }

  return null;
}

function resolveProviderEnvironment(
  input: ValidatedTurnInput,
): { ok: true; value: ResolvedProviderEnvironment } | { ok: false; output: ToolOutput } {
  const apiKey = readNonEmptyString(process.env.AGENT_RUNTIME_API_KEY);
  if (!apiKey) {
    return {
      ok: false,
      output: createFailureOutput(
        MISSING_ENVIRONMENT_ERROR_CODE,
        `${AGENT_RUNTIME_API_KEY_ENV} must be set for agent-runtime provider calls.`,
      ),
    };
  }

  const baseUrl = readNonEmptyString(process.env.AGENT_RUNTIME_BASE_URL);
  if (!baseUrl) {
    return {
      ok: false,
      output: createFailureOutput(
        MISSING_ENVIRONMENT_ERROR_CODE,
        `${AGENT_RUNTIME_BASE_URL_ENV} must be set for agent-runtime provider calls.`,
      ),
    };
  }

  const normalizedInputUrl = normalizeUrlForComparison(input.url);
  const normalizedBaseUrl = normalizeUrlForComparison(baseUrl);
  if (!normalizedInputUrl || !normalizedBaseUrl) {
    return {
      ok: false,
      output: createFailureOutput(
        CONFIGURATION_ERROR_CODE,
        'Agent-runtime provider URLs must be valid absolute URLs.',
      ),
    };
  }

  if (normalizedInputUrl !== normalizedBaseUrl) {
    return {
      ok: false,
      output: createFailureOutput(
        TOOL_ERROR_CODES.INVALID_INPUT,
        `input.url must match ${AGENT_RUNTIME_BASE_URL_ENV} for the selected provider profile.`,
        {
          configured_base_url: normalizedBaseUrl,
          requested_url: normalizedInputUrl,
        },
      ),
    };
  }

  return {
    ok: true,
    value: {
      apiKey,
      baseUrl: normalizedBaseUrl,
    },
  };
}

function createFailureOutput(
  code: string,
  message: string,
  metadata?: Record<string, unknown>,
): ToolOutput {
  return {
    success: false,
    error: {
      code,
      message,
    },
    metadata: createToolMetadata(metadata),
  };
}

function createToolMetadata(extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    provider_kind: STATIC_PROVIDER_CAPABILITY_BASELINE.kind,
    network_allowlist: [...STATIC_PROVIDER_CAPABILITY_BASELINE.network_allowlist],
    allowed_urls: [...STATIC_PROVIDER_CAPABILITY_BASELINE.allowed_urls],
    required_env: [...STATIC_PROVIDER_CAPABILITY_BASELINE.required_env],
    ...extra,
  };
}

function hasUnexpectedKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(record).some((key) => !allowedKeys.includes(key));
}

function isMessageRole(value: string | null): value is AgentRuntimeMessage['role'] {
  return value === 'system' || value === 'user' || value === 'assistant' || value === 'tool';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOptionalNonEmptyString(value: unknown): string | null {
  return value === undefined ? null : readNonEmptyString(value);
}

function readOptionalPositiveInteger(value: unknown): number | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function readAgentTurnIndex(ctx: ExecutionContext): number | null {
  if (!ctx.metadata) {
    return null;
  }
  const value = ctx.metadata[AGENT_RUNTIME_AGENT_TURN_INDEX_METADATA_KEY];
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function readAgentToolCallCount(ctx: ExecutionContext): number | null {
  if (!ctx.metadata) {
    return null;
  }
  const value = ctx.metadata[AGENT_RUNTIME_AGENT_TOOL_CALL_COUNT_METADATA_KEY];
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeUrlForComparison(value: string): string | null {
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}
