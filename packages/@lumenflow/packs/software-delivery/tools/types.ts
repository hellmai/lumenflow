// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import {
  SOFTWARE_DELIVERY_DOMAIN,
  SOFTWARE_DELIVERY_PACK_ID,
  SOFTWARE_DELIVERY_PACK_VERSION,
} from '../constants.js';

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

export const TOOL_HANDLER_KINDS = {
  SUBPROCESS: 'subprocess',
} as const;

export type ToolScopeType = (typeof TOOL_SCOPE_TYPES)[keyof typeof TOOL_SCOPE_TYPES];
export type ToolScopeAccess = (typeof TOOL_SCOPE_ACCESS)[keyof typeof TOOL_SCOPE_ACCESS];
export type ToolPermission = (typeof TOOL_PERMISSIONS)[keyof typeof TOOL_PERMISSIONS];
export type ToolHandlerKind = (typeof TOOL_HANDLER_KINDS)[keyof typeof TOOL_HANDLER_KINDS];

export interface PathScope {
  type: ToolScopeType;
  pattern: string;
  access: ToolScopeAccess;
}

export interface ToolDescriptor {
  name: string;
  domain: typeof SOFTWARE_DELIVERY_DOMAIN;
  version: typeof SOFTWARE_DELIVERY_PACK_VERSION;
  permission: ToolPermission;
  required_scopes: PathScope[];
  handler: {
    kind: ToolHandlerKind;
    entry: string;
  };
  description: string;
  pack: typeof SOFTWARE_DELIVERY_PACK_ID;
}

export interface ToolDescriptorInput {
  name: ToolDescriptor['name'];
  permission: ToolDescriptor['permission'];
  required_scopes: ToolDescriptor['required_scopes'];
  handler: ToolDescriptor['handler'];
  description: ToolDescriptor['description'];
}

export function createToolDescriptor(input: ToolDescriptorInput): ToolDescriptor {
  return {
    ...input,
    domain: SOFTWARE_DELIVERY_DOMAIN,
    version: SOFTWARE_DELIVERY_PACK_VERSION,
    pack: SOFTWARE_DELIVERY_PACK_ID,
  };
}

export { SOFTWARE_DELIVERY_DOMAIN, SOFTWARE_DELIVERY_PACK_ID, SOFTWARE_DELIVERY_PACK_VERSION };
