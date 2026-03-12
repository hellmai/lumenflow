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
  AGENT_RUNTIME_AGENT_WORKFLOW_NODE_ID_METADATA_KEY,
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
const WORKFLOW_SCHEDULED_REASON = 'Waiting for the scheduled wake time.';
const WORKFLOW_JOIN_READY_REASON = 'Join dependencies completed.';
const WORKFLOW_WAKEUP_REASON = 'Scheduled wake time reached.';

type LoopRuntime = Pick<KernelRuntime, 'executeTool'>;
type GovernedToolCatalogHost = Pick<ToolHost, 'listGovernedTools'>;

export const AGENT_RUNTIME_WORKFLOW_STATUSES = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  WAITING_APPROVAL: 'waiting_approval',
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  ERROR: 'error',
} as const;

export const AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS = {
  CREATED: 'created',
  RESUMED: 'resumed',
  SUSPENDED: 'suspended',
  APPROVAL_REQUIRED: 'approval_required',
  SCHEDULED: 'scheduled',
  WAKEUP: 'wakeup',
  BRANCH_COMPLETED: 'branch_completed',
  JOIN_READY: 'join_ready',
  COMPLETED: 'completed',
  ERROR: 'error',
} as const;

export const AGENT_RUNTIME_WORKFLOW_NODE_STATUSES = {
  PENDING: 'pending',
  READY: 'ready',
  SCHEDULED: 'scheduled',
  WAITING_APPROVAL: 'waiting_approval',
  SUSPENDED: 'suspended',
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
  node_id?: string;
}

export type AgentRuntimeWorkflowNodeStatus =
  (typeof AGENT_RUNTIME_WORKFLOW_NODE_STATUSES)[keyof typeof AGENT_RUNTIME_WORKFLOW_NODE_STATUSES];

export interface AgentRuntimeWorkflowNodeDefinition {
  id: string;
  execute_turn_input: AgentRuntimeExecuteTurnInput;
  depends_on?: string[];
  wake_at?: string;
}

export interface AgentRuntimeWorkflowNodeState {
  node_id: string;
  status: AgentRuntimeWorkflowNodeStatus;
  execute_turn_input: AgentRuntimeExecuteTurnInput;
  depends_on: string[];
  wake_at?: string;
  messages: AgentRuntimeMessage[];
  history: AgentRuntimeLoopHistoryEntry[];
  turn_count: number;
  tool_call_count: number;
  pending_request_id?: string;
  requested_tool?: AgentRuntimeRequestedTool;
  last_turn?: AgentRuntimeExecuteTurnOutput;
}

export interface AgentRuntimeWorkflowGraphState {
  nodes: AgentRuntimeWorkflowNodeState[];
}

export interface AgentRuntimeWorkflowDefinition {
  session_id: string;
  nodes: AgentRuntimeWorkflowNodeDefinition[];
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
  workflow?: AgentRuntimeWorkflowGraphState;
  next_wake_at?: string;
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
  now?: () => string;
}

export interface ResumeGovernedAgentSessionInput {
  runtime: LoopRuntime;
  storageRoot: string;
  sessionId: string;
  createContext: (metadata: Record<string, unknown>) => ExecutionContext;
  maxTurnsPerInvocation?: number;
  continuationMessages?: readonly AgentRuntimeMessage[];
  now?: () => string;
}

export interface StartGovernedAgentWorkflowInput {
  runtime: LoopRuntime;
  storageRoot: string;
  workflow: AgentRuntimeWorkflowDefinition;
  createContext: (metadata: Record<string, unknown>) => ExecutionContext;
  maxTurnsPerInvocation?: number;
  now?: () => string;
}

