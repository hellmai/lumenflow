// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { createToolDescriptor, type ToolDescriptor } from './types.js';

const WRITE_SCOPE = {
  type: 'path' as const,
  pattern: '**',
  access: 'write' as const,
};

const READ_SCOPE = {
  type: 'path' as const,
  pattern: '**',
  access: 'read' as const,
};

export const gitAddTool: ToolDescriptor = createToolDescriptor({
  name: 'git:add',
  permission: 'write',
  required_scopes: [WRITE_SCOPE],
  handler: {
    kind: 'subprocess',
    entry: 'tool-impl/git-tools.ts#gitAddTool',
  },
  description: 'Stage files for commit in a workspace git repository.',
});

export const gitStatusTool: ToolDescriptor = createToolDescriptor({
  name: 'git:status',
  permission: 'read',
  required_scopes: [READ_SCOPE],
  handler: {
    kind: 'subprocess',
    entry: 'tool-impl/git-tools.ts#gitStatusTool',
  },
  description: 'Inspect git status in a workspace git repository.',
});

export const gitCommitTool: ToolDescriptor = createToolDescriptor({
  name: 'git:commit',
  permission: 'write',
  required_scopes: [WRITE_SCOPE],
  handler: {
    kind: 'subprocess',
    entry: 'tool-impl/git-tools.ts#gitCommitTool',
  },
  description: 'Create a commit for staged changes in a workspace git repository.',
});

export const gitToolCapabilities: readonly ToolDescriptor[] = [
  gitAddTool,
  gitStatusTool,
  gitCommitTool,
];
