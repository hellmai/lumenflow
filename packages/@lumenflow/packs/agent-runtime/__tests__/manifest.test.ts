// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AGENT_RUNTIME_CONFIG_KEY, AGENT_RUNTIME_PACK_ID, AGENT_RUNTIME_PACK_VERSION } from '../constants.js';
import {
  AGENT_RUNTIME_MANIFEST,
  AGENT_RUNTIME_MANIFEST_TOOL_NAMES,
  getAgentRuntimeManifestToolByName,
} from '../manifest.js';

const PACK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('agent-runtime manifest scaffold', () => {
  it('declares the expected pack identity and task type boundary', () => {
    expect(AGENT_RUNTIME_MANIFEST.id).toBe(AGENT_RUNTIME_PACK_ID);
    expect(AGENT_RUNTIME_MANIFEST.version).toBe(AGENT_RUNTIME_PACK_VERSION);
    expect(AGENT_RUNTIME_MANIFEST.config_key).toBe(AGENT_RUNTIME_CONFIG_KEY);
    expect(AGENT_RUNTIME_MANIFEST.task_types).toEqual(['agent-session']);
  });

  it('declares the single execute-turn scaffold tool', () => {
    expect(AGENT_RUNTIME_MANIFEST_TOOL_NAMES).toEqual(['agent:execute-turn']);

    const tool = getAgentRuntimeManifestToolByName('agent:execute-turn');
    expect(tool?.permission).toBe('write');
    expect(tool?.required_env).toEqual(['AGENT_RUNTIME_API_KEY', 'AGENT_RUNTIME_BASE_URL']);
    expect(tool?.input_schema).toMatchObject({
      properties: {
        url: {
          enum: ['https://model-provider.invalid/'],
        },
      },
      required: expect.arrayContaining(['url']),
    });
    expect(
      tool?.required_scopes.some(
        (scope) =>
          scope.type === 'network' &&
          scope.posture === 'allowlist' &&
          Array.isArray(scope.allowlist_entries) &&
          scope.allowlist_entries.includes('model-provider.invalid:443'),
      ),
    ).toBe(true);
  });

  it('keeps manifest.yaml aligned with the programmatic manifest entries', async () => {
    const manifestPath = path.join(PACK_ROOT, 'manifest.yaml');
    const manifestRaw = await readFile(manifestPath, 'utf8');

    expect(manifestRaw).toContain('id: agent-runtime');
    expect(manifestRaw).toContain('config_key: agent_runtime');
    expect(manifestRaw).toContain('entry: tool-impl/agent-turn-tools.ts#agentExecuteTurnTool');
    expect(manifestRaw).toContain('model-provider.invalid:443');
    expect(manifestRaw).toContain('https://model-provider.invalid/');
  });
});