export interface ResumeGovernedAgentWorkflowInput {
  runtime: LoopRuntime;
  storageRoot: string;
  sessionId: string;
  createContext: (metadata: Record<string, unknown>) => ExecutionContext;
  maxTurnsPerInvocation?: number;
  continuationMessagesByNodeId?: Record<string, readonly AgentRuntimeMessage[]>;
  now?: () => string;
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

export interface AgentRuntimeWorkflowCompletedResult {
  kind: 'completed';
  completed_node_ids: string[];
}

export interface AgentRuntimeWorkflowScheduledResult {
  kind: 'scheduled';
  next_wake_at: string;
  scheduled_node_ids: string[];
  completed_node_ids: string[];
}

export interface AgentRuntimeWorkflowApprovalRequiredResult {
  kind: 'approval_required';
  node_id: string;
  pending_request_id: string;
  requested_tool: AgentRuntimeRequestedTool;
}

export interface AgentRuntimeWorkflowSuspendedResult {
  kind: 'suspended';
  node_id: string;
}

export interface AgentRuntimeWorkflowErrorResult {
  kind: 'error';
  node_id: string;
  error: {
    code: string;
    message: string;
  };
}

export type AgentRuntimeWorkflowAdvanceResult =
  | AgentRuntimeWorkflowCompletedResult
  | AgentRuntimeWorkflowScheduledResult
  | AgentRuntimeWorkflowApprovalRequiredResult
  | AgentRuntimeWorkflowSuspendedResult
  | AgentRuntimeWorkflowErrorResult;

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
  const now = resolveCurrentTimestamp(input.now);
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

