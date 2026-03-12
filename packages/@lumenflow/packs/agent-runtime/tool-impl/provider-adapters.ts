// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import {
  AGENT_RUNTIME_API_KEY_ENV,
  AGENT_RUNTIME_BASE_URL_ENV,
  AGENT_RUNTIME_STATIC_PROVIDER_ALLOWLIST,
  AGENT_RUNTIME_STATIC_PROVIDER_URLS,
} from '../constants.js';
import { AGENT_RUNTIME_PROVIDER_KINDS, type AgentRuntimeProviderKind } from '../types.js';

export interface ProviderCapabilityBaseline {
  kind: AgentRuntimeProviderKind;
  required_env: readonly string[];
  network_allowlist: readonly string[];
  allowed_urls: readonly string[];
}

export const STATIC_PROVIDER_CAPABILITY_BASELINE: ProviderCapabilityBaseline = {
  kind: AGENT_RUNTIME_PROVIDER_KINDS.OPENAI_COMPATIBLE,
  required_env: [AGENT_RUNTIME_API_KEY_ENV, AGENT_RUNTIME_BASE_URL_ENV],
  network_allowlist: AGENT_RUNTIME_STATIC_PROVIDER_ALLOWLIST,
  allowed_urls: AGENT_RUNTIME_STATIC_PROVIDER_URLS,
};

export function listStaticProviderCapabilityBaselines(): readonly ProviderCapabilityBaseline[] {
  return [STATIC_PROVIDER_CAPABILITY_BASELINE];
}
