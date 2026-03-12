// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import {
  AGENT_RUNTIME_API_KEY_ENV,
  AGENT_RUNTIME_BASE_URL_ENV,
  AGENT_RUNTIME_STATIC_PROVIDER_ALLOWLIST,
  AGENT_RUNTIME_STATIC_PROVIDER_URLS,
} from '../constants.js';
import {
  AGENT_RUNTIME_PROVIDER_KINDS,
  AGENT_RUNTIME_TURN_STATUSES,
  type AgentRuntimeExecuteTurnOutput,
  type AgentRuntimeIntentCatalogEntry,
  type AgentRuntimeMessage,
  type AgentRuntimeRequestedTool,
  type AgentRuntimeStreamSnapshot,
  type AgentRuntimeToolCatalogEntry,
  type AgentRuntimeTurnStatus,
} from '../types.js';

const REQUEST_METHOD_POST = 'POST';
const HEADER_AUTHORIZATION = 'authorization';
const HEADER_CONTENT_TYPE = 'content-type';
const CONTENT_TYPE_JSON = 'application/json';
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_RATE_LIMITED = 429;
const RESPONSE_FORMAT_TYPE = 'json_object';
const DEFAULT_FINISH_REASON = 'stop';
const DEFAULT_ASSISTANT_MESSAGE = '';
const RESPONSE_MODE_NON_STREAMING = 'non_streaming';
const RESPONSE_MODE_STREAMING = 'streaming';
const STREAM_DONE_SENTINEL = '[DONE]';
const STREAM_LINE_PREFIX = 'data:';
const STREAM_DELIMITER = '\n\n';
const FIXTURE_TOOL_NAME = 'calendar:create-event';
const FIXTURE_INPUT_TOKEN_KEY = 'prompt_tokens';
const FIXTURE_OUTPUT_TOKEN_KEY = 'completion_tokens';
const FIXTURE_TOTAL_TOKEN_KEY = 'total_tokens';

const PROVIDER_ERROR_CODES = {
  AUTHENTICATION_FAILED: 'PROVIDER_AUTHENTICATION_FAILED',
  HTTP_ERROR: 'PROVIDER_HTTP_ERROR',
  MALFORMED_RESPONSE: 'PROVIDER_MALFORMED_RESPONSE',
  RATE_LIMITED: 'PROVIDER_RATE_LIMITED',
  TRANSPORT_ERROR: 'PROVIDER_TRANSPORT_ERROR',
  UNSUPPORTED_PROVIDER: 'PROVIDER_UNSUPPORTED',
} as const;

const CONFORMANCE_SCENARIOS = {
  SUCCESS: 'success',
  TOOL_REQUEST_SHAPING: 'tool_request_shaping',
  MALFORMED_RESPONSE: 'malformed_response',
  NORMALIZED_ERROR: 'normalized_error',
} as const;

export interface ProviderCapabilityBaseline {
  kind: typeof AGENT_RUNTIME_PROVIDER_KINDS.OPENAI_COMPATIBLE;
  required_env: readonly string[];
  network_allowlist: readonly string[];
  allowed_urls: readonly string[];
}

export interface ProviderTurnRequest {
  kind: typeof AGENT_RUNTIME_PROVIDER_KINDS.OPENAI_COMPATIBLE;
  model: string;
  url: string;
  apiKey: string;
  stream?: boolean;
  messages: readonly AgentRuntimeMessage[];
  toolCatalog: readonly AgentRuntimeToolCatalogEntry[];
  intentCatalog: readonly AgentRuntimeIntentCatalogEntry[];
}

export interface ProviderTurnMetadata {
  provider_kind: ProviderCapabilityBaseline['kind'];
  request_url: string;
  response_status?: number;
  response_mode?: typeof RESPONSE_MODE_NON_STREAMING | typeof RESPONSE_MODE_STREAMING;
  stream_snapshot_count?: number;
}

