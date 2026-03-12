// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import {
  TOOL_ERROR_CODES,
  type ExecutionContext,
  type KernelRuntime,
  type ToolHost,
  type ToolOutput,
} from '@lumenflow/kernel';
import {
  AGENT_RUNTIME_AGENT_INTENT_METADATA_KEY,
  AGENT_RUNTIME_AGENT_TOOL_CALL_COUNT_METADATA_KEY,
  AGENT_RUNTIME_AGENT_TURN_INDEX_METADATA_KEY,
} from './constants.js';
import {
  AGENT_RUNTIME_TOOL_NAMES,
  AGENT_RUNTIME_TURN_STATUSES,
  type AgentRuntimeExecuteTurnInput,
  type AgentRuntimeExecuteTurnOutput,
  type AgentRuntimeMessage,
  type AgentRuntimeRequestedTool,
  type AgentRuntimeToolCatalogEntry,
} from './types.js';

const DEFAULT_MAX_ORCHESTRATION_TURNS = 12;
const TOOL_CALL_ID_PREFIX = 'agent-runtime-tool-call';
const APPROVAL_STATUS_TOOL_NAME = 'kernel:approval';
const LOOP_LIMIT_EXCEEDED_CODE = 'AGENT_RUNTIME_LOOP_LIMIT_EXCEEDED';
const DEFAULT_GOVERNED_TOOL_CATALOG_EXCLUSIONS = [AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN] as const;

type LoopRuntime = Pick<KernelRuntime, 'executeTool'>;
type GovernedToolCatalogHost = Pick<ToolHost, 'listGovernedTools'>;

export interface AgentRuntimeLoopHistoryEntry {
  turn_index: number;
  turn_output: AgentRuntimeExecuteTurnOutput;
  tool_call_id?: string;
  tool_output?: ToolOutput;
}

export interface AgentRuntimeHostContextInput {
  task_summary?: string;
  memory_summary?: string;
  additional_context?: readonly string[];
}

export interface BuildGovernedToolCatalogInput {
  toolHost: GovernedToolCatalogHost;
  context: ExecutionContext;
  excludeToolNames?: readonly string[];
}

export interface RunGovernedAgentLoopInput {
  runtime: LoopRuntime;
  executeTurnInput: AgentRuntimeExecuteTurnInput;
  createContext: (metadata: Record<string, unknown>) => ExecutionContext;
  maxTurns?: number;
}

export interface AgentRuntimeLoopCompletedResult {
  kind: 'completed';
  final_turn: AgentRuntimeExecuteTurnOutput;
  messages: AgentRuntimeMessage[];
  turn_count: number;
  tool_call_count: number;
  history: AgentRuntimeLoopHistoryEntry[];
}

export interface AgentRuntimeLoopApprovalRequiredResult {
  kind: 'approval_required';
  pending_request_id: string;
  requested_tool: AgentRuntimeRequestedTool;
  last_turn: AgentRuntimeExecuteTurnOutput;
  messages: AgentRuntimeMessage[];
  turn_count: number;
  tool_call_count: number;
  history: AgentRuntimeLoopHistoryEntry[];
}

export interface AgentRuntimeLoopErrorResult {
  kind: 'error';
  stage: 'execute_turn' | 'loop_limit';
  error: {
    code: string;
    message: string;
  };
  messages: AgentRuntimeMessage[];
  turn_count: number;
  tool_call_count: number;
  history: AgentRuntimeLoopHistoryEntry[];
}

export type AgentRuntimeLoopResult =
  | AgentRuntimeLoopCompletedResult
  | AgentRuntimeLoopApprovalRequiredResult
  | AgentRuntimeLoopErrorResult;

export async function buildGovernedToolCatalog(
  input: BuildGovernedToolCatalogInput,
): Promise<AgentRuntimeToolCatalogEntry[]> {
  const excludedToolNames = new Set(
    input.excludeToolNames ?? DEFAULT_GOVERNED_TOOL_CATALOG_EXCLUSIONS,
  );
  const governedTools = await input.toolHost.listGovernedTools(input.context);

  return governedTools
    .filter((entry) => !excludedToolNames.has(entry.capability.name))
    .map((entry) => ({
      name: entry.capability.name,
      description: entry.capability.description,
    }));
}

