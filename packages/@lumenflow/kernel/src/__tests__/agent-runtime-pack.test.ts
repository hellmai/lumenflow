// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { AGENT_RUNTIME_PACK_ID } from '../../../packs/agent-runtime/constants.js';
import { AGENT_RUNTIME_MANIFEST } from '../../../packs/agent-runtime/manifest.js';
import { WorkspaceSpecSchema } from '../kernel.schemas.js';
import {
  DomainPackManifestSchema,
  PackLoader,
  computeDeterministicPackHash,
} from '../pack/index.js';

const PACK_TEST_DIR = dirname(fileURLToPath(import.meta.url));

function createWorkspaceSpec(integrity: string) {
  return WorkspaceSpecSchema.parse({
    id: 'workspace-agent-runtime',
    name: 'Agent Runtime Workspace',
    packs: [
      {
        id: AGENT_RUNTIME_PACK_ID,
        version: '0.1.0',
        integrity,
        source: 'local',
      },
    ],
    lanes: [
      {
        id: 'framework-core',
        title: 'Framework Core',
        allowed_scopes: [{ type: 'path', pattern: '**', access: 'write' }],
      },
    ],
    security: {
      allowed_scopes: [{ type: 'path', pattern: '**', access: 'write' }],
      network_default: 'off',
      deny_overlays: ['.env'],
    },
    memory_namespace: 'mem',
    event_namespace: 'evt',
  });
}

describe('agent-runtime pack scaffold', () => {
  it('keeps manifest.yaml and the programmatic manifest in sync', async () => {
    const manifestPath = resolve(
      PACK_TEST_DIR,
      '..',
      '..',
      '..',
      'packs',
      'agent-runtime',
      'manifest.yaml',
    );
    const manifestRaw = await readFile(manifestPath, 'utf8');
    const manifest = DomainPackManifestSchema.parse(YAML.parse(manifestRaw));

    expect(AGENT_RUNTIME_MANIFEST).toEqual(manifest);
    expect(manifest.task_types).toEqual(['agent-session']);
    expect(manifest.config_key).toBe('agent_runtime');

    const executeTurnTool = manifest.tools.find((tool) => tool.name === 'agent:execute-turn');
    expect(executeTurnTool?.permission).toBe('write');
    expect(executeTurnTool?.input_schema).toMatchObject({
      properties: {
        url: {
          enum: ['https://model-provider.invalid/'],
        },
      },
      required: expect.arrayContaining(['url']),
    });
    expect(
      executeTurnTool?.required_scopes.some(
        (scope) =>
          scope.type === 'network' &&
          scope.posture === 'allowlist' &&
          Array.isArray(scope.allowlist_entries) &&
          scope.allowlist_entries.length > 0,
      ),
    ).toBe(true);
  });

  it('loads the pack when the workspace pin uses the computed sha256 integrity', async () => {
    const packsRoot = resolve(PACK_TEST_DIR, '..', '..', '..', 'packs');
    const packRoot = join(packsRoot, 'agent-runtime');
    const computedHash = await computeDeterministicPackHash({ packRoot });
    const loader = new PackLoader({ packsRoot });

    const loaded = await loader.load({
      workspaceSpec: createWorkspaceSpec(`sha256:${computedHash}`),
      packId: AGENT_RUNTIME_PACK_ID,
    });

    expect(loaded.manifest.id).toBe(AGENT_RUNTIME_PACK_ID);
    expect(loaded.manifest.task_types).toEqual(['agent-session']);
    expect(loaded.integrity).toBe(computedHash);
  });
});
