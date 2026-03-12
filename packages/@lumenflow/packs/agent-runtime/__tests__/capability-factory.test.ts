// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { createAgentRuntimeCapabilityFactory } from '../capability-factory.js';
import { AGENT_RUNTIME_TOOL_NAMES } from '../types.js';

const ORIGINAL_PROVIDER_URL = process.env.PROVIDER_BASE_URL;

describe('agent-runtime capability factory', () => {
  afterEach(() => {
    if (ORIGINAL_PROVIDER_URL === undefined) {
      delete process.env.PROVIDER_BASE_URL;
    } else {
      process.env.PROVIDER_BASE_URL = ORIGINAL_PROVIDER_URL;
    }
  });

  it('derives required_env and provider hosts from configured model profiles', async () => {
    process.env.PROVIDER_BASE_URL = 'https://provider.example.com/v1';

    const augmentation = await createAgentRuntimeCapabilityFactory({
      workspaceRoot: '/workspace',
      packId: 'agent-runtime',
      packRoot: '/pack',
      tool: {
        name: AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN,
        entry: 'tool-impl/agent-turn-tools.ts#agentExecuteTurnTool',
        permission: 'write',
        required_scopes: [{ type: 'path', pattern: '.agent-runtime/**', access: 'read' }],
      },
      packConfig: {
        default_model: 'default',
        models: {
          default: {
            provider: 'openai_compatible',
            model: 'demo-model',
            api_key_env: 'MODEL_API_KEY',
            base_url_env: 'PROVIDER_BASE_URL',
          },
        },
      },
    });

    expect(augmentation.required_env).toEqual(['MODEL_API_KEY', 'PROVIDER_BASE_URL']);
    expect(augmentation.required_scopes).toEqual([
      {
        type: 'network',
        posture: 'allowlist',
        allowlist_entries: ['provider.example.com:443'],
      },
    ]);
  });

  it('returns an empty augmentation for non execute-turn tools', async () => {
    const augmentation = await createAgentRuntimeCapabilityFactory({
      workspaceRoot: '/workspace',
      packId: 'agent-runtime',
      packRoot: '/pack',
      tool: {
        name: 'agent:other-tool',
        entry: 'tool-impl/other-tool.ts#otherTool',
        permission: 'write',
        required_scopes: [{ type: 'path', pattern: '.agent-runtime/**', access: 'read' }],
      },
      packConfig: {
        default_model: 'default',
        models: {},
      },
    });

    expect(augmentation).toEqual({});
  });
});
