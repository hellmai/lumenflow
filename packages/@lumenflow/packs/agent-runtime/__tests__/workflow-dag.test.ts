// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutionContext, ToolOutput } from '@lumenflow/kernel';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS,
  AGENT_RUNTIME_WORKFLOW_NODE_STATUSES,
  AGENT_RUNTIME_WORKFLOW_STATUSES,
  createAgentRuntimeWorkflowStateStore,
  resumeGovernedAgentWorkflow,
  startGovernedAgentWorkflow,
} from '../orchestration.js';
import { AGENT_RUNTIME_TOOL_NAMES } from '../types.js';

const BASE_CONTEXT: ExecutionContext = {
  run_id: 'run-agent-runtime-workflow',
  task_id: 'task-agent-runtime-workflow',
  session_id: 'session-agent-runtime-workflow',
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

describe('agent-runtime workflow DAG orchestration', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'lf-agent-runtime-workflow-dag-'));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('executes ready branches, waits for the join, and completes in the same agent-session context', async () => {
    const runtime = new ScriptedRuntime([
      {
        name: AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN,
        assert: (_input, context) => {
          expect(context.task_id).toBe(BASE_CONTEXT.task_id);
          expect(context.run_id).toBe(BASE_CONTEXT.run_id);
          expect(context.session_id).toBe(BASE_CONTEXT.session_id);
          expect(context.metadata?.agent_workflow_node_id).toBe('branch-a');
        },
        output: replyOutput('Branch A completed.'),
      },
      {
        name: AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN,
        assert: (_input, context) => {
          expect(context.metadata?.agent_workflow_node_id).toBe('branch-b');
          expect(context.task_id).toBe(BASE_CONTEXT.task_id);
        },
        output: toolRequestOutput('calendar:create-event', { title: 'Branch B task' }),
      },
      {
        name: 'calendar:create-event',
        assert: (_input, context) => {
          expect(context.metadata?.agent_workflow_node_id).toBe('branch-b');
          expect(context.metadata?.agent_intent).toBe('scheduling');
        },
        output: {
          success: true,
          data: { id: 'event-1' },
        },
      },
      {
        name: AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN,
        assert: (input, context) => {
          expect(context.metadata?.agent_workflow_node_id).toBe('branch-b');
          const messages = (input as { messages: Array<Record<string, unknown>> }).messages;
          expect(messages.at(-1)).toMatchObject({
            role: 'tool',
            tool_name: 'calendar:create-event',
          });
        },
        output: replyOutput('Branch B completed.'),
      },
      {
        name: AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN,
        assert: (_input, context) => {
          expect(context.metadata?.agent_workflow_node_id).toBe('join');
          expect(context.task_id).toBe(BASE_CONTEXT.task_id);
        },
        output: replyOutput('Join node completed.'),
      },
    ]);

    const result = await startGovernedAgentWorkflow({
      runtime,
      storageRoot: tempRoot,
      workflow: {
        session_id: BASE_CONTEXT.session_id,
        nodes: [
          createWorkflowNode('branch-a', 'Execute branch A'),
          createWorkflowNode('branch-b', 'Execute branch B'),
          createWorkflowNode('join', 'Summarize both branches', ['branch-a', 'branch-b']),
        ],
      },
      createContext: (metadata) => ({
        ...BASE_CONTEXT,
        metadata,
      }),
    });

    expect(result).toMatchObject({
      kind: 'completed',
      completed_node_ids: ['branch-a', 'branch-b', 'join'],
    });

    const store = createAgentRuntimeWorkflowStateStore({ workspaceRoot: tempRoot });
    const persisted = await store.load(BASE_CONTEXT.session_id);

    expect(persisted).toMatchObject({
      status: AGENT_RUNTIME_WORKFLOW_STATUSES.COMPLETED,
      workflow: {
        nodes: [
          expect.objectContaining({
            node_id: 'branch-a',
            status: AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.COMPLETED,
          }),
          expect.objectContaining({
            node_id: 'branch-b',
            status: AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.COMPLETED,
          }),
          expect.objectContaining({
            node_id: 'join',
            status: AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.COMPLETED,
          }),
        ],
      },
      continuations: expect.arrayContaining([
        expect.objectContaining({
          kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.BRANCH_COMPLETED,
          node_id: 'branch-a',
        }),
        expect.objectContaining({
          kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.BRANCH_COMPLETED,
          node_id: 'branch-b',
        }),
        expect.objectContaining({
          kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.JOIN_READY,
          node_id: 'join',
        }),
        expect.objectContaining({
          kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.COMPLETED,
        }),
      ]),
    });
  });

  it('parks future routine nodes until their wake time and resumes them without creating a new execution class', async () => {
    const runtime = new ScriptedRuntime([
      {
        name: AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN,
        assert: (_input, context) => {
          expect(context.metadata?.agent_workflow_node_id).toBe('seed');
        },
        output: replyOutput('Seed step done.'),
      },
      {
        name: AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN,
        assert: (_input, context) => {
          expect(context.metadata?.agent_workflow_node_id).toBe('scheduled-follow-up');
          expect(context.task_id).toBe(BASE_CONTEXT.task_id);
          expect(context.run_id).toBe(BASE_CONTEXT.run_id);
        },
        output: replyOutput('Scheduled follow-up done.'),
      },
    ]);

    const initial = await startGovernedAgentWorkflow({
      runtime,
      storageRoot: tempRoot,
      now: () => '2026-03-12T08:00:00.000Z',
      workflow: {
        session_id: BASE_CONTEXT.session_id,
        nodes: [
          createWorkflowNode('seed', 'Initial routine step'),
          createWorkflowNode(
            'scheduled-follow-up',
            'Run after the wake time',
            ['seed'],
            '2026-03-12T09:00:00.000Z',
          ),
        ],
      },
      createContext: (metadata) => ({
        ...BASE_CONTEXT,
        metadata,
      }),
    });

    expect(initial).toMatchObject({
      kind: 'scheduled',
      next_wake_at: '2026-03-12T09:00:00.000Z',
    });

    const resumed = await resumeGovernedAgentWorkflow({
      runtime,
      storageRoot: tempRoot,
      sessionId: BASE_CONTEXT.session_id,
      now: () => '2026-03-12T09:00:00.000Z',
      createContext: (metadata) => ({
        ...BASE_CONTEXT,
        metadata,
      }),
    });

    expect(resumed).toMatchObject({
      kind: 'completed',
      completed_node_ids: ['seed', 'scheduled-follow-up'],
    });

    const store = createAgentRuntimeWorkflowStateStore({ workspaceRoot: tempRoot });
    const persisted = await store.load(BASE_CONTEXT.session_id);

    expect(persisted).toMatchObject({
      status: AGENT_RUNTIME_WORKFLOW_STATUSES.COMPLETED,
      workflow: {
        nodes: [
          expect.objectContaining({
            node_id: 'seed',
            status: AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.COMPLETED,
          }),
          expect.objectContaining({
            node_id: 'scheduled-follow-up',
            status: AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.COMPLETED,
            wake_at: '2026-03-12T09:00:00.000Z',
          }),
        ],
      },
      continuations: expect.arrayContaining([
        expect.objectContaining({
          kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.SCHEDULED,
          node_id: 'scheduled-follow-up',
        }),
        expect.objectContaining({
          kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.WAKEUP,
          node_id: 'scheduled-follow-up',
        }),
      ]),
    });
  });
});