export interface ProviderTurnError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ProviderTurnSuccess {
  ok: true;
  output: AgentRuntimeExecuteTurnOutput;
  metadata: ProviderTurnMetadata;
  stream_snapshots?: readonly AgentRuntimeStreamSnapshot[];
}

export interface ProviderTurnFailure {
  ok: false;
  error: ProviderTurnError;
  metadata: ProviderTurnMetadata;
}

export type ProviderTurnResult = ProviderTurnSuccess | ProviderTurnFailure;

export interface ProviderAdapterConformanceResult {
  scenario: string;
  passed: boolean;
  normalized_output?: AgentRuntimeExecuteTurnOutput;
  normalized_error?: ProviderTurnError;
}

export type ProviderTransport = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'text' | 'body'>>;

export const STATIC_PROVIDER_CAPABILITY_BASELINE: ProviderCapabilityBaseline = {
  kind: AGENT_RUNTIME_PROVIDER_KINDS.OPENAI_COMPATIBLE,
  required_env: [AGENT_RUNTIME_API_KEY_ENV, AGENT_RUNTIME_BASE_URL_ENV],
  network_allowlist: AGENT_RUNTIME_STATIC_PROVIDER_ALLOWLIST,
  allowed_urls: AGENT_RUNTIME_STATIC_PROVIDER_URLS,
};

export function listStaticProviderCapabilityBaselines(): readonly ProviderCapabilityBaseline[] {
  return [STATIC_PROVIDER_CAPABILITY_BASELINE];
}

export function validateNormalizedTurnOutput(
  value: unknown,
): { ok: true; value: AgentRuntimeExecuteTurnOutput } | { ok: false; error: ProviderTurnError } {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: createMalformedResponseError(
        'Provider normalization did not produce an object. Ensure the adapter returns the governed turn shape.',
      ),
    };
  }

  const status = normalizeTurnStatus(value.status, value.requested_tool);
  if (!status) {
    return {
      ok: false,
      error: createMalformedResponseError(
        'Provider normalization returned an invalid status. Use reply, tool_request, complete, or escalate.',
      ),
    };
  }

  const intent = asNonEmptyString(value.intent);
  if (!intent) {
    return {
      ok: false,
      error: createMalformedResponseError(
        'Provider normalization returned no intent string. Ensure the model emits an intent field.',
      ),
    };
  }

  if (typeof value.assistant_message !== 'string') {
    return {
      ok: false,
      error: createMalformedResponseError(
        'Provider normalization returned a non-string assistant_message. Ensure the model emits assistant_message as text.',
      ),
    };
  }

  const provider = normalizeProviderDescriptor(value.provider);
  if (!provider) {
    return {
      ok: false,
      error: createMalformedResponseError(
        'Provider normalization returned an invalid provider descriptor. Include kind and model strings.',
      ),
    };
  }

  const finishReason = asNonEmptyString(value.finish_reason);
  if (!finishReason) {
    return {
      ok: false,
      error: createMalformedResponseError(
        'Provider normalization returned no finish_reason. Include a non-empty provider finish reason.',
      ),
    };
  }

  const requestedTool = normalizeRequestedTool(value.requested_tool);
  if (status === AGENT_RUNTIME_TURN_STATUSES.TOOL_REQUEST && !requestedTool) {
    return {
      ok: false,
      error: createMalformedResponseError(
        'Provider normalization returned tool_request without a requested_tool payload.',
      ),
    };
  }

  const usage = normalizeUsage(value.usage);

  return {
    ok: true,
    value: {
      status,
      intent,
      assistant_message: value.assistant_message,
      ...(requestedTool ? { requested_tool: requestedTool } : {}),
      provider,
      ...(usage ? { usage } : {}),
      finish_reason: finishReason,
    },
  };
}

