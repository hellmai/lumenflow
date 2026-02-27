// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { SIDEKICK_DOMAIN, SIDEKICK_PACK_ID, SIDEKICK_PACK_VERSION } from '../constants.js';

export const TOOL_SCOPE_TYPES = {
  PATH: 'path',
} as const;

export const TOOL_SCOPE_ACCESS = {
  READ: 'read',
  WRITE: 'write',
} as const;

export const TOOL_PERMISSIONS = {
  READ: 'read',
  WRITE: 'write',
  ADMIN: 'admin',
} as const;

export type ToolScopeType = (typeof TOOL_SCOPE_TYPES)[keyof typeof TOOL_SCOPE_TYPES];
export type ToolScopeAccess = (typeof TOOL_SCOPE_ACCESS)[keyof typeof TOOL_SCOPE_ACCESS];
export type ToolPermission = (typeof TOOL_PERMISSIONS)[keyof typeof TOOL_PERMISSIONS];

export interface PathScope {
  type: ToolScopeType;
  pattern: string;
  access: ToolScopeAccess;
}

export interface ToolDescriptor {
  name: string;
  domain: typeof SIDEKICK_DOMAIN;
  version: typeof SIDEKICK_PACK_VERSION;
  permission: ToolPermission;
  required_scopes: PathScope[];
  entry: string;
  description: string;
  pack: typeof SIDEKICK_PACK_ID;
}

export interface ToolDescriptorInput {
  name: ToolDescriptor['name'];
  permission: ToolDescriptor['permission'];
  required_scopes: ToolDescriptor['required_scopes'];
  entry: ToolDescriptor['entry'];
  description: ToolDescriptor['description'];
}

export function createToolDescriptor(input: ToolDescriptorInput): ToolDescriptor {
  return {
    ...input,
    domain: SIDEKICK_DOMAIN,
    version: SIDEKICK_PACK_VERSION,
    pack: SIDEKICK_PACK_ID,
  };
}
