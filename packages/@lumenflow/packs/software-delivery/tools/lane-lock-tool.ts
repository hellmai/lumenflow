// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { createToolDescriptor, type ToolDescriptor } from './types.js';

const ADMIN_SCOPE = {
  type: 'path' as const,
  pattern: 'runtime/locks/**',
  access: 'write' as const,
};

export const laneLockAcquireTool: ToolDescriptor = createToolDescriptor({
  name: 'lane-lock:acquire',
  permission: 'admin',
  required_scopes: [ADMIN_SCOPE],
  handler: {
    kind: 'subprocess',
    entry: 'tool-impl/lane-lock.ts#acquireLaneLockTool',
  },
  description: 'Acquire an atomic lane lock for a work unit.',
});

export const laneLockReleaseTool: ToolDescriptor = createToolDescriptor({
  name: 'lane-lock:release',
  permission: 'admin',
  required_scopes: [ADMIN_SCOPE],
  handler: {
    kind: 'subprocess',
    entry: 'tool-impl/lane-lock.ts#releaseLaneLockTool',
  },
  description: 'Release a lane lock held by the current worker.',
});

export const laneLockToolCapabilities: readonly ToolDescriptor[] = [
  laneLockAcquireTool,
  laneLockReleaseTool,
];
