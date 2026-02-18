// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { createToolDescriptor, type ToolDescriptor } from './types.js';

const STATE_SCOPE = {
  type: 'path' as const,
  pattern: 'runtime/state/**',
  access: 'write' as const,
};

export const delegationRecordTool: ToolDescriptor = createToolDescriptor({
  name: 'delegation:record',
  permission: 'admin',
  required_scopes: [STATE_SCOPE],
  handler: {
    kind: 'subprocess',
    entry: 'tool-impl/delegation-tools.ts#recordDelegationTool',
  },
  description: 'Append delegation lineage events for spawned sub-work.',
});

export const delegationToolCapabilities: readonly ToolDescriptor[] = [delegationRecordTool];
