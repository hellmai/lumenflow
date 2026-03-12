// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
  type AgentRuntimeIntentCatalogEntry,
  type AgentRuntimeMessage,
  type AgentRuntimeRequestedTool,
  type AgentRuntimeToolCatalogEntry,
} from './types.js';

const DEFAULT_MAX_ORCHESTRATION_TURNS = 12;
const TOOL_CALL_ID_PREFIX = 'agent-runtime-tool-call';
const APPROVAL_STATUS_TOOL_NAME = 'kernel:approval';
const LOOP_LIMIT_EXCEEDED_CODE = 'AGENT_RUNTIME_LOOP_LIMIT_EXCEEDED';
const DEFAULT_GOVERNED_TOOL_CATALOG_EXCLUSIONS = [AGENT_RUNTIME_TOOL_NAMES.EXECUTE_TURN] as const;
const AGENT_RUNTIME_WORKFLOW_SCHEMA_VERSION = 1 as const;
const AGENT_RUNTIME_WORKFLOW_DIRECTORY = path.join('.agent-runtime', 'workflow');
const WORKFLOW_SUSPEND_REASON = 'Invocation turn budget reached.';
const WORKFLOW_WAITING_REASON = 'Waiting for approval-driven continuation.';
const WORKFLOW_COMPLETED_REASON = 'Session reached a terminal turn.';

type LoopRuntime = Pick<KernelRuntime, 'executeTool'>;
type GovernedToolCatalogHost = Pick<ToolHost, 'listGovernedTools'>;

export const AGENT_RUNTIME_WORKFLOW_STATUSES = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  WAITING_APPROVAL: 'waiting_approval',
  COMPLETED: 'completed',
  ERROR: 'error',
} as const;

export const AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS = {
  CREATED: 'created',
  RESUMED: 'resumed',
  SUSPENDED: 'suspended',
  APPROVAL_REQUIRED: 'approval_required',
  COMPLETED: 'completed',
  ERROR: 'error',
} as const;

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

export type AgentRuntimeWorkflowStatus =
  (typeof AGENT_RUNTIME_WORKFLOW_STATUSES)[keyof typeof AGENT_RUNTIME_WORKFLOW_STATUSES];

export type AgentRuntimeWorkflowContinuationKind =
  (typeof AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS)[keyof typeof AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS];

export interface AgentRuntimeWorkflowContinuation {
  sequence: number;
  kind: AgentRuntimeWorkflowContinuationKind;
  timestamp: string;
  reason?: string;
  request_id?: string;
}

export interface AgentRuntimeWorkflowState {
  schema_version: typeof AGENT_RUNTIME_WORKFLOW_SCHEMA_VERSION;
  session_id: string;
  task_id?: string;
  run_id?: string;
  status: AgentRuntimeWorkflowStatus;
  created_at: string;
  updated_at: string;
  execute_turn_input: AgentRuntimeExecuteTurnInput;
  messages: AgentRuntimeMessage[];
  history: AgentRuntimeLoopHistoryEntry[];
  turn_count: number;
  tool_call_count: number;
  continuations: AgentRuntimeWorkflowContinuation[];
  pending_request_id?: string;
  requested_tool?: AgentRuntimeRequestedTool;
  last_turn?: AgentRuntimeExecuteTurnOutput;
}

export interface AgentRuntimeWorkflowStateStore {
  load(sessionId: string): Promise<AgentRuntimeWorkflowState | null>;
  save(state: AgentRuntimeWorkflowState): Promise<void>;
}

export interface CreateAgentRuntimeWorkflowStateStoreInput {
  workspaceRoot: string;
  now?: () => string;
}

export interface StartGovernedAgentSessionInput extends RunGovernedAgentLoopInput {
  storageRoot: string;
  maxTurnsPerInvocation?: number;
}

