// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { POLICY_TRIGGERS, PolicyEngine } from '@lumenflow/kernel';
import { describe, expect, it } from 'vitest';
import { AGENT_RUNTIME_PACK_ID } from '../constants.js';
import { createAgentRuntimePolicyFactory } from '../policy-factory.js';

function createPolicyEngine(rules: Awaited<ReturnType<typeof createAgentRuntimePolicyFactory>>) {
  return new PolicyEngine({
    layers: [
      {
        level: 'workspace',
        default_decision: 'allow',
        allow_loosening: true,
        rules: [],
      },
      { level: 'lane', rules: [] },
      { level: 'pack', rules },
      { level: 'task', rules: [] },
    ],
  });
}

function createEvaluationContext(toolName: string, executionMetadata?: Record<string, unknown>) {
  return {
    trigger: POLICY_TRIGGERS.ON_TOOL_REQUEST,
    run_id: 'run-agent-runtime-policy',
    task_id: 'task-agent-runtime-policy',
    tool_name: toolName,
    pack_id: 'fixture-pack',
    execution_metadata: executionMetadata,
  } as const;
}

describe('agent-runtime policy factory', () => {
  it('returns no policy rules when no intent config exists', async () => {
    const rules = await createAgentRuntimePolicyFactory({
      workspaceRoot: '/workspace',
      packId: AGENT_RUNTIME_PACK_ID,
      packRoot: '/pack',
      packConfig: {
        default_model: 'default',
        models: {},
      },
    });

    expect(rules).toEqual([]);
  });

  it('denies tools outside the configured intent allowlist while exempting agent:execute-turn', async () => {
    const rules = await createAgentRuntimePolicyFactory({
      workspaceRoot: '/workspace',
      packId: AGENT_RUNTIME_PACK_ID,
      packRoot: '/pack',
      packConfig: {
        default_model: 'default',
        models: {
          default: {
            provider: 'openai_compatible',
            model: 'demo',
            api_key_env: 'AGENT_RUNTIME_API_KEY',
          },
        },
        intents: {
          scheduling: {
            description: 'Schedule work',
            allow_tools: ['calendar:create-event'],
          },
        },
      },
    });

    const engine = createPolicyEngine(rules);

    const denied = await engine.evaluate(
      createEvaluationContext('email:send', {
        agent_intent: 'scheduling',
      }),
    );
    const allowed = await engine.evaluate(
      createEvaluationContext('calendar:create-event', {
        agent_intent: 'scheduling',
      }),
    );
    const exempt = await engine.evaluate(
      createEvaluationContext('agent:execute-turn', {
        agent_intent: 'scheduling',
      }),
    );

    expect(denied.decision).toBe('deny');
    expect(allowed.decision).toBe('allow');
    expect(exempt.decision).toBe('allow');
  });

  it('returns approval_required for tools that must pause for human review', async () => {
    const rules = await createAgentRuntimePolicyFactory({
      workspaceRoot: '/workspace',
      packId: AGENT_RUNTIME_PACK_ID,
      packRoot: '/pack',
      packConfig: {
        default_model: 'default',
        models: {
          default: {
            provider: 'openai_compatible',
            model: 'demo',
            api_key_env: 'AGENT_RUNTIME_API_KEY',
          },
        },
        intents: {
          scheduling: {
            description: 'Schedule work',
            allow_tools: ['calendar:create-event'],
            approval_required_tools: ['calendar:create-event'],
          },
        },
      },
    });

    const engine = createPolicyEngine(rules);
    const result = await engine.evaluate(
      createEvaluationContext('calendar:create-event', {
        agent_intent: 'scheduling',
      }),
    );

    expect(result.decision).toBe('approval_required');
  });
});
