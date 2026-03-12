// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { TOOL_ERROR_CODES, type ExecutionContext, type ToolOutput } from '@lumenflow/kernel';
import { describe, expect, it } from 'vitest';
import {
  createApprovalResolutionMessage,
  createHostContextMessages,
  runGovernedAgentLoop,
} from '../orchestration.js';
import { AGENT_RUNTIME_TOOL_NAMES } from '../types.js';

const BASE_CONTEXT: ExecutionContext = {
  run_id: 'run-agent-runtime-loop',
  task_id: 'task-agent-runtime-loop',
  session_id: 'session-agent-runtime-loop',
  allowed_scopes: [],
};

type ScriptedCall =
  | {
      name: string;
      assert?: (input: unknown, context: ExecutionContext) => void;
      output: ToolOutput;
    }
  | {
      name: string;
      assert?: (input: unknown, context: ExecutionContext) => void;
      output: (() => ToolOutput) | (() => Promise<ToolOutput>);
    };

class ScriptedRuntime {
  readonly calls: Array<{ name: string; input: unknown; context: ExecutionContext }> = [];

  constructor(private readonly script: ScriptedCall[]) {}

  async executeTool(name: string, input: unknown, context: ExecutionContext): Promise<ToolOutput> {
    const next = this.script.shift();
    if (!next) {
      throw new Error(`Unexpected executeTool call for "${name}"`);
    }
    expect(name).toBe(next.name);
    next.assert?.(input, context);
    this.calls.push({ name, input, context });
    return typeof next.output === 'function' ? await next.output() : next.output;
  }
}

function createToolOutput(
  status: 'reply' | 'tool_request',
  overrides?: Record<string, unknown>,
): ToolOutput {
  return {
    success: true,
    data: {
      status,
      intent: 'scheduling',
      assistant_message:
        status === 'tool_request'
          ? 'Attempting the requested action.'
          : 'I recovered and proposed the permitted scheduling action.',
      provider: {
        kind: 'openai_compatible',
        model: 'demo-model',
      },
      finish_reason: 'stop',
      ...(status === 'tool_request'
        ? {
            requested_tool: {
              name: 'email:send',
              input: {
                subject: 'Reminder',
              },
            },
          }
        : {}),
      ...overrides,
    },
  };
}

describe('agent-runtime orchestration loop', () => {
  it('recovers from a denied tool request by feeding the denial back into the next turn', async () => {
    const runtime = new ScriptedRuntime([
      {
        name: AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN,
        assert: (_input, context) => {
          expect(context.metadata?.agent_turn_index).toBe(0);
          expect(context.metadata?.agent_tool_call_count).toBe(0);
        },
        output: createToolOutput('tool_request'),
      },
      {
        name: 'email:send',
        assert: (_input, context) => {
          expect(context.metadata?.agent_intent).toBe('scheduling');
          expect(context.metadata?.agent_turn_index).toBe(0);
          expect(context.metadata?.agent_tool_call_count).toBe(0);
        },
        output: {
          success: false,
          error: {
            code: TOOL_ERROR_CODES.POLICY_DENIED,
            message: 'The classified intent does not permit email:send.',
          },
        },
      },
      {
        name: AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN,
        assert: (input, context) => {
          expect(context.metadata?.agent_turn_index).toBe(1);
          expect(context.metadata?.agent_tool_call_count).toBe(1);
          const messages = Array.isArray((input as { messages?: unknown[] }).messages)
            ? (input as { messages: Array<Record<string, unknown>> }).messages
            : [];
          expect(messages.at(-1)).toMatchObject({
            role: 'tool',
            tool_name: 'email:send',
            content: expect.stringContaining(TOOL_ERROR_CODES.POLICY_DENIED),
          });
        },
        output: createToolOutput('reply'),
      },
    ]);

    const result = await runGovernedAgentLoop({
      runtime,
      executeTurnInput: {
        session_id: BASE_CONTEXT.session_id,
        model_profile: 'demo-model',
        url: 'https://model-provider.invalid/',
        messages: [{ role: 'user', content: 'Plan the follow-up.' }],
      },
      createContext: (metadata) => ({
        ...BASE_CONTEXT,
        metadata,
      }),
    });

    expect(result.kind).toBe('completed');
    if (result.kind !== 'completed') {
      return;
    }

    expect(result.turn_count).toBe(2);
    expect(result.tool_call_count).toBe(1);
    expect(result.final_turn.status).toBe('reply');
    expect(result.history).toHaveLength(2);
    expect(result.history[0]).toMatchObject({
      tool_call_id: 'agent-runtime-tool-call-1',
      tool_output: {
        success: false,
        error: {
          code: TOOL_ERROR_CODES.POLICY_DENIED,
        },
      },
    });
  });

  it('pauses the loop when a tool execution requires approval', async () => {
    const runtime = new ScriptedRuntime([
      {
        name: AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN,
        output: {
          success: true,
          data: {
            status: 'tool_request',
            intent: 'scheduling',
            assistant_message: 'Creating the event now.',
            requested_tool: {
              name: 'calendar:create-event',
              input: {
                title: 'Follow up',
              },
            },
            provider: {
              kind: 'openai_compatible',
              model: 'demo-model',
            },
            finish_reason: 'tool_calls',
          },
        },
      },
      {
        name: 'calendar:create-event',
        output: {
          success: false,
          error: {
            code: TOOL_ERROR_CODES.APPROVAL_REQUIRED,
            message: 'Approval required.',
            details: {
              request_id: 'approval-123',
            },
          },
        },
      },
    ]);

    const result = await runGovernedAgentLoop({
      runtime,
      executeTurnInput: {
        session_id: BASE_CONTEXT.session_id,
        model_profile: 'demo-model',
        url: 'https://model-provider.invalid/',
        messages: [{ role: 'user', content: 'Create the event.' }],
      },
      createContext: (metadata) => ({
        ...BASE_CONTEXT,
        metadata,
      }),
    });

    expect(result).toMatchObject({
      kind: 'approval_required',
      pending_request_id: 'approval-123',
      turn_count: 1,
      tool_call_count: 1,
    });
  });

  it('builds host context and approval resolution messages without pack-specific coupling', () => {
    expect(
      createHostContextMessages({
        task_summary: 'Reschedule the weekly review.',
        memory_summary: 'The reviewer prefers mornings.',
        additional_context: ['Do not send external mail.'],
      }),
    ).toEqual([
      {
        role: 'system',
        content: 'Task context:\nReschedule the weekly review.',
      },
      {
        role: 'system',
        content: 'Memory context:\nThe reviewer prefers mornings.',
      },
      {
        role: 'system',
        content: 'Additional context:\nDo not send external mail.',
      },
    ]);

    expect(
      createApprovalResolutionMessage({
        requestId: 'approval-123',
        approved: true,
        approvedBy: 'tom@hellm.ai',
        toolName: 'calendar:create-event',
        reason: 'Customer approved the invite.',
      }),
    ).toEqual({
      role: 'tool',
      tool_name: 'calendar:create-event',
      tool_call_id: 'approval-123',
      content: JSON.stringify({
        approval: {
          request_id: 'approval-123',
          approved: true,
          approved_by: 'tom@hellm.ai',
          reason: 'Customer approved the invite.',
        },
      }),
    });
  });
});