export interface ResumeGovernedAgentSessionInput {
  runtime: LoopRuntime;
  storageRoot: string;
  sessionId: string;
  createContext: (metadata: Record<string, unknown>) => ExecutionContext;
  maxTurnsPerInvocation?: number;
  continuationMessages?: readonly AgentRuntimeMessage[];
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

export interface AgentRuntimeLoopSuspendedResult {
  kind: 'suspended';
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

export type AgentRuntimePersistedSessionResult =
  | AgentRuntimeLoopResult
  | AgentRuntimeLoopSuspendedResult;

interface GovernedLoopCursor {
  messages: AgentRuntimeMessage[];
  history: AgentRuntimeLoopHistoryEntry[];
  turnCount: number;
  toolCallCount: number;
}

interface RunGovernedAgentLoopInternalInput extends RunGovernedAgentLoopInput {
  turnBudgetBehavior: 'error' | 'suspend';
  initialCursor?: GovernedLoopCursor;
}

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
  const result = await runGovernedAgentLoopInternal({
    ...input,
    turnBudgetBehavior: 'error',
  });

  if (result.kind === 'suspended') {
    return {
      kind: 'error',
      stage: 'loop_limit',
      error: {
        code: LOOP_LIMIT_EXCEEDED_CODE,
        message: `Host loop reached maxTurns=${input.maxTurns ?? DEFAULT_MAX_ORCHESTRATION_TURNS} before the agent reached a terminal reply.`,
      },
      messages: result.messages,
      turn_count: result.turn_count,
      tool_call_count: result.tool_call_count,
      history: result.history,
    };
  }

  return result;
}

export function createAgentRuntimeWorkflowStateStore(
  input: CreateAgentRuntimeWorkflowStateStoreInput,
): AgentRuntimeWorkflowStateStore {
  const workflowRoot = path.join(input.workspaceRoot, AGENT_RUNTIME_WORKFLOW_DIRECTORY);
  return {
    async load(sessionId: string): Promise<AgentRuntimeWorkflowState | null> {
      const filePath = path.join(workflowRoot, `${sessionId}.json`);
      try {
        const raw = await readFile(filePath, 'utf8');
        return parseWorkflowState(JSON.parse(raw), filePath);
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === 'ENOENT') {
          return null;
        }
        throw error;
      }
    },

    async save(state: AgentRuntimeWorkflowState): Promise<void> {
      const filePath = path.join(workflowRoot, `${state.session_id}.json`);
      await mkdir(workflowRoot, { recursive: true });
      await writeFile(filePath, JSON.stringify(state), 'utf8');
    },
  };
}

export async function startGovernedAgentSession(
  input: StartGovernedAgentSessionInput,
): Promise<AgentRuntimePersistedSessionResult> {
  const store = createAgentRuntimeWorkflowStateStore({
    workspaceRoot: input.storageRoot,
  });
  const now = new Date().toISOString();
  const baseContext = input.createContext({});
  const initialState: AgentRuntimeWorkflowState = {
    schema_version: AGENT_RUNTIME_WORKFLOW_SCHEMA_VERSION,
    session_id: input.executeTurnInput.session_id,
    task_id: baseContext.task_id,
    run_id: baseContext.run_id,
    status: AGENT_RUNTIME_WORKFLOW_STATUSES.ACTIVE,
    created_at: now,
    updated_at: now,
    execute_turn_input: cloneExecuteTurnInput(input.executeTurnInput),
    messages: [...input.executeTurnInput.messages],
    history: [],
    turn_count: 0,
    tool_call_count: 0,
    continuations: [
      {
        sequence: 0,
        kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.CREATED,
        timestamp: now,
      },
    ],
  };

  const result = await runGovernedAgentLoopInternal({
    ...input,
    maxTurns: input.maxTurnsPerInvocation,
    turnBudgetBehavior: 'suspend',
  });

  await store.save(materializeWorkflowState(initialState, result, now));
  return result;
}

