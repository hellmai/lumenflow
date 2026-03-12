// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ExecutionContext, type ToolOutput, TOOL_ERROR_CODES } from '@lumenflow/kernel';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS,
  AGENT_RUNTIME_WORKFLOW_STATUSES,
  createAgentRuntimeWorkflowStateStore,
  createApprovalResolutionMessage,
  resumeGovernedAgentSession,
  startGovernedAgentSession,
} from '../orchestration.js';
import { AGENT_RUNTIME_TOOL_NAMES } from '../types.js';

const BASE_CONTEXT: ExecutionContext = {
  run_id: 'run-agent-runtime-resume',
  task_id: 'task-agent-runtime-resume',
  session_id: 'session-agent-runtime-resume',
  allowed_scopes: [],
};

type ScriptedCall = {
  name: string;
  assert?: (input: unknown, context: ExecutionContext) => void;
  output: ToolOutput;
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
    return next.output;
  }
}

describe('agent-runtime suspend and resume', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'lf-agent-runtime-resume-'));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('suspends a linear session after the invocation turn budget and resumes with preserved metadata', async () => {
    const runtime = new ScriptedRuntime([
      {
        name: AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN,
        assert: (_input, context) => {
          expect(context.task_id).toBe(BASE_CONTEXT.task_id);
          expect(context.metadata?.agent_turn_index).toBe(0);
          expect(context.metadata?.agent_tool_call_count).toBe(0);
        },
        output: {
          success: true,
          data: {
            status: 'tool_request',
            intent: 'scheduling',
            assistant_message: 'Creating the event.',
            requested_tool: {
              name: 'calendar:create-event',
              input: { title: 'Weekly review' },
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
        assert: (_input, context) => {
          expect(context.task_id).toBe(BASE_CONTEXT.task_id);
          expect(context.metadata?.agent_intent).toBe('scheduling');
          expect(context.metadata?.agent_turn_index).toBe(0);
          expect(context.metadata?.agent_tool_call_count).toBe(0);
        },
        output: {
          success: true,
          data: { id: 'event-1' },
        },
      },
      {
        name: AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN,
        assert: (input, context) => {
          expect(context.task_id).toBe(BASE_CONTEXT.task_id);
          expect(context.metadata?.agent_turn_index).toBe(1);
          expect(context.metadata?.agent_tool_call_count).toBe(1);
          const messages = (input as { messages: Array<Record<string, unknown>> }).messages;
          expect(messages.at(-1)).toMatchObject({
            role: 'tool',
            tool_name: 'calendar:create-event',
          });
        },
        output: {
          success: true,
          data: {
            status: 'reply',
            intent: 'scheduling',
            assistant_message: 'The weekly review is scheduled.',
            provider: {
              kind: 'openai_compatible',
              model: 'demo-model',
            },
            finish_reason: 'stop',
          },
        },
      },
    ]);

    const suspended = await startGovernedAgentSession({
      runtime,
      storageRoot: tempRoot,
      maxTurnsPerInvocation: 1,
      executeTurnInput: {
        session_id: BASE_CONTEXT.session_id,
        model_profile: 'default',
        url: 'https://model-provider.invalid/',
        messages: [{ role: 'user', content: 'Schedule the weekly review.' }],
      },
      createContext: (metadata) => ({
        ...BASE_CONTEXT,
        metadata,
      }),
    });

    expect(suspended.kind).toBe('suspended');

    const store = createAgentRuntimeWorkflowStateStore({ workspaceRoot: tempRoot });
    const suspendedState = await store.load(BASE_CONTEXT.session_id);
    expect(suspendedState).toMatchObject({
      status: AGENT_RUNTIME_WORKFLOW_STATUSES.SUSPENDED,
      turn_count: 1,
      tool_call_count: 1,
      task_id: BASE_CONTEXT.task_id,
      run_id: BASE_CONTEXT.run_id,
      continuations: [
        expect.objectContaining({
          kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.CREATED,
        }),
        expect.objectContaining({
          kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.SUSPENDED,
        }),
      ],
    });

    const resumed = await resumeGovernedAgentSession({
      runtime,
      storageRoot: tempRoot,
      sessionId: BASE_CONTEXT.session_id,
      createContext: (metadata) => ({
        ...BASE_CONTEXT,
        metadata,
      }),
    });

    expect(resumed.kind).toBe('completed');

    const completedState = await store.load(BASE_CONTEXT.session_id);
    expect(completedState).toMatchObject({
      status: AGENT_RUNTIME_WORKFLOW_STATUSES.COMPLETED,
      turn_count: 2,
      tool_call_count: 1,
    });
  });

  it('persists approval pauses and resumes with an approval continuation message', async () => {
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
              input: { title: 'Follow-up' },
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
      {
        name: AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN,
        assert: (input, context) => {
          expect(context.metadata?.agent_turn_index).toBe(1);
          expect(context.metadata?.agent_tool_call_count).toBe(1);
          const messages = (input as { messages: Array<Record<string, unknown>> }).messages;
          expect(messages.at(-1)).toMatchObject({
            role: 'tool',
            tool_call_id: 'approval-123',
            tool_name: 'calendar:create-event',
          });
        },
        output: {
          success: true,
          data: {
            status: 'reply',
            intent: 'scheduling',
            assistant_message: 'The follow-up event is ready after approval.',
            provider: {
              kind: 'openai_compatible',
              model: 'demo-model',
            },
            finish_reason: 'stop',
          },
        },
      },
    ]);

    const paused = await startGovernedAgentSession({
      runtime,
      storageRoot: tempRoot,
      executeTurnInput: {
        session_id: BASE_CONTEXT.session_id,
        model_profile: 'default',
        url: 'https://model-provider.invalid/',
        messages: [{ role: 'user', content: 'Create the follow-up event.' }],
      },
      createContext: (metadata) => ({
        ...BASE_CONTEXT,
        metadata,
      }),
    });

    expect(paused).toMatchObject({
      kind: 'approval_required',
      pending_request_id: 'approval-123',
    });

    const resumed = await resumeGovernedAgentSession({
      runtime,
      storageRoot: tempRoot,
      sessionId: BASE_CONTEXT.session_id,
      continuationMessages: [
        createApprovalResolutionMessage({
          requestId: 'approval-123',
          approved: true,
          approvedBy: 'tom@hellm.ai',
          toolName: 'calendar:create-event',
        }),
      ],
      createContext: (metadata) => ({
        ...BASE_CONTEXT,
        metadata,
      }),
    });

    expect(resumed.kind).toBe('completed');

    const store = createAgentRuntimeWorkflowStateStore({ workspaceRoot: tempRoot });
    const completedState = await store.load(BASE_CONTEXT.session_id);
    expect(completedState?.status).toBe(AGENT_RUNTIME_WORKFLOW_STATUSES.COMPLETED);
    expect(completedState?.pending_request_id).toBeUndefined();
    expect(completedState?.continuations).toEqual([
      expect.objectContaining({
        kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.CREATED,
      }),
      expect.objectContaining({
        kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.APPROVAL_REQUIRED,
        request_id: 'approval-123',
      }),
      expect.objectContaining({
        kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.RESUMED,
      }),
      expect.objectContaining({
        kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.COMPLETED,
      }),
    ]);
  });
});