export async function runGovernedAgentLoop(
  input: RunGovernedAgentLoopInput,
): Promise<AgentRuntimeLoopResult> {
  const maxTurns = input.maxTurns ?? DEFAULT_MAX_ORCHESTRATION_TURNS;
  const messages = [...input.executeTurnInput.messages];
  const history: AgentRuntimeLoopHistoryEntry[] = [];
  let turnCount = 0;
  let toolCallCount = 0;

  while (turnCount < maxTurns) {
    const executeTurnOutput = await input.runtime.executeTool(
      AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN,
      {
        ...input.executeTurnInput,
        messages: [...messages],
      },
      input.createContext({
        [AGENT_RUNTIME_AGENT_TURN_INDEX_METADATA_KEY]: turnCount,
        [AGENT_RUNTIME_AGENT_TOOL_CALL_COUNT_METADATA_KEY]: toolCallCount,
      }),
    );

    if (!executeTurnOutput.success) {
      return {
        kind: 'error',
        stage: 'execute_turn',
        error: normalizeToolError(
          executeTurnOutput.error,
          'agent:execute-turn failed in the host loop.',
        ),
        messages,
        turn_count: turnCount,
        tool_call_count: toolCallCount,
        history,
      };
    }

    const normalizedTurn = normalizeTurnOutput(executeTurnOutput.data);
    if (!normalizedTurn) {
      return {
        kind: 'error',
        stage: 'execute_turn',
        error: {
          code: TOOL_ERROR_CODES.INVALID_OUTPUT,
          message:
            'agent:execute-turn returned a payload that does not match the governed turn contract.',
        },
        messages,
        turn_count: turnCount,
        tool_call_count: toolCallCount,
        history,
      };
    }

    const currentTurnIndex = turnCount;
    turnCount += 1;
    const historyEntry: AgentRuntimeLoopHistoryEntry = {
      turn_index: currentTurnIndex,
      turn_output: normalizedTurn,
    };
    history.push(historyEntry);

    if (
      normalizedTurn.status !== AGENT_RUNTIME_TURN_STATUSES.TOOL_REQUEST ||
      !normalizedTurn.requested_tool
    ) {
      return {
        kind: 'completed',
        final_turn: normalizedTurn,
        messages,
        turn_count: turnCount,
        tool_call_count: toolCallCount,
        history,
      };
    }

    const toolCallId = `${TOOL_CALL_ID_PREFIX}-${toolCallCount + 1}`;
    const toolOutput = await input.runtime.executeTool(
      normalizedTurn.requested_tool.name,
      normalizedTurn.requested_tool.input,
      input.createContext({
        [AGENT_RUNTIME_AGENT_INTENT_METADATA_KEY]: normalizedTurn.intent,
        [AGENT_RUNTIME_AGENT_TURN_INDEX_METADATA_KEY]: currentTurnIndex,
        [AGENT_RUNTIME_AGENT_TOOL_CALL_COUNT_METADATA_KEY]: toolCallCount,
      }),
    );

    toolCallCount += 1;
    historyEntry.tool_call_id = toolCallId;
    historyEntry.tool_output = toolOutput;

    if (!toolOutput.success && toolOutput.error?.code === TOOL_ERROR_CODES.APPROVAL_REQUIRED) {
      return {
        kind: 'approval_required',
        pending_request_id: extractApprovalRequestId(toolOutput),
        requested_tool: normalizedTurn.requested_tool,
        last_turn: normalizedTurn,
        messages,
        turn_count: turnCount,
        tool_call_count: toolCallCount,
        history,
      };
    }

    messages.push(
      createToolResultMessage({
        toolName: normalizedTurn.requested_tool.name,
        toolCallId,
        output: toolOutput,
      }),
    );
  }

  return {
    kind: 'error',
    stage: 'loop_limit',
    error: {
      code: LOOP_LIMIT_EXCEEDED_CODE,
      message: `Host loop reached maxTurns=${maxTurns} before the agent reached a terminal reply.`,
    },
    messages,
    turn_count: turnCount,
    tool_call_count: toolCallCount,
    history,
  };
}

