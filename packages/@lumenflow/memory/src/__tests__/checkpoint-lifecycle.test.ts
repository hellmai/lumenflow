// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Checkpoint lifecycle integration tests.
 *
 * Tests the full create -> persist -> load cycle for checkpoints,
 * verifying they survive as memory nodes and can be queried back.
 *
 * Complements __tests__/mem-checkpoint-core.test.ts which focuses on
 * validation and SRP boundary (no wu-events writes).
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCheckpoint } from '../mem-checkpoint-core.js';
import { loadMemory } from '../memory-store.js';

describe('checkpoint lifecycle (create -> persist -> load)', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempRoots.length = 0;
  });

  async function makeTempDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ckpt-lifecycle-'));
    tempRoots.push(dir);
    return dir;
  }

  it('creates a checkpoint that can be loaded back from memory store', async () => {
    const baseDir = await makeTempDir();
    const result = await createCheckpoint(baseDir, {
      note: 'integration lifecycle test',
      wuId: 'WU-100',
    });
    expect(result.success).toBe(true);

    const memoryDir = path.join(baseDir, '.lumenflow', 'memory');
    const memory = await loadMemory(memoryDir);
    expect(memory.nodes).toHaveLength(1);
    expect(memory.nodes[0]?.type).toBe('checkpoint');
    expect(memory.nodes[0]?.content).toContain('integration lifecycle test');
    expect(memory.nodes[0]?.wu_id).toBe('WU-100');
  });

  it('multiple checkpoints are preserved in order', async () => {
    const baseDir = await makeTempDir();

    await createCheckpoint(baseDir, { note: 'first checkpoint' });
    await createCheckpoint(baseDir, { note: 'second checkpoint' });
    await createCheckpoint(baseDir, { note: 'third checkpoint' });

    const memoryDir = path.join(baseDir, '.lumenflow', 'memory');
    const memory = await loadMemory(memoryDir);
    expect(memory.nodes).toHaveLength(3);
    expect(memory.nodes[0]?.content).toContain('first');
    expect(memory.nodes[1]?.content).toContain('second');
    expect(memory.nodes[2]?.content).toContain('third');
  });

  it('checkpoint with WU ID is queryable via byWu index', async () => {
    const baseDir = await makeTempDir();

    await createCheckpoint(baseDir, { note: 'wu checkpoint', wuId: 'WU-200' });
    await createCheckpoint(baseDir, { note: 'no wu checkpoint' });

    const memoryDir = path.join(baseDir, '.lumenflow', 'memory');
    const memory = await loadMemory(memoryDir);
    const wuNodes = memory.byWu.get('WU-200') ?? [];
    expect(wuNodes).toHaveLength(1);
    expect(wuNodes[0]?.content).toContain('wu checkpoint');
  });

  it('checkpoint without optional metadata omits metadata field', async () => {
    const baseDir = await makeTempDir();
    const result = await createCheckpoint(baseDir, { note: 'minimal' });

    expect(result.checkpoint.metadata).toBeUndefined();
    expect(result.checkpoint.wu_id).toBeUndefined();
    expect(result.checkpoint.session_id).toBeUndefined();
  });

  it('checkpoint with gitDiffStat includes it in metadata', async () => {
    const baseDir = await makeTempDir();
    const result = await createCheckpoint(baseDir, {
      note: 'with diff stat',
      gitDiffStat: '3 files changed, 15 insertions(+), 2 deletions(-)',
    });

    expect(result.checkpoint.metadata?.gitDiffStat).toBe(
      '3 files changed, 15 insertions(+), 2 deletions(-)',
    );
  });

  it('checkpoint lifecycle is session-scoped', async () => {
    const baseDir = await makeTempDir();
    const result = await createCheckpoint(baseDir, { note: 'scoped' });

    expect(result.checkpoint.lifecycle).toBe('session');
  });
});
