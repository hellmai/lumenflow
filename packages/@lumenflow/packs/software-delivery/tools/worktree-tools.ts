// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { createToolDescriptor, type ToolDescriptor } from './types.js';

const WORKTREE_SCOPE = {
  type: 'path' as const,
  pattern: 'worktrees/**',
  access: 'write' as const,
};

export const worktreeListTool: ToolDescriptor = createToolDescriptor({
  name: 'worktree:list',
  permission: 'admin',
  required_scopes: [WORKTREE_SCOPE],
  handler: {
    kind: 'subprocess',
    entry: 'tool-impl/worktree-tools.ts#listWorktreesTool',
  },
  description: 'List available git worktrees.',
});

export const worktreeCreateTool: ToolDescriptor = createToolDescriptor({
  name: 'worktree:create',
  permission: 'admin',
  required_scopes: [WORKTREE_SCOPE],
  handler: {
    kind: 'subprocess',
    entry: 'tool-impl/worktree-tools.ts#createWorktreeTool',
  },
  description: 'Create a git worktree for a delegated unit of work.',
});

export const worktreeRemoveTool: ToolDescriptor = createToolDescriptor({
  name: 'worktree:remove',
  permission: 'admin',
  required_scopes: [WORKTREE_SCOPE],
  handler: {
    kind: 'subprocess',
    entry: 'tool-impl/worktree-tools.ts#removeWorktreeTool',
  },
  description: 'Remove a git worktree after completion.',
});

export const worktreeToolCapabilities: readonly ToolDescriptor[] = [
  worktreeListTool,
  worktreeCreateTool,
  worktreeRemoveTool,
];