export function createHostContextMessages(
  input: AgentRuntimeHostContextInput,
): AgentRuntimeMessage[] {
  const messages: AgentRuntimeMessage[] = [];
  const taskSummary = normalizeOptionalText(input.task_summary);
  if (taskSummary) {
    messages.push({
      role: 'system',
      content: `Task context:\n${taskSummary}`,
    });
  }

  const memorySummary = normalizeOptionalText(input.memory_summary);
  if (memorySummary) {
    messages.push({
      role: 'system',
      content: `Memory context:\n${memorySummary}`,
    });
  }

  for (const note of input.additional_context ?? []) {
    const normalizedNote = normalizeOptionalText(note);
    if (!normalizedNote) {
      continue;
    }
    messages.push({
      role: 'system',
      content: `Additional context:\n${normalizedNote}`,
    });
  }

  return messages;
}

export function createToolResultMessage(input: {
  toolName: string;
  toolCallId: string;
  output: ToolOutput;
}): AgentRuntimeMessage {
  return {
    role: 'tool',
    tool_name: input.toolName,
    tool_call_id: input.toolCallId,
    content: JSON.stringify({
      success: input.output.success,
      ...(input.output.success ? { data: input.output.data ?? null } : {}),
      ...(!input.output.success ? { error: input.output.error ?? null } : {}),
    }),
  };
}

export function createApprovalResolutionMessage(input: {
  requestId: string;
  approved: boolean;
  approvedBy: string;
  toolName?: string;
  reason?: string;
}): AgentRuntimeMessage {
  return {
    role: 'tool',
    tool_name: input.toolName ?? APPROVAL_STATUS_TOOL_NAME,
    tool_call_id: input.requestId,
    content: JSON.stringify({
      approval: {
        request_id: input.requestId,
        approved: input.approved,
        approved_by: input.approvedBy,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    }),
  };
}

function normalizeToolError(
  error: ToolOutput['error'],
  fallbackMessage: string,
): { code: string; message: string } {
  return {
    code: error?.code ?? TOOL_ERROR_CODES.TOOL_EXECUTION_FAILED,
    message: error?.message ?? fallbackMessage,
  };
}

function normalizeTurnOutput(value: unknown): AgentRuntimeExecuteTurnOutput | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.status !== 'string' ||
    typeof value.intent !== 'string' ||
    typeof value.assistant_message !== 'string' ||
    typeof value.finish_reason !== 'string'
  ) {
    return null;
  }

  const provider = isRecord(value.provider) ? value.provider : null;
  if (!provider || typeof provider.kind !== 'string' || typeof provider.model !== 'string') {
    return null;
  }

  const requestedTool = isRecord(value.requested_tool) ? value.requested_tool : undefined;

  return {
    status: value.status,
    intent: value.intent,
    assistant_message: value.assistant_message,
    ...(requestedTool && typeof requestedTool.name === 'string' && isRecord(requestedTool.input)
      ? {
          requested_tool: {
            name: requestedTool.name,
            input: requestedTool.input,
          },
        }
      : {}),
    provider: {
      kind: provider.kind,
      model: provider.model,
    },
    ...(isRecord(value.usage) ? { usage: value.usage } : {}),
    finish_reason: value.finish_reason,
  } as AgentRuntimeExecuteTurnOutput;
}

function extractApprovalRequestId(output: ToolOutput): string {
  const details = isRecord(output.error?.details) ? output.error?.details : null;
  const requestId = details?.request_id;
  return typeof requestId === 'string' && requestId.trim().length > 0
    ? requestId
    : 'approval-request-missing';
}

function normalizeOptionalText(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
