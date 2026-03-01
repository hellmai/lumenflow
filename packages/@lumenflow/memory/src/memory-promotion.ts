// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Project memory promotion for wu:done cleanup flow (WU-2145).
 *
 * Copies project-lifecycle memory nodes from a WU worktree memory store to the
 * main checkout memory store before worktree deletion.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { appendNode, loadMemoryAll } from './memory-store.js';
import type { MemoryNode } from './memory-schema.js';
import { LUMENFLOW_MEMORY_PATHS } from './paths.js';

const PROJECT_LIFECYCLE = 'project';

export interface ProjectMemoryPromotionResult {
  promotedCount: number;
  promotedNodeIds: string[];
  skippedCount: number;
  skippedNodeIds: string[];
}

function isProjectNode(node: MemoryNode): boolean {
  return node.lifecycle === PROJECT_LIFECYCLE;
}

function resolveMemoryDir(baseDir: string): string {
  return path.join(baseDir, LUMENFLOW_MEMORY_PATHS.MEMORY_DIR);
}

/**
 * Promote project-lifecycle nodes from worktree memory into main memory.
 *
 * Rules:
 * - Only nodes with lifecycle='project' are eligible
 * - Nodes already present in main memory (same id) are skipped
 * - If no project nodes exist, this is a no-op
 */
export async function promoteProjectMemory(
  worktreeDir: string,
  mainDir: string,
): Promise<ProjectMemoryPromotionResult> {
  const worktreeMemoryDir = resolveMemoryDir(worktreeDir);
  const mainMemoryDir = resolveMemoryDir(mainDir);

  const worktreeMemory = await loadMemoryAll(worktreeMemoryDir);
  const mainMemory = await loadMemoryAll(mainMemoryDir);

  const projectNodes = worktreeMemory.nodes.filter(isProjectNode);
  if (projectNodes.length === 0) {
    return {
      promotedCount: 0,
      promotedNodeIds: [],
      skippedCount: 0,
      skippedNodeIds: [],
    };
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is derived from vetted workspace root + fixed memory dir suffix.
  await fs.mkdir(mainMemoryDir, { recursive: true });

  const promotedNodeIds: string[] = [];
  const skippedNodeIds: string[] = [];

  for (const node of projectNodes) {
    if (mainMemory.byId.has(node.id)) {
      skippedNodeIds.push(node.id);
      continue;
    }

    await appendNode(mainMemoryDir, node);
    mainMemory.byId.set(node.id, node);
    promotedNodeIds.push(node.id);
  }

  return {
    promotedCount: promotedNodeIds.length,
    promotedNodeIds,
    skippedCount: skippedNodeIds.length,
    skippedNodeIds,
  };
}