export async function executeProviderTurn(
  request: ProviderTurnRequest,
  options?: {
    transport?: ProviderTransport;
  },
): Promise<ProviderTurnResult> {
  if (request.kind !== AGENT_RUNTIME_PROVIDER_KINDS.OPENAI_COMPATIBLE) {
    return {
      ok: false,
      error: {
        code: PROVIDER_ERROR_CODES.UNSUPPORTED_PROVIDER,
        message: `Provider kind "${request.kind}" is not supported by agent-runtime. Use openai_compatible for this work unit.`,
      },
      metadata: {
        provider_kind: request.kind,
        request_url: request.url,
        response_mode: request.stream ? RESPONSE_MODE_STREAMING : RESPONSE_MODE_NON_STREAMING,
      },
    };
  }

  const transport = options?.transport ?? defaultTransport;
  const requestPayload = buildOpenAiCompatibleRequestPayload(request);

  let response: Pick<Response, 'ok' | 'status' | 'text' | 'body'>;
  try {
    response = await transport(request.url, {
      method: REQUEST_METHOD_POST,
      headers: {
        [HEADER_AUTHORIZATION]: `Bearer ${request.apiKey}`,
        [HEADER_CONTENT_TYPE]: CONTENT_TYPE_JSON,
      },
      body: JSON.stringify(requestPayload),
    });
  } catch (error) {
    return {
      ok: false,
      error: createTransportError(request, error),
      metadata: {
        provider_kind: request.kind,
        request_url: request.url,
        response_mode: request.stream ? RESPONSE_MODE_STREAMING : RESPONSE_MODE_NON_STREAMING,
      },
    };
  }

  const metadata: ProviderTurnMetadata = {
    provider_kind: request.kind,
    request_url: request.url,
    response_status: response.status,
    response_mode: request.stream ? RESPONSE_MODE_STREAMING : RESPONSE_MODE_NON_STREAMING,
  };

  if (!response.ok) {
    const responseText = await response.text();
    return {
      ok: false,
      error: normalizeHttpError(request, response.status, responseText),
      metadata,
    };
  }

  if (request.stream) {
    return executeStreamingProviderTurn(request, response, metadata);
  }

  const responseText = await response.text();

  const parsedBody = parseJsonRecord(
    responseText,
    'Provider returned a non-JSON success payload. Ensure the provider emits JSON and not plain text.',
  );
  if (!parsedBody.ok) {
    return {
      ok: false,
      error: parsedBody.error,
      metadata,
    };
  }

  const normalizedOutput = normalizeOpenAiCompatibleResponse(parsedBody.value, request);
  if (!normalizedOutput.ok) {
    return {
      ok: false,
      error: normalizedOutput.error,
      metadata,
    };
  }

  return {
    ok: true,
    output: normalizedOutput.value,
    metadata,
  };
}

export async function runProviderAdapterConformanceHarness(): Promise<
  readonly ProviderAdapterConformanceResult[]
