// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { POLICY_TRIGGERS, type PackPolicyFactory, type PolicyRule } from '@lumenflow/kernel';
import {
  AGENT_RUNTIME_AGENT_INTENT_METADATA_KEY,
  AGENT_RUNTIME_POLICY_ID_PREFIX,
} from './constants.js';
import type { AgentRuntimeIntentConfig, AgentRuntimePackConfig } from './types.js';

interface NormalizedIntentRule {
  allowTools: Set<string>;
  approvalRequiredTools: Set<string>;
}

type NormalizedIntentRuleMap = Map<string, NormalizedIntentRule>;

export const createAgentRuntimePolicyFactory: PackPolicyFactory = async (input) => {
  const intentRules = normalizeIntentRules(input.packConfig);
  if (intentRules.size === 0) {
    return [];
  }

  const rules: PolicyRule[] = [
    {
      id: `${AGENT_RUNTIME_POLICY_ID_PREFIX}.intent-approval`,
      trigger: POLICY_TRIGGERS.ON_TOOL_REQUEST,
      decision: 'approval_required',
      reason: 'The classified agent intent requires approval before this tool may run.',
      when: (context) => matchesApprovalRequiredIntent(context, intentRules),
    },
    {
      id: `${AGENT_RUNTIME_POLICY_ID_PREFIX}.intent-deny`,
      trigger: POLICY_TRIGGERS.ON_TOOL_REQUEST,
      decision: 'deny',
      reason: 'The classified agent intent does not permit this tool.',
      when: (context) => matchesDeniedIntent(context, intentRules),
    },
  ];

  return rules;
};

function normalizeIntentRules(packConfig: unknown): NormalizedIntentRuleMap {
  const config = asRecord(packConfig);
  const intents = asRecord(config?.intents);
  if (!intents) {
    return new Map();
  }

  const normalized = new Map<string, NormalizedIntentRule>();
  for (const [intentId, candidate] of Object.entries(intents)) {
    const parsed = normalizeIntentConfig(intentId, candidate);
    normalized.set(intentId, parsed);
  }
  return normalized;
}

function normalizeIntentConfig(intentId: string, value: unknown): NormalizedIntentRule {
  const config = asRecord(value);
  if (!config) {
    throw new Error(`agent_runtime.intents.${intentId} must be an object.`);
  }

  const allowTools = normalizeToolList(
    config.allow_tools,
    `agent_runtime.intents.${intentId}.allow_tools`,
  );
  const approvalRequiredTools = normalizeToolList(
    config.approval_required_tools,
    `agent_runtime.intents.${intentId}.approval_required_tools`,
    true,
  );

  return {
    allowTools: new Set([...allowTools, ...approvalRequiredTools]),
    approvalRequiredTools: new Set(approvalRequiredTools),
  };
}

function normalizeToolList(value: unknown, fieldName: string, optional = false): string[] {
  if (value === undefined && optional) {
    return [];
  }
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)
  ) {
    throw new Error(`${fieldName} must be an array of non-empty strings.`);
  }

  return value.map((entry) => entry.trim());
}

function matchesApprovalRequiredIntent(
  context: Parameters<NonNullable<PolicyRule['when']>>[0],
  intentRules: NormalizedIntentRuleMap,
): boolean {
  const toolName = readCandidateToolName(context);
  if (!toolName) {
    return false;
  }

  const intentRule = resolveIntentRule(context, intentRules);
  return intentRule?.approvalRequiredTools.has(toolName) ?? false;
}

function matchesDeniedIntent(
  context: Parameters<NonNullable<PolicyRule['when']>>[0],
  intentRules: NormalizedIntentRuleMap,
): boolean {
  const toolName = readCandidateToolName(context);
  if (!toolName) {
    return false;
  }

  const intentRule = resolveIntentRule(context, intentRules);
  if (!intentRule) {
    return false;
  }

  return !intentRule.allowTools.has(toolName);
}

function resolveIntentRule(
  context: Parameters<NonNullable<PolicyRule['when']>>[0],
  intentRules: NormalizedIntentRuleMap,
): NormalizedIntentRule | null {
  const intent = readAgentIntent(context);
  if (!intent) {
    return null;
  }

  return (
    intentRules.get(intent) ?? {
      allowTools: new Set<string>(),
      approvalRequiredTools: new Set<string>(),
    }
  );
}

function readAgentIntent(context: Parameters<NonNullable<PolicyRule['when']>>[0]): string | null {
  const executionMetadata = asRecord(context.execution_metadata);
  const candidate = executionMetadata?.[AGENT_RUNTIME_AGENT_INTENT_METADATA_KEY];
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

function readCandidateToolName(
  context: Parameters<NonNullable<PolicyRule['when']>>[0],
): string | null {
  if (typeof context.tool_name !== 'string' || context.tool_name.trim().length === 0) {
    return null;
  }

  const toolName = context.tool_name.trim();
  return toolName === 'agent:execute-turn' ? null : toolName;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export type { AgentRuntimeIntentConfig, AgentRuntimePackConfig };
