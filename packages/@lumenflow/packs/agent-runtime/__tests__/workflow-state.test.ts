// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS,
  AGENT_RUNTIME_WORKFLOW_STATUSES,
  createAgentRuntimeWorkflowStateStore,
  type AgentRuntimeWorkflowState,
} from '../orchestration.js';

describe('agent-runtime workflow state store', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'lf-agent-runtime-workflow-'));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('persists workflow state under scoped agent-runtime storage and restores it', async () => {
    const store = createAgentRuntimeWorkflowStateStore({
      workspaceRoot: tempRoot,
      now: () => '2026-03-12T16:30:00.000Z',
    });

    const expectedState: AgentRuntimeWorkflowState = {
      schema_version: 1,
      session_id: 'session-agent-runtime-1',
      task_id: 'task-agent-runtime-1',
      run_id: 'run-agent-runtime-1',
      status: AGENT_RUNTIME_WORKFLOW_STATUSES.SUSPENDED,
      created_at: '2026-03-12T16:30:00.000Z',
      updated_at: '2026-03-12T16:30:00.000Z',
      execute_turn_input: {
        session_id: 'session-agent-runtime-1',
        model_profile: 'default',
        url: 'https://model-provider.invalid/',
        messages: [],
        tool_catalog: [
          {
            name: 'calendar:create-event',
            description: 'Create a calendar event',
          },
        ],
      },
      messages: [
        {
          role: 'user',
          content: 'Schedule the review.',
        },
      ],
      history: [],
      turn_count: 1,
      tool_call_count: 0,
      continuations: [
        {
          sequence: 0,
          kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.CREATED,
          timestamp: '2026-03-12T16:30:00.000Z',
        },
        {
          sequence: 1,
          kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.SUSPENDED,
          timestamp: '2026-03-12T16:30:00.000Z',
          reason: 'Invocation turn budget reached.',
        },
      ],
    };

    await store.save(expectedState);

    const persisted = JSON.parse(
      await readFile(
        join(tempRoot, '.agent-runtime', 'workflow', 'session-agent-runtime-1.json'),
        'utf8',
      ),
    ) as AgentRuntimeWorkflowState;

    expect(persisted).toEqual(expectedState);
    await expect(store.load('session-agent-runtime-1')).resolves.toEqual(expectedState);
  });
});