  const resumedAt = resolveCurrentTimestamp(input.now);
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

export async function startGovernedAgentWorkflow(
  input: StartGovernedAgentWorkflowInput,
): Promise<AgentRuntimeWorkflowAdvanceResult> {
  const timestamp = resolveCurrentTimestamp(input.now);
  const baseContext = input.createContext({});
  const workflowState: AgentRuntimeWorkflowState = {
    schema_version: AGENT_RUNTIME_WORKFLOW_SCHEMA_VERSION,
    session_id: input.workflow.session_id,
    task_id: baseContext.task_id,
    run_id: baseContext.run_id,
    status: AGENT_RUNTIME_WORKFLOW_STATUSES.ACTIVE,
    created_at: timestamp,
    updated_at: timestamp,
    execute_turn_input: cloneExecuteTurnInput(input.workflow.nodes[0]?.execute_turn_input ?? {
      session_id: input.workflow.session_id,
      model_profile: 'default',
      url: 'https://model-provider.invalid/',
      messages: [],
    }),
    messages: [],
    history: [],
    turn_count: 0,
    tool_call_count: 0,
    continuations: [
      {
        sequence: 0,
        kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.CREATED,
        timestamp,
      },
    ],
    workflow: {
      nodes: input.workflow.nodes.map((node) => ({
        node_id: node.id,
        status: AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.PENDING,
        execute_turn_input: cloneExecuteTurnInput(node.execute_turn_input),
        depends_on: [...(node.depends_on ?? [])],
        ...(node.wake_at ? { wake_at: node.wake_at } : {}),
        messages: [...node.execute_turn_input.messages],
        history: [],
        turn_count: 0,
        tool_call_count: 0,
      })),
    },
  };

  const workflowNodes = workflowState.workflow?.nodes;
  if (!workflowNodes) {
    throw new Error(
      `Workflow session "${input.workflow.session_id}" could not be initialized because no workflow nodes were materialized.`,
    );
  }
  assertWorkflowDefinitions(workflowNodes);

  const result = await advanceGovernedAgentWorkflowState({
    runtime: input.runtime,
    state: workflowState,
    createContext: input.createContext,
    maxTurnsPerInvocation: input.maxTurnsPerInvocation,
    timestamp,
  });

  const store = createAgentRuntimeWorkflowStateStore({
    workspaceRoot: input.storageRoot,
  });
  await store.save(result.state);
  return result.result;
}

export async function resumeGovernedAgentWorkflow(
  input: ResumeGovernedAgentWorkflowInput,
): Promise<AgentRuntimeWorkflowAdvanceResult> {
  const store = createAgentRuntimeWorkflowStateStore({
    workspaceRoot: input.storageRoot,
  });
  const existing = await store.load(input.sessionId);
  if (!existing?.workflow) {
    throw new Error(
      `No persisted workflow graph found for session "${input.sessionId}". Start the workflow before attempting to resume it.`,
    );
  }

  const timestamp = resolveCurrentTimestamp(input.now);
  const resumedNodes = existing.workflow.nodes.map((node) => {
    const continuationMessages = input.continuationMessagesByNodeId?.[node.node_id] ?? [];
    if (continuationMessages.length === 0) {
      return node;
    }

    return {
      ...node,
      messages: [...node.messages, ...continuationMessages],
      pending_request_id: undefined,
      requested_tool: undefined,
    };
  });

  const resumedState: AgentRuntimeWorkflowState = {
    ...existing,
    status: AGENT_RUNTIME_WORKFLOW_STATUSES.ACTIVE,
    updated_at: timestamp,
    workflow: {
      nodes: resumedNodes,
    },
    continuations: appendWorkflowContinuation(existing.continuations, {
      kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.RESUMED,
      timestamp,
    }),
    next_wake_at: undefined,
  };

  const result = await advanceGovernedAgentWorkflowState({
    runtime: input.runtime,
    state: resumedState,
    createContext: input.createContext,
    maxTurnsPerInvocation: input.maxTurnsPerInvocation,
    timestamp,
  });

  await store.save(result.state);
  return result.result;
}

async function advanceGovernedAgentWorkflowState(input: {
  runtime: LoopRuntime;
  state: AgentRuntimeWorkflowState;
  createContext: (metadata: Record<string, unknown>) => ExecutionContext;
  maxTurnsPerInvocation?: number;
  timestamp: string;
}): Promise<{ state: AgentRuntimeWorkflowState; result: AgentRuntimeWorkflowAdvanceResult }> {
  const workflow = input.state.workflow;
  if (!workflow) {
    throw new Error(
      `Workflow state for session "${input.state.session_id}" is missing the workflow graph payload.`,
    );
  }

  let state: AgentRuntimeWorkflowState = {
    ...input.state,
    workflow: {
      nodes: workflow.nodes.map((node) => ({
        ...node,
        messages: [...node.messages],
        history: [...node.history],
      })),
    },
    next_wake_at: undefined,
  };

  while (true) {
    const currentWorkflow = state.workflow;
    if (!currentWorkflow) {
      throw new Error(
        `Workflow state for session "${state.session_id}" is missing workflow nodes during advancement.`,
      );
    }

    const readyNodes = getReadyWorkflowNodes(state, input.timestamp);
    if (readyNodes.length === 0) {
      const scheduledNodes = getScheduledWorkflowNodes(state, input.timestamp);
      if (scheduledNodes.length > 0) {
        const nextWakeAt = scheduledNodes
          .map((node) => node.wake_at)
          .filter((value): value is string => typeof value === 'string')
          .sort()[0];

        const scheduledNodeIds = new Set(scheduledNodes.map((node) => node.node_id));

        const scheduledState: AgentRuntimeWorkflowState = {
          ...state,
          status: AGENT_RUNTIME_WORKFLOW_STATUSES.SCHEDULED,
          updated_at: input.timestamp,
          next_wake_at: nextWakeAt,
          workflow: {
            nodes: currentWorkflow.nodes.map((node) =>
              scheduledNodeIds.has(node.node_id)
                ? { ...node, status: AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.SCHEDULED }
                : node,
            ),
          },
          continuations: scheduledNodes.reduce(
            (continuations, node) =>
              hasContinuationForNode(
                continuations,
                AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.SCHEDULED,
                node.node_id,
              )
                ? continuations
                : appendWorkflowContinuation(continuations, {
                    kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.SCHEDULED,
                    timestamp: input.timestamp,
                    reason: WORKFLOW_SCHEDULED_REASON,
                    node_id: node.node_id,
                  }),
            state.continuations,
          ),
        };

        return {
          state: scheduledState,
          result: {
            kind: 'scheduled',
            next_wake_at: nextWakeAt ?? input.timestamp,
            scheduled_node_ids: scheduledNodes.map((node) => node.node_id),
            completed_node_ids: getCompletedNodeIds(scheduledState),
          },
        };
      }

      if (allWorkflowNodesCompleted(state)) {
        const completedState: AgentRuntimeWorkflowState = {
          ...state,
          status: AGENT_RUNTIME_WORKFLOW_STATUSES.COMPLETED,
          updated_at: input.timestamp,
          continuations: appendWorkflowContinuation(state.continuations, {
            kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.COMPLETED,
            timestamp: input.timestamp,
            reason: WORKFLOW_COMPLETED_REASON,
          }),
        };

        return {
          state: completedState,
          result: {
            kind: 'completed',
            completed_node_ids: getCompletedNodeIds(completedState),
          },
        };
      }

      return {
        state: {
          ...state,
          status: AGENT_RUNTIME_WORKFLOW_STATUSES.ERROR,
          updated_at: input.timestamp,
          continuations: appendWorkflowContinuation(state.continuations, {
            kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.ERROR,
            timestamp: input.timestamp,
            reason: 'Workflow has incomplete nodes but no ready or scheduled work.',
          }),
        },
        result: {
          kind: 'error',
          node_id: 'workflow',
          error: {
            code: 'AGENT_RUNTIME_WORKFLOW_STALLED',
            message: 'Workflow cannot make progress because no nodes are ready or scheduled.',
          },
        },
      };
    }

    const node = readyNodes[0];
    if (!node) {
      continue;
    }

    const nodeResult = await runGovernedAgentLoopInternal({
      runtime: input.runtime,
      executeTurnInput: {
        ...cloneExecuteTurnInput(node.execute_turn_input),
        messages: [...node.messages],
      },
      createContext: (metadata) =>
        input.createContext({
          ...metadata,
          [AGENT_RUNTIME_AGENT_WORKFLOW_NODE_ID_METADATA_KEY]: node.node_id,
        }),
      maxTurns: input.maxTurnsPerInvocation,
      turnBudgetBehavior: 'suspend',
      initialCursor: {
        messages: node.messages,
        history: node.history,
        turnCount: node.turn_count,
        toolCallCount: node.tool_call_count,
      },
    });

    state = updateWorkflowStateForNodeResult(state, node.node_id, nodeResult, input.timestamp);

    if (nodeResult.kind === 'approval_required') {
      return {
        state,
        result: {
          kind: 'approval_required',
          node_id: node.node_id,
          pending_request_id: nodeResult.pending_request_id,
          requested_tool: nodeResult.requested_tool,
        },
      };
    }

    if (nodeResult.kind === 'suspended') {
      return {
        state,
        result: {
          kind: 'suspended',
          node_id: node.node_id,
        },
      };
    }

    if (nodeResult.kind === 'error') {
      return {
        state,
        result: {
          kind: 'error',
          node_id: node.node_id,
          error: nodeResult.error,
        },
      };
    }
  }
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
    ...(isRecord(value.workflow)
      ? { workflow: parseWorkflowGraphState(value.workflow, `${filePath}.workflow`) }
      : {}),
    ...(typeof value.next_wake_at === 'string' ? { next_wake_at: value.next_wake_at } : {}),
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
      ...(typeof entry.node_id === 'string' ? { node_id: entry.node_id } : {}),
    };
  });
}