> {
  const [staticProviderUrl] = AGENT_RUNTIME_STATIC_PROVIDER_URLS;
  const baseRequest: ProviderTurnRequest = {
    kind: AGENT_RUNTIME_PROVIDER_KINDS.OPENAI_COMPATIBLE,
    model: 'fixture-model',
    url: staticProviderUrl,
    apiKey: 'fixture-token',
    messages: [{ role: 'user', content: 'Create a reminder.' }],
    toolCatalog: [
      {
        name: FIXTURE_TOOL_NAME,
        description: 'Create a calendar event',
      },
    ],
    intentCatalog: [
      {
        id: 'scheduling',
        description: 'Schedule or reschedule work',
      },
    ],
  };

  const scenarios = [
    {
      scenario: CONFORMANCE_SCENARIOS.SUCCESS,
      transport: async () =>
        createJsonResponse({
          model: baseRequest.model,
          choices: [
            {
              finish_reason: DEFAULT_FINISH_REASON,
              message: {
                content: JSON.stringify({
                  status: AGENT_RUNTIME_TURN_STATUSES.REPLY,
                  intent: 'scheduling',
                  assistant_message: 'Scheduled.',
                }),
              },
            },
          ],
          usage: {
            [FIXTURE_INPUT_TOKEN_KEY]: 10,
            [FIXTURE_OUTPUT_TOKEN_KEY]: 4,
            [FIXTURE_TOTAL_TOKEN_KEY]: 14,
          },
        }),
      verify: (result: ProviderTurnResult): ProviderAdapterConformanceResult => ({
        scenario: CONFORMANCE_SCENARIOS.SUCCESS,
        passed:
          result.ok &&
          result.output.status === AGENT_RUNTIME_TURN_STATUSES.REPLY &&
          result.output.intent === 'scheduling',
        ...(result.ok ? { normalized_output: result.output } : {}),
      }),
    },
    {
      scenario: CONFORMANCE_SCENARIOS.TOOL_REQUEST_SHAPING,
      transport: async () =>
        createJsonResponse({
          model: baseRequest.model,
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: JSON.stringify({
                  status: AGENT_RUNTIME_TURN_STATUSES.TOOL_REQUEST,
                  intent: 'scheduling',
                  assistant_message: 'Creating the event now.',
                }),
                tool_calls: [
                  {
                    type: 'function',
                    function: {
                      name: FIXTURE_TOOL_NAME,
                      arguments: JSON.stringify({
                        title: 'Reminder',
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      verify: (result: ProviderTurnResult): ProviderAdapterConformanceResult => ({
        scenario: CONFORMANCE_SCENARIOS.TOOL_REQUEST_SHAPING,
        passed:
          result.ok &&
          result.output.status === AGENT_RUNTIME_TURN_STATUSES.TOOL_REQUEST &&
          result.output.requested_tool?.name === FIXTURE_TOOL_NAME,
        ...(result.ok ? { normalized_output: result.output } : {}),
      }),
    },
    {
      scenario: CONFORMANCE_SCENARIOS.MALFORMED_RESPONSE,
      transport: async () =>
        createJsonResponse({
          model: baseRequest.model,
          choices: [
            {
              finish_reason: DEFAULT_FINISH_REASON,
              message: {
                content: '{"intent":42}',
              },
            },
          ],
        }),
      verify: (result: ProviderTurnResult): ProviderAdapterConformanceResult => ({
        scenario: CONFORMANCE_SCENARIOS.MALFORMED_RESPONSE,
        passed: !result.ok && result.error.code === PROVIDER_ERROR_CODES.MALFORMED_RESPONSE,
        ...(!result.ok ? { normalized_error: result.error } : {}),
      }),
    },
    {
      scenario: CONFORMANCE_SCENARIOS.NORMALIZED_ERROR,
      transport: async () =>
        createJsonResponse(
          {
            error: {
              message: 'Too many requests',
              code: 'rate_limit',
            },
          },
          HTTP_STATUS_RATE_LIMITED,
        ),
      verify: (result: ProviderTurnResult): ProviderAdapterConformanceResult => ({
        scenario: CONFORMANCE_SCENARIOS.NORMALIZED_ERROR,
        passed: !result.ok && result.error.code === PROVIDER_ERROR_CODES.RATE_LIMITED,
        ...(!result.ok ? { normalized_error: result.error } : {}),
      }),
    },
  ] as const;

  const results: ProviderAdapterConformanceResult[] = [];
  for (const scenario of scenarios) {
    const result = await executeProviderTurn(baseRequest, {
      transport: scenario.transport,
    });
    results.push(scenario.verify(result));
  }
  return results;
}

function buildOpenAiCompatibleRequestPayload(
  request: ProviderTurnRequest,
): Record<string, unknown> {
  return {
    model: request.model,
    ...(request.stream ? { stream: true } : {}),
    messages: [
      {
        role: 'system',
        content: buildSystemInstruction(request.intentCatalog, request.toolCatalog),
      },
      ...request.messages.map((message) => normalizeOutboundMessage(message)),
    ],
    response_format: {
      type: RESPONSE_FORMAT_TYPE,
    },
  };
}

function buildSystemInstruction(
  intentCatalog: readonly AgentRuntimeIntentCatalogEntry[],
  toolCatalog: readonly AgentRuntimeToolCatalogEntry[],
): string {
  const intents =
    intentCatalog.length === 0
      ? 'No explicit intents were supplied.'
      : intentCatalog.map((intent) => `- ${intent.id}: ${intent.description}`).join('\n');
  const tools =
    toolCatalog.length === 0
      ? 'No tools are available.'
      : toolCatalog.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n');

  return [
    'Return a single JSON object with keys: status, intent, assistant_message, and optional requested_tool.',
    'When a tool is needed, set status to "tool_request".',
    'Allowed intents:',
    intents,
    'Available tools:',
    tools,
  ].join('\n');
}

function normalizeOutboundMessage(message: AgentRuntimeMessage): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    role: message.role,
    content: message.content,
  };

  if (message.tool_name) {
    normalized.tool_name = message.tool_name;
  }
  if (message.tool_call_id) {
    normalized.tool_call_id = message.tool_call_id;
  }

  return normalized;
}

function normalizeOpenAiCompatibleResponse(
  payload: Record<string, unknown>,
  request: ProviderTurnRequest,
): { ok: true; value: AgentRuntimeExecuteTurnOutput } | { ok: false; error: ProviderTurnError } {
  const choices = asArray(payload.choices);
  const [firstChoiceCandidate] = choices ?? [];
  const firstChoice = asRecord(firstChoiceCandidate);
  if (!firstChoice) {
    return {
      ok: false,
      error: createMalformedResponseError(
        'Provider response did not include choices[0]. Ensure the provider returns a chat-completion-style payload.',
      ),
    };
  }

  const message = asRecord(firstChoice.message);
  if (!message) {
    return {
      ok: false,
      error: createMalformedResponseError(
        'Provider response did not include choices[0].message. Ensure the provider returns assistant message data.',
      ),
    };
  }

  const contentText = extractMessageContentText(message.content);
  const contentRecord = parseJsonRecord(
    contentText,
    'Provider assistant content was not valid JSON. Ensure the provider returns a JSON object that matches the governed turn schema.',
  );
  if (!contentRecord.ok) {
    return {
      ok: false,
      error: contentRecord.error,
    };
  }

  const shapedRequestedTool = shapeRequestedTool(message.tool_calls);
  if (!shapedRequestedTool.ok) {
    return {
      ok: false,
      error: shapedRequestedTool.error,
    };
  }

  const rawOutput: Record<string, unknown> = {
    status: contentRecord.value.status,
    intent: contentRecord.value.intent,
    assistant_message: contentRecord.value.assistant_message ?? DEFAULT_ASSISTANT_MESSAGE,
    provider: {
      kind: request.kind,
      model: asNonEmptyString(payload.model) ?? request.model,
    },
    finish_reason: asNonEmptyString(firstChoice.finish_reason) ?? DEFAULT_FINISH_REASON,
  };

  const requestedTool = normalizeRequestedTool(contentRecord.value.requested_tool);
  if (requestedTool) {
    rawOutput.requested_tool = requestedTool;
  } else if (shapedRequestedTool.value) {
    rawOutput.requested_tool = shapedRequestedTool.value;
  }

  const usage = normalizeUsage(payload.usage);
  if (usage) {
    rawOutput.usage = usage;
  }

  return validateNormalizedTurnOutput(rawOutput);
}

async function executeStreamingProviderTurn(
  request: ProviderTurnRequest,
  response: Pick<Response, 'body'>,
  metadata: ProviderTurnMetadata,
): Promise<ProviderTurnResult> {
  const streamParse = await parseOpenAiCompatibleStream(response.body, request);
  if (!streamParse.ok) {
    return {
      ok: false,
      error: streamParse.error,
      metadata,
    };
  }

  const normalizedOutput = normalizeOpenAiCompatibleResponse(streamParse.payload, request);
  if (!normalizedOutput.ok) {
    return {
      ok: false,
      error: normalizedOutput.error,
      metadata,
    };
  }

  return {
    ok: true,
    output: normalizedOutput.value,
    metadata: {
      ...metadata,
      stream_snapshot_count: streamParse.snapshots.length + 1,
    },
    stream_snapshots: [
      ...streamParse.snapshots,
      {
        sequence: streamParse.snapshots.length,
        state: 'final',
        data: {
          ...normalizedOutput.value,
        },
      },
    ],
  };
}

async function parseOpenAiCompatibleStream(
  body: ReadableStream<Uint8Array> | null | undefined,
  request: ProviderTurnRequest,
): Promise<
  | {
      ok: true;
      payload: Record<string, unknown>;
      snapshots: AgentRuntimeStreamSnapshot[];
    }
  | { ok: false; error: ProviderTurnError }
> {
  const events = await readStreamEvents(body);
  let accumulatedContent = '';
  let finishReason: string | null = null;
  let model = request.model;
  let usage: AgentRuntimeExecuteTurnOutput['usage'];
  const snapshots: AgentRuntimeStreamSnapshot[] = [];

  for (const event of events) {
    if (event === STREAM_DONE_SENTINEL) {
      continue;
    }

    const parsedEvent = parseJsonRecord(
      event,
      'Streaming provider event was not valid JSON. Ensure the provider emits JSON data events.',
    );
    if (!parsedEvent.ok) {
      return parsedEvent;
    }

    const choice = asRecord(asArray(parsedEvent.value.choices)?.[0]);
    if (!choice) {
      return {
        ok: false,
        error: createMalformedResponseError(
          'Streaming provider event did not include choices[0]. Ensure the provider emits chat-completion-style stream chunks.',
        ),
      };
    }

    const streamedFinishReason = asNonEmptyString(choice.finish_reason);
    const delta = asRecord(choice.delta);
    const contentDelta = extractMessageContentText(delta?.content);
    if (contentDelta.length > 0) {
      accumulatedContent += contentDelta;
      if (!streamedFinishReason) {
        snapshots.push({
          sequence: snapshots.length,
          state: 'partial',
          data: {
            assistant_message: accumulatedContent,
            provider: {
              kind: request.kind,
              model,
            },
          },
        });
      }
    }

    if (streamedFinishReason) {
      finishReason = streamedFinishReason;
    }

    const streamedModel = asNonEmptyString(parsedEvent.value.model);
    if (streamedModel) {
      model = streamedModel;
    }

    const streamedUsage = normalizeUsage(parsedEvent.value.usage);
    if (streamedUsage) {
      usage = streamedUsage;
    }
  }

  return {
    ok: true,
    payload: {
      model,
      choices: [
        {
          finish_reason: finishReason ?? DEFAULT_FINISH_REASON,
          message: {
            content: accumulatedContent,
          },
        },
      ],
      ...(usage ? { usage } : {}),
    },
    snapshots,
  };
}

function normalizeTurnStatus(
  statusValue: unknown,
  requestedToolValue: unknown,
): AgentRuntimeTurnStatus | null {
  if (isTurnStatus(statusValue)) {
    return requestedToolValue ? AGENT_RUNTIME_TURN_STATUSES.TOOL_REQUEST : statusValue;
  }

  if (requestedToolValue) {
    return AGENT_RUNTIME_TURN_STATUSES.TOOL_REQUEST;
  }

  return AGENT_RUNTIME_TURN_STATUSES.REPLY;
}

function normalizeProviderDescriptor(
  value: unknown,
): AgentRuntimeExecuteTurnOutput['provider'] | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = asNonEmptyString(value.kind);
  const model = asNonEmptyString(value.model);
  if (!kind || !model) {
    return null;
  }

  if (kind !== AGENT_RUNTIME_PROVIDER_KINDS.OPENAI_COMPATIBLE) {
    return null;
  }

  return {
    kind,
    model,
  };
}

function normalizeUsage(value: unknown): AgentRuntimeExecuteTurnOutput['usage'] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const inputTokens = asInteger(value.input_tokens ?? value.prompt_tokens);
  const outputTokens = asInteger(value.output_tokens ?? value.completion_tokens);
  const totalTokens = asInteger(value.total_tokens ?? value.total_tokens);

  if (inputTokens === null && outputTokens === null && totalTokens === null) {
    return undefined;
  }

  return {
    ...(inputTokens !== null ? { input_tokens: inputTokens } : {}),
    ...(outputTokens !== null ? { output_tokens: outputTokens } : {}),
    ...(totalTokens !== null ? { total_tokens: totalTokens } : {}),
  };
}

function normalizeRequestedTool(value: unknown): AgentRuntimeRequestedTool | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = asNonEmptyString(value.name);
  const input = asRecord(value.input);
  if (!name || !input) {
    return null;
  }

  return { name, input };
}

function shapeRequestedTool(
  toolCallsValue: unknown,
): { ok: true; value: AgentRuntimeRequestedTool | null } | { ok: false; error: ProviderTurnError } {
  const toolCalls = asArray(toolCallsValue);
  if (!toolCalls || toolCalls.length === 0) {
    return { ok: true, value: null };
  }

  const [firstToolCallCandidate] = toolCalls;
  const firstToolCall = asRecord(firstToolCallCandidate);
  const functionRecord = firstToolCall ? asRecord(firstToolCall.function) : null;
  const name = functionRecord ? asNonEmptyString(functionRecord.name) : null;
  if (!functionRecord || !name) {
    return {
      ok: false,
      error: createMalformedResponseError(
        'Provider tool call did not include function.name. Ensure tool calls include a named function payload.',
      ),
    };
  }

  const parsedArguments = parseRequestedToolArguments(functionRecord.arguments);
  if (!parsedArguments.ok) {
    return {
      ok: false,
      error: parsedArguments.error,
    };
  }

  return {
    ok: true,
    value: {
      name,
      input: parsedArguments.value,
    },
  };
}

function parseRequestedToolArguments(
  value: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: ProviderTurnError } {
  if (isRecord(value)) {
    return { ok: true, value };
  }

  const argumentsText = asNonEmptyString(value);
  if (!argumentsText) {
    return {
      ok: false,
      error: createMalformedResponseError(
        'Provider tool call arguments were missing. Ensure tool call arguments are a JSON object.',
      ),
    };
  }

  return parseJsonRecord(
    argumentsText,
    'Provider tool call arguments were not valid JSON. Ensure the provider encodes tool arguments as a JSON object.',
  );
}

function extractMessageContentText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  const parts = asArray(value);
  if (!parts) {
    return DEFAULT_ASSISTANT_MESSAGE;
  }

  const textParts: string[] = [];
  for (const part of parts) {
    const record = asRecord(part);
    if (!record) {
      continue;
    }
    const textValue = asNonEmptyString(record.text);
    if (textValue) {
      textParts.push(textValue);
    }
  }

  return textParts.join('\n');
}

async function readStreamEvents(
  body: ReadableStream<Uint8Array> | null | undefined,
): Promise<string[]> {
  if (!body) {
    return [];
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    buffer = buffer.replaceAll('\r\n', '\n');

    let delimiterIndex = buffer.indexOf(STREAM_DELIMITER);
    while (delimiterIndex >= 0) {
      const event = parseStreamEvent(buffer.slice(0, delimiterIndex));
      if (event) {
        events.push(event);
      }
      buffer = buffer.slice(delimiterIndex + STREAM_DELIMITER.length);
      delimiterIndex = buffer.indexOf(STREAM_DELIMITER);
    }

    if (done) {
      break;
    }
  }

  const trailingEvent = parseStreamEvent(buffer);
  if (trailingEvent) {
    events.push(trailingEvent);
  }

  return events;
}

function parseStreamEvent(chunk: string): string | null {
  const dataLines = chunk
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(STREAM_LINE_PREFIX))
    .map((line) => line.slice(STREAM_LINE_PREFIX.length).trimStart());

  if (dataLines.length === 0) {
    return null;
  }

  return dataLines.join('\n');
}

