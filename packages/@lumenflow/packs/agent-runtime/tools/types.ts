// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import type { ToolScope } from '@lumenflow/kernel';
import { AGENT_RUNTIME_DOMAIN, AGENT_RUNTIME_PACK_ID, AGENT_RUNTIME_PACK_VERSION } from '../constants.js';
import type { AgentRuntimeToolName } from '../types.js';

export const AGENT_RUNTIME_TOOL_PERMISSIONS = {
  READ: 'read',
  WRITE: 'write',
  ADMIN: 'admin',
} as const;

export type AgentRuntimeToolPermission =
  (typeof AGENT_RUNTIME_TOOL_PERMISSIONS)[keyof typeof AGENT_RUNTIME_TOOL_PERMISSIONS];

export interface AgentRuntimeToolDescriptor {
  name: AgentRuntimeToolName;
  domain: typeof AGENT_RUNTIME_DOMAIN;
  pack: typeof AGENT_RUNTIME_PACK_ID;
  version: typeof AGENT_RUNTIME_PACK_VERSION;
  permission: AgentRuntimeToolPermission;
  required_scopes: ToolScope[];
  entry: string;
}

export interface AgentRuntimeToolDescriptorInput {
  name: AgentRuntimeToolDescriptor['name'];
  permission: AgentRuntimeToolDescriptor['permission'];
  required_scopes: AgentRuntimeToolDescriptor['required_scopes'];
  entry: AgentRuntimeToolDescriptor['entry'];
}

export function createAgentRuntimeToolDescriptor(
  input: AgentRuntimeToolDescriptorInput,
): AgentRuntimeToolDescriptor {
  return {
    ...input,
    domain: AGENT_RUNTIME_DOMAIN,
    pack: AGENT_RUNTIME_PACK_ID,
    version: AGENT_RUNTIME_PACK_VERSION,
  };
}