function parseWorkflowGraphState(
  value: Record<string, unknown>,
  filePath: string,
): AgentRuntimeWorkflowGraphState {
  if (!Array.isArray(value.nodes)) {
    throw new Error(
      `Failed to parse workflow state at ${filePath}.nodes: expected an array of workflow nodes.`,
    );
  }

  return {
    nodes: value.nodes.map((entry, index) =>
      parseWorkflowNodeState(entry, `${filePath}.nodes[${index}]`),
    ),
  };
}

function parseWorkflowNodeState(
  value: unknown,
  filePath: string,
): AgentRuntimeWorkflowNodeState {
  if (!isRecord(value)) {
    throw new Error(`Failed to parse workflow state at ${filePath}: workflow node is invalid.`);
  }

  const requestedTool = parseWorkflowRequestedTool(value.requested_tool);
  const lastTurn = normalizeTurnOutput(value.last_turn);

  return {
    node_id: readRequiredString(value.node_id, `${filePath}.node_id`),
    status: readRequiredString(
      value.status,
      `${filePath}.status`,
    ) as AgentRuntimeWorkflowNodeStatus,
    execute_turn_input: parseWorkflowExecuteTurnInput(
      value.execute_turn_input,
      `${filePath}.execute_turn_input`,
    ),
    depends_on: Array.isArray(value.depends_on)
      ? value.depends_on.map((entry, index) =>
          readRequiredString(entry, `${filePath}.depends_on[${index}]`),
        )
      : [],
    ...(typeof value.wake_at === 'string' ? { wake_at: value.wake_at } : {}),
    messages: parseWorkflowMessages(value.messages, `${filePath}.messages`),
    history: parseWorkflowHistory(value.history, `${filePath}.history`),
    turn_count: readWorkflowCount(value.turn_count, `${filePath}.turn_count`),
    tool_call_count: readWorkflowCount(value.tool_call_count, `${filePath}.tool_call_count`),
    ...(typeof value.pending_request_id === 'string'
      ? { pending_request_id: value.pending_request_id }
      : {}),
    ...(requestedTool ? { requested_tool: requestedTool } : {}),
    ...(lastTurn ? { last_turn: lastTurn } : {}),
  };
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

function resolveCurrentTimestamp(now?: () => string): string {
  return now ? now() : new Date().toISOString();
}

function assertWorkflowDefinitions(nodes: readonly AgentRuntimeWorkflowNodeState[]): void {
  const ids = new Set(nodes.map((node) => node.node_id));
  if (ids.size !== nodes.length) {
    throw new Error(
      'Workflow definition contains duplicate node IDs. Each workflow node must declare a unique id.',
    );
  }

  for (const node of nodes) {
    for (const dependencyId of node.depends_on) {
      if (!ids.has(dependencyId)) {
        throw new Error(
          `Workflow node "${node.node_id}" depends on "${dependencyId}", but that node is not defined.`,
        );
      }
    }
  }
}

function getReadyWorkflowNodes(
  state: AgentRuntimeWorkflowState,
  timestamp: string,
): AgentRuntimeWorkflowNodeState[] {
  const workflow = state.workflow;
  if (!workflow) {
    return [];
  }

  return workflow.nodes.filter((node) => isWorkflowNodeReady(node, workflow.nodes, timestamp));
}

function getScheduledWorkflowNodes(
  state: AgentRuntimeWorkflowState,
  timestamp: string,
): AgentRuntimeWorkflowNodeState[] {
  const workflow = state.workflow;
  if (!workflow) {
    return [];
  }

  return workflow.nodes.filter(
    (node) =>
      node.status !== AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.COMPLETED &&
      node.status !== AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.ERROR &&
      node.status !== AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.WAITING_APPROVAL &&
      typeof node.wake_at === 'string' &&
      node.wake_at > timestamp &&
      areWorkflowDependenciesCompleted(node, workflow.nodes),
  );
}

function isWorkflowNodeReady(
  node: AgentRuntimeWorkflowNodeState,
  allNodes: readonly AgentRuntimeWorkflowNodeState[],
  timestamp: string,
): boolean {
  if (
    node.status === AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.COMPLETED ||
    node.status === AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.ERROR ||
    node.status === AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.WAITING_APPROVAL
  ) {
    return false;
  }

  if (!areWorkflowDependenciesCompleted(node, allNodes)) {
    return false;
  }

  if (typeof node.wake_at === 'string' && node.wake_at > timestamp) {
    return false;
  }

  return true;
}

function areWorkflowDependenciesCompleted(
  node: AgentRuntimeWorkflowNodeState,
  allNodes: readonly AgentRuntimeWorkflowNodeState[],
): boolean {
  return node.depends_on.every((dependencyId) =>
    allNodes.some(
      (candidate) =>
        candidate.node_id === dependencyId &&
        candidate.status === AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.COMPLETED,
    ),
  );
}

function updateWorkflowStateForNodeResult(
  state: AgentRuntimeWorkflowState,
  nodeId: string,
  result: AgentRuntimePersistedSessionResult,
  timestamp: string,
): AgentRuntimeWorkflowState {
  const workflow = state.workflow;
  if (!workflow) {
    return state;
  }

  const updatedNodes = workflow.nodes.map((node) => {
    if (node.node_id !== nodeId) {
      return node;
    }

    const baseNode = {
      ...node,
      messages: result.messages,
      history: result.history,
      turn_count: result.turn_count,
      tool_call_count: result.tool_call_count,
      pending_request_id: undefined,
      requested_tool: undefined,
    };

    if (result.kind === 'completed') {
      return {
        ...baseNode,
        status: AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.COMPLETED,
        last_turn: result.final_turn,
      };
    }

    if (result.kind === 'approval_required') {
      return {
        ...baseNode,
        status: AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.WAITING_APPROVAL,
        pending_request_id: result.pending_request_id,
        requested_tool: result.requested_tool,
        last_turn: result.last_turn,
      };
    }

    if (result.kind === 'suspended') {
      return {
        ...baseNode,
        status: AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.SUSPENDED,
      };
    }

    return {
      ...baseNode,
      status: AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.ERROR,
    };
  });

  let continuations = state.continuations;
  if (result.kind === 'completed') {
    continuations = appendWorkflowContinuation(continuations, {
      kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.BRANCH_COMPLETED,
      timestamp,
      node_id: nodeId,
    });
  } else if (result.kind === 'approval_required') {
    continuations = appendWorkflowContinuation(continuations, {
      kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.APPROVAL_REQUIRED,
      timestamp,
      reason: WORKFLOW_WAITING_REASON,
      request_id: result.pending_request_id,
      node_id: nodeId,
    });
  } else if (result.kind === 'suspended') {
    continuations = appendWorkflowContinuation(continuations, {
      kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.SUSPENDED,
      timestamp,
      reason: WORKFLOW_SUSPEND_REASON,
      node_id: nodeId,
    });
  } else {
    continuations = appendWorkflowContinuation(continuations, {
      kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.ERROR,
      timestamp,
      reason: result.error.message,
      node_id: nodeId,
    });
  }

  for (const node of updatedNodes) {
    if (
      node.depends_on.length > 1 &&
      isWorkflowNodeReady(node, updatedNodes, timestamp) &&
      !hasContinuationForNode(
        continuations,
        AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.JOIN_READY,
        node.node_id,
      )
    ) {
      continuations = appendWorkflowContinuation(continuations, {
        kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.JOIN_READY,
        timestamp,
        reason: WORKFLOW_JOIN_READY_REASON,
        node_id: node.node_id,
      });
    }

    if (
      typeof node.wake_at === 'string' &&
      node.wake_at <= timestamp &&
      !hasContinuationForNode(
        continuations,
        AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.WAKEUP,
        node.node_id,
      ) &&
      areWorkflowDependenciesCompleted(node, updatedNodes)
    ) {
      continuations = appendWorkflowContinuation(continuations, {
        kind: AGENT_RUNTIME_WORKFLOW_CONTINUATION_KINDS.WAKEUP,
        timestamp,
        reason: WORKFLOW_WAKEUP_REASON,
        node_id: node.node_id,
      });
    }
  }

  return {
    ...state,
    status: deriveWorkflowStatus(updatedNodes),
    updated_at: timestamp,
    workflow: {
      nodes: updatedNodes,
    },
    continuations,
    next_wake_at: undefined,
  };
}

function deriveWorkflowStatus(
  nodes: readonly AgentRuntimeWorkflowNodeState[],
): AgentRuntimeWorkflowStatus {
  if (nodes.every((node) => node.status === AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.COMPLETED)) {
    return AGENT_RUNTIME_WORKFLOW_STATUSES.COMPLETED;
  }
  if (nodes.some((node) => node.status === AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.WAITING_APPROVAL)) {
    return AGENT_RUNTIME_WORKFLOW_STATUSES.WAITING_APPROVAL;
  }
  if (nodes.some((node) => node.status === AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.ERROR)) {
    return AGENT_RUNTIME_WORKFLOW_STATUSES.ERROR;
  }
  if (nodes.some((node) => node.status === AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.SUSPENDED)) {
    return AGENT_RUNTIME_WORKFLOW_STATUSES.SUSPENDED;
  }
  return AGENT_RUNTIME_WORKFLOW_STATUSES.ACTIVE;
}

function allWorkflowNodesCompleted(state: AgentRuntimeWorkflowState): boolean {
  return (
    state.workflow?.nodes.every(
      (node) => node.status === AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.COMPLETED,
    ) ?? false
  );
}

function getCompletedNodeIds(state: AgentRuntimeWorkflowState): string[] {
  return (
    state.workflow?.nodes
      .filter((node) => node.status === AGENT_RUNTIME_WORKFLOW_NODE_STATUSES.COMPLETED)
      .map((node) => node.node_id) ?? []
  );
}

function hasContinuationForNode(
  continuations: readonly AgentRuntimeWorkflowContinuation[],
  kind: AgentRuntimeWorkflowContinuationKind,
  nodeId: string,
): boolean {
  return continuations.some(
    (continuation) => continuation.kind === kind && continuation.node_id === nodeId,
  );
}
