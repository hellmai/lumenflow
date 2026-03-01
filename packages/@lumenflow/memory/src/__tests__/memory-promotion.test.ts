// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promoteProjectMemory } from '../memory-promotion.js';

type MemoryNodeFixture = {
  id: string;
  type: 'session' | 'discovery' | 'checkpoint' | 'note' | 'summary';
  lifecycle: 'ephemeral' | 'session' | 'wu' | 'project';
  content: string;
  created_at: string;
  metadata?: Record<string, unknown>;
};

const MEMORY_RELATIVE_PATH = path.join('.lumenflow', 'memory', 'memory.jsonl');

function fixtureNode(
  id: string,
  lifecycle: MemoryNodeFixture['lifecycle'],
  overrides: Partial<MemoryNodeFixture> = {},
): MemoryNodeFixture {
  return {
    id,
    type: 'note',
    lifecycle,
    content: `node-${id}`,
    created_at: '2026-03-01T12:00:00.000Z',
    ...overrides,
  };
}

async function writeMemory(baseDir: string, nodes: MemoryNodeFixture[]): Promise<void> {
  const memoryFile = path.join(baseDir, MEMORY_RELATIVE_PATH);
  await fs.mkdir(path.dirname(memoryFile), { recursive: true });
  const content = nodes.map((node) => JSON.stringify(node)).join('\n');
  await fs.writeFile(memoryFile, `${content}${content ? '\n' : ''}`, 'utf-8');
}

async function readMemory(baseDir: string): Promise<MemoryNodeFixture[]> {
  const memoryFile = path.join(baseDir, MEMORY_RELATIVE_PATH);
  try {
    const content = await fs.readFile(memoryFile, 'utf-8');
    return content
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as MemoryNodeFixture);
  } catch {
    return [];
  }
}

describe('promoteProjectMemory (WU-2145)', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempRoots.length = 0;
  });

  it('promotes only project lifecycle nodes from worktree memory to main memory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-promotion-'));
    tempRoots.push(root);
    const mainDir = path.join(root, 'main');
    const worktreeDir = path.join(root, 'worktree');

    await writeMemory(mainDir, [fixtureNode('mem-mai1', 'project')]);
    await writeMemory(worktreeDir, [
      fixtureNode('mem-pro1', 'project'),
      fixtureNode('mem-ses1', 'session'),
      fixtureNode('mem-wu01', 'wu'),
    ]);

    const result = await promoteProjectMemory(worktreeDir, mainDir);

    expect(result.promotedCount).toBe(1);
    expect(result.promotedNodeIds).toEqual(['mem-pro1']);

    const mainMemory = await readMemory(mainDir);
    const ids = mainMemory.map((node) => node.id);
    expect(ids).toContain('mem-mai1');
    expect(ids).toContain('mem-pro1');
    expect(ids).not.toContain('mem-ses1');
    expect(ids).not.toContain('mem-wu01');
  });

  it('is a no-op when no project nodes exist in the worktree memory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-promotion-'));
    tempRoots.push(root);
    const mainDir = path.join(root, 'main');
    const worktreeDir = path.join(root, 'worktree');

    await writeMemory(mainDir, []);
    await writeMemory(worktreeDir, [fixtureNode('mem-sess', 'session')]);

    const result = await promoteProjectMemory(worktreeDir, mainDir);

    expect(result.promotedCount).toBe(0);
    expect(result.promotedNodeIds).toEqual([]);

    const mainMemory = await readMemory(mainDir);
    expect(mainMemory).toHaveLength(0);
  });

  it('skips project nodes that already exist in main memory (idempotent)', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-promotion-'));
    tempRoots.push(root);
    const mainDir = path.join(root, 'main');
    const worktreeDir = path.join(root, 'worktree');

    await writeMemory(mainDir, [fixtureNode('mem-proj', 'project')]);
    await writeMemory(worktreeDir, [fixtureNode('mem-proj', 'project')]);

    const result = await promoteProjectMemory(worktreeDir, mainDir);

    expect(result.promotedCount).toBe(0);
    expect(result.promotedNodeIds).toEqual([]);

    const mainMemory = await readMemory(mainDir);
    expect(mainMemory.filter((node) => node.id === 'mem-proj')).toHaveLength(1);
  });
});