export async function resumeGovernedAgentSession(
  input: ResumeGovernedAgentSessionInput,
): Promise<AgentRuntimePersistedSessionResult> {
  const store = createAgentRuntimeWorkflowStateStore({
    workspaceRoot: input.storageRoot,
  });
  const existing = await store.load(input.sessionId);
  if (!existing) {
    throw new Error(
      `No persisted agent workflow state found for session "${input.sessionId}". Create or restore the session before calling resume.`,
    );
  }

  if (existing.status === AGENT_RUNTIME_WORKFLOW_STATUSES.COMPLETED) {
    throw new Error(
      `Agent workflow session "${input.sessionId}" is already completed and cannot be resumed.`,
    );
  }

  const resumedAt = new Date().toISOString();
  const resumedState: AgentRuntimeWorkflowState = {
    ...existing,
    status: AGENT_RUNTIME_WORKFLOW_STATUSES.ACTIVE,
    updated_at: resumedAt,
    messages: [...existing.messages, ...(input.continuationMessages ?? [])],
    pending_request_id: undefined,
    continuations: appendWorkflowContinuation(existing.continuations, {
      kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.RESUMED,
      timestamp: resumedAt,
    }),
  };

  const result = await runGovernedAgentLoopInternal({
    runtime: input.runtime,
    executeTurnInput: {
      ...cloneExecuteTurnInput(existing.execute_turn_input),
      messages: [...resumedState.messages],
    },
    createContext: input.createContext,
    maxTurns: input.maxTurnsPerInvocation,
    turnBudgetBehavior: 'suspend',
    initialCursor: {
      messages: resumedState.messages,
      history: resumedState.history,
      turnCount: resumedState.turn_count,
      toolCallCount: resumedState.tool_call_count,
    },
  });

  await store.save(materializeWorkflowState(resumedState, result, resumedAt));
  return result;
}

