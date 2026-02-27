// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { getStoragePort } from './storage.js';
import {
  asNonEmptyString,
  buildAuditEvent,
  failure,
  nowIso,
  success,
  toRecord,
  type ToolContextLike,
  type ToolOutput,
} from './shared.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAMES = {
  INIT: 'sidekick:init',
  STATUS: 'sidekick:status',
  EXPORT: 'sidekick:export',
} as const;

const STORE_NAMES = ['tasks', 'memories', 'channels', 'messages', 'routines'] as const;

// ---------------------------------------------------------------------------
// sidekick:init (idempotent)
// ---------------------------------------------------------------------------

async function initTool(context?: ToolContextLike): Promise<ToolOutput> {
  const storage = getStoragePort();

  // Touch every store to ensure directories and files are created
  for (const store of STORE_NAMES) {
    await storage.readStore(store);
  }

  await storage.appendAudit(
    buildAuditEvent({
      tool: TOOL_NAMES.INIT,
      op: 'create',
      context,
      details: { root_dir: storage.getRootDir() },
    }),
  );

  return success({
    initialized: true,
    root_dir: storage.getRootDir(),
  });
}

// ---------------------------------------------------------------------------
// sidekick:status
// ---------------------------------------------------------------------------

async function statusTool(context?: ToolContextLike): Promise<ToolOutput> {
  const storage = getStoragePort();
  const [tasks, memories, channels, messages, routines, audit] = await Promise.all([
    storage.readStore('tasks'),
    storage.readStore('memories'),
    storage.readStore('channels'),
    storage.readStore('messages'),
    storage.readStore('routines'),
    storage.readAuditEvents(),
  ]);

  const pendingTasks = tasks.filter((task) => task.status === 'pending').length;
  const completedTasks = tasks.filter((task) => task.status === 'done').length;

  await storage.appendAudit(
    buildAuditEvent({
      tool: TOOL_NAMES.STATUS,
      op: 'read',
      context,
      details: { task_count: tasks.length },
    }),
  );

  return success({
    task_count: tasks.length,
    pending_tasks: pendingTasks,
    completed_tasks: completedTasks,
    memory_entries: memories.length,
    channels: channels.length,
    messages: messages.length,
    routines: routines.length,
    audit_events: audit.length,
  });
}

// ---------------------------------------------------------------------------
// sidekick:export (READ-ONLY -- returns data, no file write)
// ---------------------------------------------------------------------------

async function exportTool(input: unknown, context?: ToolContextLike): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const includeAudit = parsed.include_audit !== false;

  const storage = getStoragePort();
  const [tasks, memories, channels, messages, routines, audit] = await Promise.all([
    storage.readStore('tasks'),
    storage.readStore('memories'),
    storage.readStore('channels'),
    storage.readStore('messages'),
    storage.readStore('routines'),
    storage.readAuditEvents(),
  ]);

  await storage.appendAudit(
    buildAuditEvent({
      tool: TOOL_NAMES.EXPORT,
      op: 'export',
      context,
      details: { include_audit: includeAudit },
    }),
  );

  return success({
    exported_at: nowIso(),
    version: '0.1.0',
    data: {
      tasks,
      memories,
      channels,
      messages,
      routines,
      ...(includeAudit ? { audit } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Router (default export)
// ---------------------------------------------------------------------------

export default async function systemTools(
  input: unknown,
  context?: ToolContextLike,
): Promise<ToolOutput> {
  const toolName = asNonEmptyString(context?.tool_name) ?? '';

  switch (toolName) {
    case TOOL_NAMES.INIT:
      return initTool(context);
    case TOOL_NAMES.STATUS:
      return statusTool(context);
    case TOOL_NAMES.EXPORT:
      return exportTool(input, context);
    default:
      return failure('UNKNOWN_TOOL', `Unknown system tool: ${toolName || 'unknown'}`);
  }
}