function normalizeHttpError(
  request: ProviderTurnRequest,
  status: number,
  responseText: string,
): ProviderTurnError {
  const parsedResponse = safeParseJsonRecord(responseText);
  const providerErrorRecord =
    parsedResponse && isRecord(parsedResponse.error) ? parsedResponse.error : null;
  const providerMessage = asNonEmptyString(providerErrorRecord?.message);
  const providerCode = asNonEmptyString(providerErrorRecord?.code);

  if (status === HTTP_STATUS_UNAUTHORIZED) {
    return {
      code: PROVIDER_ERROR_CODES.AUTHENTICATION_FAILED,
      message: `Provider rejected the agent-runtime credentials with HTTP ${status}. Check ${AGENT_RUNTIME_API_KEY_ENV} and retry the turn.`,
      details: {
        provider_kind: request.kind,
        response_status: status,
        request_url: request.url,
        ...(providerCode ? { provider_code: providerCode } : {}),
        ...(providerMessage ? { provider_message: providerMessage } : {}),
      },
    };
  }

  if (status === HTTP_STATUS_RATE_LIMITED) {
    return {
      code: PROVIDER_ERROR_CODES.RATE_LIMITED,
      message: `Provider rate limited the agent-runtime turn with HTTP ${status}. Retry later or reduce turn volume.`,
      details: {
        provider_kind: request.kind,
        response_status: status,
        request_url: request.url,
        ...(providerCode ? { provider_code: providerCode } : {}),
        ...(providerMessage ? { provider_message: providerMessage } : {}),
      },
    };
  }

  return {
    code: PROVIDER_ERROR_CODES.HTTP_ERROR,
    message: `Provider request failed with HTTP ${status} while calling ${request.url}. Review provider availability and request formatting.`,
    details: {
      provider_kind: request.kind,
      response_status: status,
      request_url: request.url,
      ...(providerCode ? { provider_code: providerCode } : {}),
      ...(providerMessage ? { provider_message: providerMessage } : {}),
    },
  };
}

