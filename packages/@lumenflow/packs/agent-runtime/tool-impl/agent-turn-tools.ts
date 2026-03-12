// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import type { ExecutionContext, ToolOutput } from '@lumenflow/kernel';
import { STATIC_PROVIDER_CAPABILITY_BASELINE } from './provider-adapters.js';

const NOT_READY_ERROR_CODE = 'AGENT_RUNTIME_NOT_READY';
const NOT_READY_MESSAGE =
  'agent:execute-turn is scaffolded but not implemented yet. Continue with the next work unit to add provider-backed turn execution.';

export async function agentExecuteTurnTool(
  _input: unknown,
  _ctx: ExecutionContext,
): Promise<ToolOutput> {
  return {
    success: false,
    error: {
      code: NOT_READY_ERROR_CODE,
      message: NOT_READY_MESSAGE,
    },
    metadata: {
      provider_kind: STATIC_PROVIDER_CAPABILITY_BASELINE.kind,
      network_allowlist: [...STATIC_PROVIDER_CAPABILITY_BASELINE.network_allowlist],
      allowed_urls: [...STATIC_PROVIDER_CAPABILITY_BASELINE.allowed_urls],
      required_env: [...STATIC_PROVIDER_CAPABILITY_BASELINE.required_env],
    },
  };
}
