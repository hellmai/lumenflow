// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '../kernel.schemas.js';
import { TOOL_OUTPUT_METADATA_KEYS } from '../shared-constants.js';
import { agentExecuteTurnTool } from '../../../packs/agent-runtime/tool-impl/agent-turn-tools.js';
import {
  executeProviderTurn,
  runProviderAdapterConformanceHarness,
} from '../../../packs/agent-runtime/tool-impl/provider-adapters.js';

const TEST_API_KEY = 'test-agent-runtime-api-key';
const TEST_MESSAGES_API_KEY = 'test-agent-runtime-messages-api-key';
const TEST_URL = 'https://model-provider.invalid/';
const TEST_MODEL = 'demo-model';
const TEST_MESSAGES_MODEL = 'messages-demo-model';
const TEST_RUN_ID = 'run-agent-runtime-turn';
const TEST_TASK_ID = 'task-agent-runtime-turn';
const TEST_SESSION_ID = 'session-agent-runtime-turn';
const TEST_ALLOWED_SCOPES: ExecutionContext['allowed_scopes'] = [];
const TEST_EXECUTION_CONTEXT: ExecutionContext = {
  run_id: TEST_RUN_ID,
  task_id: TEST_TASK_ID,
  session_id: TEST_SESSION_ID,
  allowed_scopes: TEST_ALLOWED_SCOPES,
};

function createExecutionContext(options?: {
  metadata?: Record<string, unknown>;
  packConfig?: Record<string, unknown>;
}): ExecutionContext {
  const context = options?.metadata
    ? { ...TEST_EXECUTION_CONTEXT, metadata: options.metadata }
    : { ...TEST_EXECUTION_CONTEXT };

  if (options?.packConfig === undefined) {
    return context;
  }

  return Object.assign(context, {
    pack_config: options.packConfig,
  });
}

function createTurnInput(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    session_id: TEST_SESSION_ID,
    model_profile: TEST_MODEL,
    url: TEST_URL,
    messages: [{ role: 'user', content: 'Schedule a follow-up for tomorrow.' }],
    tool_catalog: [
      {
        name: 'calendar:create-event',
        description: 'Create a calendar event',
        input_schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
    ],
    intent_catalog: [{ id: 'scheduling', description: 'Schedule or reschedule work' }],
    ...overrides,
  };
}

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function createStreamingResponse(events: readonly string[], status = 200): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(event));
        }
        controller.close();
      },
    }),
    {
      status,
      headers: {
        'content-type': 'text/event-stream',
      },
    },
  );
}

function createMessagesCompatibleResponse(body: unknown, status = 200): Response {
  return createJsonResponse(body, status);
}