async function runGovernedAgentLoopInternal(
  input: RunGovernedAgentLoopInternalInput,
): Promise<AgentRuntimePersistedSessionResult> {
  const maxTurns = input.maxTurns ?? DEFAULT_MAX_ORCHESTRATION_TURNS;
  const messages = input.initialCursor
    ? [...input.initialCursor.messages]
    : [...input.executeTurnInput.messages];
  const history = input.initialCursor ? [...input.initialCursor.history] : [];
  let turnCount = input.initialCursor?.turnCount ?? 0;
  let toolCallCount = input.initialCursor?.toolCallCount ?? 0;
  let invocationTurnCount = 0;

  while (invocationTurnCount < maxTurns) {
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
    invocationTurnCount += 1;
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

  if (input.turnBudgetBehavior === 'suspend') {
    return {
      kind: 'suspended',
      messages,
      turn_count: turnCount,
      tool_call_count: toolCallCount,
      history,
    };
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

function materializeWorkflowState(
  baseState: AgentRuntimeWorkflowState,
  result: AgentRuntimePersistedSessionResult,
  timestamp: string,
): AgentRuntimeWorkflowState {
  if (result.kind === 'completed') {
    return {
      ...baseState,
      status: AGENT_RUNTIME_WORKFLOW_STATUSES.COMPLETED,
      updated_at: timestamp,
      messages: result.messages,
      history: result.history,
      turn_count: result.turn_count,
      tool_call_count: result.tool_call_count,
      pending_request_id: undefined,
      requested_tool: undefined,
      last_turn: result.final_turn,
      continuations: appendWorkflowContinuation(baseState.continuations, {
        kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.COMPLETED,
        timestamp,
        reason: WORKFLOW_COMPLETED_REASON,
      }),
    };
  }

  if (result.kind === 'approval_required') {
    return {
      ...baseState,
      status: AGENT_RUNTIME_WORKFLOW_STATUSES.WAITING_APPROVAL,
      updated_at: timestamp,
      messages: result.messages,
      history: result.history,
      turn_count: result.turn_count,
      tool_call_count: result.tool_call_count,
      pending_request_id: result.pending_request_id,
      requested_tool: result.requested_tool,
      last_turn: result.last_turn,
      continuations: appendWorkflowContinuation(baseState.continuations, {
        kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.APPROVAL_REQUIRED,
        timestamp,
        reason: WORKFLOW_WAITING_REASON,
        request_id: result.pending_request_id,
      }),
    };
  }

  if (result.kind === 'suspended') {
    return {
      ...baseState,
      status: AGENT_RUNTIME_WORKFLOW_STATUSES.SUSPENDED,
      updated_at: timestamp,
      messages: result.messages,
      history: result.history,
      turn_count: result.turn_count,
      tool_call_count: result.tool_call_count,
      pending_request_id: undefined,
      requested_tool: undefined,
      continuations: appendWorkflowContinuation(baseState.continuations, {
        kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.SUSPENDED,
        timestamp,
        reason: WORKFLOW_SUSPEND_REASON,
      }),
    };
  }

  return {
    ...baseState,
    status: AGENT_RUNTIME_WORKFLOW_STATUSES.ERROR,
    updated_at: timestamp,
    messages: result.messages,
    history: result.history,
    turn_count: result.turn_count,
    tool_call_count: result.tool_call_count,
    pending_request_id: undefined,
    requested_tool: undefined,
    continuations: appendWorkflowContinuation(baseState.continuations, {
      kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.ERROR,
      timestamp,
      reason: result.error.message,
    }),
  };
}

function appendWorkflowContinuation(
  continuations: readonly AgentRuntimeWorkflowContinuation[],
  input: Omit<AgentRuntimeWorkflowContinuation, 'sequence'>,
): AgentRuntimeWorkflowContinuation[] {
  return [
    ...continuations,
    {
      sequence: continuations.length,
      ...input,
    },
  ];
}

function cloneExecuteTurnInput(input: AgentRuntimeExecuteTurnInput): AgentRuntimeExecuteTurnInput {
  return {
    ...input,
    messages: [...input.messages],
    ...(input.tool_catalog ? { tool_catalog: [...input.tool_catalog] } : {}),
    ...(input.intent_catalog ? { intent_catalog: [...input.intent_catalog] } : {}),
    ...(input.limits ? { limits: { ...input.limits } } : {}),
  };
}

function parseWorkflowState(value: unknown, filePath: string): AgentRuntimeWorkflowState {
  if (!isRecord(value)) {
    throw new Error(`Failed to parse workflow state at ${filePath}: expected an object payload.`);
  }

  if (
    value.schema_version !== AGENT_RUNTIME_WORKFLOW_SCHEMA_VERSION ||
    typeof value.session_id !== 'string' ||
    typeof value.status !== 'string'
  ) {
    throw new Error(
      `Failed to parse workflow state at ${filePath}: missing schema_version, session_id, or status.`,
    );
  }

  const requestedTool = parseWorkflowRequestedTool(value.requested_tool);
  const lastTurn = normalizeTurnOutput(value.last_turn);

  return {
    schema_version: AGENT_RUNTIME_WORKFLOW_SCHEMA_VERSION,
    session_id: value.session_id,
    ...(typeof value.task_id === 'string' ? { task_id: value.task_id } : {}),
    ...(typeof value.run_id === 'string' ? { run_id: value.run_id } : {}),
    status: value.status as AgentRuntimeWorkflowStatus,
    created_at: readWorkflowTimestamp(value.created_at, `${filePath}.created_at`),
    updated_at: readWorkflowTimestamp(value.updated_at, `${filePath}.updated_at`),
    execute_turn_input: parseWorkflowExecuteTurnInput(
      value.execute_turn_input,
      `${filePath}.execute_turn_input`,
    ),
    messages: parseWorkflowMessages(value.messages, `${filePath}.messages`),
    history: parseWorkflowHistory(value.history, `${filePath}.history`),
    turn_count: readWorkflowCount(value.turn_count, `${filePath}.turn_count`),
    tool_call_count: readWorkflowCount(value.tool_call_count, `${filePath}.tool_call_count`),
    continuations: parseWorkflowContinuations(value.continuations, `${filePath}.continuations`),
    ...(typeof value.pending_request_id === 'string'
      ? { pending_request_id: value.pending_request_id }
      : {}),
    ...(requestedTool ? { requested_tool: requestedTool } : {}),
    ...(lastTurn ? { last_turn: lastTurn } : {}),
  };
}

function parseWorkflowExecuteTurnInput(
  value: unknown,
  filePath: string,
): AgentRuntimeExecuteTurnInput {
  if (!isRecord(value)) {
    throw new Error(
      `Failed to parse workflow state at ${filePath}: execute_turn_input is invalid.`,
    );
  }

  const sessionId = readRequiredString(value.session_id, `${filePath}.session_id`);
  const modelProfile = readRequiredString(value.model_profile, `${filePath}.model_profile`);
  const url = readRequiredString(value.url, `${filePath}.url`);
  const messages = parseWorkflowMessages(value.messages, `${filePath}.messages`);
  const toolCatalog = Array.isArray(value.tool_catalog)
    ? value.tool_catalog.map((entry, index) =>
        parseWorkflowToolCatalogEntry(entry, `${filePath}.tool_catalog[${index}]`),
      )
    : undefined;
  const intentCatalog = Array.isArray(value.intent_catalog)
    ? value.intent_catalog.map((entry, index) =>
        parseWorkflowIntentCatalogEntry(entry, `${filePath}.intent_catalog[${index}]`),
      )
    : undefined;

  return {
    session_id: sessionId,
    model_profile: modelProfile,
    url,
    ...(typeof value.stream === 'boolean' ? { stream: value.stream } : {}),
    messages,
    ...(toolCatalog ? { tool_catalog: toolCatalog } : {}),
    ...(intentCatalog ? { intent_catalog: intentCatalog } : {}),
    ...(isRecord(value.limits) ? { limits: { ...value.limits } } : {}),
  };
}

function parseWorkflowMessages(value: unknown, filePath: string): AgentRuntimeMessage[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Failed to parse workflow state at ${filePath}: expected an array of messages.`,
    );
  }

  return value.map((entry, index) => parseWorkflowMessage(entry, `${filePath}[${index}]`));
}

function parseWorkflowMessage(value: unknown, filePath: string): AgentRuntimeMessage {
  if (!isRecord(value)) {
    throw new Error(`Failed to parse workflow state at ${filePath}: message entry is invalid.`);
  }

  const role = readRequiredString(value.role, `${filePath}.role`);
  const content = readRequiredString(value.content, `${filePath}.content`);
  if (!isAgentRuntimeMessageRole(role)) {
    throw new Error(
      `Failed to parse workflow state at ${filePath}: message role must be system, user, assistant, or tool.`,
    );
  }

  return {
    role,
    content,
    ...(typeof value.tool_name === 'string' ? { tool_name: value.tool_name } : {}),
    ...(typeof value.tool_call_id === 'string' ? { tool_call_id: value.tool_call_id } : {}),
  };
}

function isAgentRuntimeMessageRole(value: string): value is AgentRuntimeMessage['role'] {
  return value === 'system' || value === 'user' || value === 'assistant' || value === 'tool';
}

function parseWorkflowHistory(value: unknown, filePath: string): AgentRuntimeLoopHistoryEntry[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Failed to parse workflow state at ${filePath}: expected an array of history entries.`,
    );
  }

  return value.map((entry, index) => parseWorkflowHistoryEntry(entry, `${filePath}[${index}]`));
}

function parseWorkflowHistoryEntry(value: unknown, filePath: string): AgentRuntimeLoopHistoryEntry {
  if (!isRecord(value)) {
    throw new Error(`Failed to parse workflow state at ${filePath}: history entry is invalid.`);
  }

  const turnIndex = readWorkflowCount(value.turn_index, `${filePath}.turn_index`);
  const turnOutput = normalizeTurnOutput(value.turn_output);
  if (!turnOutput) {
    throw new Error(`Failed to parse workflow state at ${filePath}: turn_output is invalid.`);
  }

  const toolOutput = parseWorkflowToolOutput(value.tool_output, `${filePath}.tool_output`);

  return {
    turn_index: turnIndex,
    turn_output: turnOutput,
    ...(typeof value.tool_call_id === 'string' ? { tool_call_id: value.tool_call_id } : {}),
    ...(toolOutput ? { tool_output: toolOutput } : {}),
  };
}

function parseWorkflowToolOutput(value: unknown, filePath: string): ToolOutput | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value) || typeof value.success !== 'boolean') {
    throw new Error(`Failed to parse workflow state at ${filePath}: tool_output is invalid.`);
  }

  return {
    success: value.success,
    ...(value.success ? { data: value.data } : {}),
    ...(!value.success && isRecord(value.error)
      ? {
          error: {
            code: readRequiredString(value.error.code, `${filePath}.error.code`),
            message: readRequiredString(value.error.message, `${filePath}.error.message`),
            ...(isRecord(value.error.details) ? { details: value.error.details } : {}),
          },
        }
      : {}),
  };
}