function createMalformedResponseError(message: string): ProviderTurnError {
  return {
    code: PROVIDER_ERROR_CODES.MALFORMED_RESPONSE,
    message,
  };
}

function createTransportError(request: ProviderTurnRequest, error: unknown): ProviderTurnError {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown transport failure';

  return {
    code: PROVIDER_ERROR_CODES.TRANSPORT_ERROR,
    message: `Provider request failed before a response was received from ${request.url}: ${detail}`,
    details: {
      provider_kind: request.kind,
      request_url: request.url,
    },
  };
}

function parseJsonRecord(
  text: string,
  message: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: ProviderTurnError } {
  const parsed = safeParseJsonRecord(text);
  if (!parsed) {
    return {
      ok: false,
      error: createMalformedResponseError(message),
    };
  }
  return {
    ok: true,
    value: parsed,
  };
}

function safeParseJsonRecord(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isTurnStatus(value: unknown): value is AgentRuntimeTurnStatus {
  return Object.values(AGENT_RUNTIME_TURN_STATUSES).includes(value as AgentRuntimeTurnStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.trunc(value);
}

async function defaultTransport(
  url: string,
  init: RequestInit,
): Promise<Pick<Response, 'ok' | 'status' | 'text' | 'body'>> {
  return globalThis.fetch(url, init);
}

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      [HEADER_CONTENT_TYPE]: CONTENT_TYPE_JSON,
    },
  });
}