describe('agent-runtime execute turn tool', () => {
  const originalApiKey = process.env.AGENT_RUNTIME_API_KEY;
  const originalBaseUrl = process.env.AGENT_RUNTIME_BASE_URL;
  const originalMessagesApiKey = process.env.MESSAGES_PROVIDER_API_KEY;
  const originalMessagesBaseUrl = process.env.MESSAGES_PROVIDER_BASE_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env.AGENT_RUNTIME_API_KEY = TEST_API_KEY;
    process.env.AGENT_RUNTIME_BASE_URL = TEST_URL;
    process.env.MESSAGES_PROVIDER_API_KEY = TEST_MESSAGES_API_KEY;
    process.env.MESSAGES_PROVIDER_BASE_URL = TEST_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalApiKey === undefined) {
      delete process.env.AGENT_RUNTIME_API_KEY;
    } else {
      process.env.AGENT_RUNTIME_API_KEY = originalApiKey;
    }
    if (originalBaseUrl === undefined) {
      delete process.env.AGENT_RUNTIME_BASE_URL;
    } else {
      process.env.AGENT_RUNTIME_BASE_URL = originalBaseUrl;
    }
    if (originalMessagesApiKey === undefined) {
      delete process.env.MESSAGES_PROVIDER_API_KEY;
    } else {
      process.env.MESSAGES_PROVIDER_API_KEY = originalMessagesApiKey;
    }
    if (originalMessagesBaseUrl === undefined) {
      delete process.env.MESSAGES_PROVIDER_BASE_URL;
    } else {
      process.env.MESSAGES_PROVIDER_BASE_URL = originalMessagesBaseUrl;
    }
  });

  it('rejects invalid turn input before any provider call occurs', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    const result = await agentExecuteTurnTool(
      createTurnInput({
        messages: [{ role: 'invalid', content: 'bad role' }],
      }),
      createExecutionContext(),
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('performs exactly one provider call and returns normalized turn output', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        model: TEST_MODEL,
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                status: 'reply',
                intent: 'scheduling',
                assistant_message: 'Follow-up scheduled.',
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 18,
          completion_tokens: 7,
          total_tokens: 25,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await agentExecuteTurnTool(createTurnInput(), createExecutionContext());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      TEST_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: `Bearer ${TEST_API_KEY}`,
        }),
      }),
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      status: 'reply',
      intent: 'scheduling',
      assistant_message: 'Follow-up scheduled.',
      provider: {
        kind: 'openai_compatible',
        model: TEST_MODEL,
      },
      usage: {
        input_tokens: 18,
        output_tokens: 7,
        total_tokens: 25,
      },
      finish_reason: 'stop',
    });
    expect(result.metadata?.provider_call_count).toBe(1);
  });

  it('captures streaming partial snapshots while preserving the final normalized output', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        createStreamingResponse([
          'data: {"model":"demo-model","choices":[{"index":0,"delta":{"content":"{\\"status\\":\\"reply\\",\\"intent\\":\\"sched"}}]}\n\n',
          'data: {"model":"demo-model","choices":[{"index":0,"delta":{"content":"uling\\",\\"assistant_message\\":\\"Follow-up scheduled.\\""}}]}\n\n',
          'data: {"model":"demo-model","choices":[{"index":0,"delta":{"content":"}"},"finish_reason":"stop"}],"usage":{"prompt_tokens":18,"completion_tokens":7,"total_tokens":25}}\n\n',
          'data: [DONE]\n\n',
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await agentExecuteTurnTool(
      createTurnInput({
        stream: true,
      }),
      createExecutionContext(),
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      status: 'reply',
      intent: 'scheduling',
      assistant_message: 'Follow-up scheduled.',
      provider: {
        kind: 'openai_compatible',
        model: TEST_MODEL,
      },
      usage: {
        input_tokens: 18,
        output_tokens: 7,
        total_tokens: 25,
      },
      finish_reason: 'stop',
    });
    expect(result.metadata?.provider_call_count).toBe(1);
    expect(result.metadata?.response_mode).toBe('streaming');
    expect(result.metadata?.[TOOL_OUTPUT_METADATA_KEYS.PROGRESS_SNAPSHOTS]).toEqual([
      expect.objectContaining({ sequence: 0, state: 'partial' }),
      expect.objectContaining({ sequence: 1, state: 'partial' }),
      expect.objectContaining({ sequence: 2, state: 'final' }),
    ]);
  });

  it('enforces input byte limits before the provider is contacted', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    const result = await agentExecuteTurnTool(
      createTurnInput({
        messages: [{ role: 'user', content: '1234567890' }],
        limits: {
          max_input_bytes: 4,
        },
      }),
      createExecutionContext(),
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('LIMIT_EXCEEDED');
    expect(result.error?.message).toContain('max_input_bytes');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enforces turn-count limits from execution metadata', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    const result = await agentExecuteTurnTool(
      createTurnInput({
        limits: {
          max_turns_per_session: 2,
        },
      }),
      createExecutionContext({
        metadata: {
          agent_turn_index: 2,
        },
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('LIMIT_EXCEEDED');
    expect(result.error?.message).toContain('max_turns_per_session');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enforces tool-call limits from execution metadata', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    const result = await agentExecuteTurnTool(
      createTurnInput({
        limits: {
          max_tool_calls_per_session: 1,
        },
      }),
      createExecutionContext({
        metadata: {
          agent_tool_call_count: 1,
        },
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('LIMIT_EXCEEDED');
    expect(result.error?.message).toContain('max_tool_calls_per_session');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails with a normalized error when the provider response is malformed', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        model: TEST_MODEL,
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: '{"intent":42}',
            },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await agentExecuteTurnTool(createTurnInput(), createExecutionContext());

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PROVIDER_MALFORMED_RESPONSE');
    expect(result.metadata?.provider_call_count).toBe(1);
  });

  it('selects the configured provider adapter family from pack_config model profiles', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createMessagesCompatibleResponse({
        type: 'message',
        model: TEST_MESSAGES_MODEL,
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'reply',
              intent: 'scheduling',
              assistant_message: 'Messages-compatible provider completed the turn.',
            }),
          },
        ],
        usage: {
          input_tokens: 14,
          output_tokens: 6,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await agentExecuteTurnTool(
      createTurnInput({
        model_profile: 'messages-default',
      }),
      createExecutionContext({
        packConfig: {
          default_model: 'messages-default',
          models: {
            'messages-default': {
              provider: 'messages_compatible',
              model: TEST_MESSAGES_MODEL,
              api_key_env: 'MESSAGES_PROVIDER_API_KEY',
              base_url_env: 'MESSAGES_PROVIDER_BASE_URL',
            },
          },
        },
      }),
    );

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      TEST_URL,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: `Bearer ${TEST_MESSAGES_API_KEY}`,
        }),
      }),
    );
    expect(result.data).toEqual({
      status: 'reply',
      intent: 'scheduling',
      assistant_message: 'Messages-compatible provider completed the turn.',
      provider: {
        kind: 'messages_compatible',
        model: TEST_MESSAGES_MODEL,
      },
      usage: {
        input_tokens: 14,
        output_tokens: 6,
      },
      finish_reason: 'end_turn',
    });
  });

  it('runs the deterministic provider adapter conformance harness', async () => {
    const results = await runProviderAdapterConformanceHarness();

    expect(results).toEqual([
      expect.objectContaining({ scenario: 'success', passed: true }),
      expect.objectContaining({ scenario: 'tool_request_shaping', passed: true }),
      expect.objectContaining({
        scenario: 'malformed_response',
        passed: true,
        normalized_error: expect.objectContaining({
          code: 'PROVIDER_MALFORMED_RESPONSE',
        }),
      }),
      expect.objectContaining({
        scenario: 'normalized_error',
        passed: true,
        normalized_error: expect.objectContaining({
          code: 'PROVIDER_RATE_LIMITED',
        }),
      }),
    ]);
  });

  it('normalizes a messages-compatible provider against the shared turn contract', async () => {
    const result = await executeProviderTurn(
      {
        kind: 'messages_compatible',
        model: TEST_MESSAGES_MODEL,
        url: TEST_URL,
        apiKey: TEST_MESSAGES_API_KEY,
        messages: [{ role: 'user', content: 'Schedule a follow-up.' }],
        toolCatalog: [
          {
            name: 'calendar:create-event',
            description: 'Create a calendar event',
          },
        ],
        intentCatalog: [{ id: 'scheduling', description: 'Schedule work' }],
      },
      {
        transport: async () =>
          createMessagesCompatibleResponse({
            type: 'message',
            model: TEST_MESSAGES_MODEL,
            stop_reason: 'tool_use',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'tool_request',
                  intent: 'scheduling',
                  assistant_message: 'Creating the event now.',
                }),
              },
              {
                type: 'tool_use',
                name: 'calendar:create-event',
                input: {
                  title: 'Reminder',
                },
              },
            ],
            usage: {
              input_tokens: 12,
              output_tokens: 5,
            },
          }),
      },
    );

    expect(result).toEqual({
      ok: true,
      output: {
        status: 'tool_request',
        intent: 'scheduling',
        assistant_message: 'Creating the event now.',
        requested_tool: {
          name: 'calendar:create-event',
          input: {
            title: 'Reminder',
          },
        },
        provider: {
          kind: 'messages_compatible',
          model: TEST_MESSAGES_MODEL,
        },
        usage: {
          input_tokens: 12,
          output_tokens: 5,
        },
        finish_reason: 'tool_use',
      },
      metadata: {
        provider_kind: 'messages_compatible',
        request_url: TEST_URL,
        response_status: 200,
        response_mode: 'non_streaming',
      },
    });
  });
});