function parseWorkflowContinuations(
  value: unknown,
  filePath: string,
): AgentRuntimeWorkflowContinuation[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Failed to parse workflow state at ${filePath}: expected an array of continuations.`,
    );
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(
        `Failed to parse workflow state at ${filePath}[${index}]: continuation entry is invalid.`,
      );
    }

    return {
      sequence: readWorkflowCount(entry.sequence, `${filePath}[${index}].sequence`),
      kind: readRequiredString(
        entry.kind,
        `${filePath}[${index}].kind`,
      ) as AgentRuntimeWorkflowContinuationKind,
      timestamp: readWorkflowTimestamp(entry.timestamp, `${filePath}[${index}].timestamp`),
      ...(typeof entry.reason === 'string' ? { reason: entry.reason } : {}),
      ...(typeof entry.request_id === 'string' ? { request_id: entry.request_id } : {}),
    };
  });
}

function parseWorkflowRequestedTool(value: unknown): AgentRuntimeRequestedTool | undefined {
  if (!isRecord(value) || typeof value.name !== 'string' || !isRecord(value.input)) {
    return undefined;
  }

  return {
    name: value.name,
    input: value.input,
  };
}

function parseWorkflowToolCatalogEntry(
  value: unknown,
  filePath: string,
): AgentRuntimeToolCatalogEntry {
  if (!isRecord(value)) {
    throw new Error(
      `Failed to parse workflow state at ${filePath}: tool catalog entry is invalid.`,
    );
  }

  return {
    name: readRequiredString(value.name, `${filePath}.name`),
    description: readRequiredString(value.description, `${filePath}.description`),
    ...(isRecord(value.input_schema) ? { input_schema: value.input_schema } : {}),
  };
}

function parseWorkflowIntentCatalogEntry(
  value: unknown,
  filePath: string,
): AgentRuntimeIntentCatalogEntry {
  if (!isRecord(value)) {
    throw new Error(
      `Failed to parse workflow state at ${filePath}: intent catalog entry is invalid.`,
    );
  }

  return {
    id: readRequiredString(value.id, `${filePath}.id`),
    description: readRequiredString(value.description, `${filePath}.description`),
  };
}

function readRequiredString(value: unknown, filePath: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Failed to parse workflow state at ${filePath}: expected a non-empty string.`);
  }

  return value;
}

function readWorkflowTimestamp(value: unknown, filePath: string): string {
  return readRequiredString(value, filePath);
}

function readWorkflowCount(value: unknown, filePath: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(
      `Failed to parse workflow state at ${filePath}: expected a non-negative integer.`,
    );
  }

  return Number(value);
}