function createWorkflowNode(
  id: string,
  content: string,
  dependsOn: string[] = [],
  wakeAt?: string,
): Record<string, unknown> {
  return {
    id,
    execute_turn_input: {
      session_id: BASE_CONTEXT.session_id,
      model_profile: 'default',
      url: 'https://model-provider.invalid/',
      messages: [{ role: 'user', content }],
    },
    ...(dependsOn.length > 0 ? { depends_on: dependsOn } : {}),
    ...(wakeAt ? { wake_at: wakeAt } : {}),
  };
}

function replyOutput(message: string): ToolOutput {
  return {
    success: true,
    data: {
      status: 'reply',
      intent: 'scheduling',
      assistant_message: message,
      provider: {
        kind: 'openai_compatible',
        model: 'demo-model',
      },
      finish_reason: 'stop',
    },
  };
}

function toolRequestOutput(toolName: string, input: Record<string, unknown>): ToolOutput {
  return {
    success: true,
    data: {
      status: 'tool_request',
      intent: 'scheduling',
      assistant_message: `Requesting ${toolName}.`,
      requested_tool: {
        name: toolName,
        input,
      },
      provider: {
        kind: 'openai_compatible',
        model: 'demo-model',
      },
      finish_reason: 'tool_calls',
    },
  };
}
