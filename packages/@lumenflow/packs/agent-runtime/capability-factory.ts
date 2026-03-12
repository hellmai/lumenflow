// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import type { PackCapabilityFactory, PackCapabilityFactoryInput } from '@lumenflow/kernel';
import { AGENT_RUNTIME_TOOL_NAMES } from './types.js';
import type { AgentRuntimeModelProfileConfig, AgentRuntimePackConfig } from './types.js';

export const createAgentRuntimeCapabilityFactory: PackCapabilityFactory = async (input) => {
  if (input.tool.name !== AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN) {
    return {};
  }

  const packConfig = normalizePackConfig(input.packConfig);
  if (!packConfig) {
    return {};
  }

  const requiredEnv = new Set<string>();
  const providerHosts = new Set<string>();

  for (const [profileName, profile] of Object.entries(packConfig.models)) {
    requiredEnv.add(profile.api_key_env);
    if (profile.base_url_env) {
      requiredEnv.add(profile.base_url_env);
    }

    const resolvedBaseUrl = resolveProfileBaseUrl(profileName, profile);
    if (!resolvedBaseUrl) {
      continue;
    }
    providerHosts.add(toNetworkAllowlistEntry(profileName, resolvedBaseUrl));
  }

  return {
    ...(requiredEnv.size > 0 ? { required_env: [...requiredEnv].sort() } : {}),
    ...(providerHosts.size > 0
      ? {
          required_scopes: [
            {
              type: 'network' as const,
              posture: 'allowlist' as const,
              allowlist_entries: [...providerHosts].sort(),
            },
          ],
        }
      : {}),
  };
};

function normalizePackConfig(value: unknown): AgentRuntimePackConfig | null {
  if (!isRecord(value) || !isRecord(value.models)) {
    return null;
  }

  return value as unknown as AgentRuntimePackConfig;
}

function resolveProfileBaseUrl(
  profileName: string,
  profile: AgentRuntimeModelProfileConfig,
): string | null {
  if (typeof profile.base_url === 'string' && profile.base_url.trim().length > 0) {
    return profile.base_url.trim();
  }

  if (!profile.base_url_env) {
    return null;
  }

  const environmentValue = process.env[profile.base_url_env];
  if (typeof environmentValue !== 'string' || environmentValue.trim().length === 0) {
    throw new Error(
      `agent_runtime.models.${profileName}.base_url_env references "${profile.base_url_env}" but it is not set.`,
    );
  }

  return environmentValue.trim();
}

function toNetworkAllowlistEntry(profileName: string, baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch (error) {
    throw new Error(
      `agent_runtime.models.${profileName} must resolve to a valid absolute base URL, got "${baseUrl}".`,
      { cause: error },
    );
  }

  const port =
    parsed.port || (parsed.protocol === 'https:' ? '443' : parsed.protocol === 'http:' ? '80' : '');
  if (!port) {
    throw new Error(
      `agent_runtime.models.${profileName} uses protocol "${parsed.protocol}" without an explicit port.`,
    );
  }

  return `${parsed.hostname}:${port}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
