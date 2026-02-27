// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { getStoragePort, type MemoryRecord, type MemoryType } from './storage.js';
import {
  asInteger,
  asNonEmptyString,
  asStringArray,
  buildAuditEvent,
  createId,
  failure,
  includesText,
  isDryRun,
  matchesTags,
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
  STORE: 'memory:store',
  RECALL: 'memory:recall',
  FORGET: 'memory:forget',
} as const;

const VALID_MEMORY_TYPES: MemoryType[] = ['fact', 'preference', 'note'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asMemoryType(value: unknown): MemoryType | null {
  return VALID_MEMORY_TYPES.includes(value as MemoryType) ? (value as MemoryType) : null;
}

// ---------------------------------------------------------------------------
// memory:store
// ---------------------------------------------------------------------------

async function memoryStoreTool(input: unknown, context?: ToolContextLike): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const type = asMemoryType(parsed.type);
  const content = asNonEmptyString(parsed.content);

  if (!type) {
    return failure('INVALID_INPUT', 'type must be one of fact, preference, note.');
  }
  if (!content) {
    return failure('INVALID_INPUT', 'content is required.');
  }

  const memory: MemoryRecord = {
    id: createId('mem'),
    type,
    content,
    tags: asStringArray(parsed.tags),
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  if (isDryRun(parsed)) {
    return success({
      dry_run: true,
      memory: memory as unknown as Record<string, unknown>,
    });
  }

  const storage = getStoragePort();
  await storage.withLock(async () => {
    const memories = await storage.readStore('memories');
    memories.push(memory);
    await storage.writeStore('memories', memories);
    await storage.appendAudit(
      buildAuditEvent({
        tool: TOOL_NAMES.STORE,
        op: 'create',
        context,
        ids: [memory.id],
      }),
    );
  });

  return success({ memory: memory as unknown as Record<string, unknown> });
}

// ---------------------------------------------------------------------------
// memory:recall
// ---------------------------------------------------------------------------

async function memoryRecallTool(input: unknown, _context?: ToolContextLike): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const query = asNonEmptyString(parsed.query);
  const type = asMemoryType(parsed.type);
  const tags = asStringArray(parsed.tags);
  const limit = asInteger(parsed.limit);

  const storage = getStoragePort();
  const memories = await storage.readStore('memories');

  const filtered = memories.filter((memory) => {
    if (type && memory.type !== type) {
      return false;
    }
    if (!matchesTags(tags, memory.tags)) {
      return false;
    }
    if (!includesText(memory.content, query)) {
      return false;
    }
    return true;
  });

  const sorted = filtered.toSorted((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));

  const items = limit && limit > 0 ? sorted.slice(0, limit) : sorted;

  return success({
    items: items as unknown as Record<string, unknown>,
    count: items.length,
  });
}

// ---------------------------------------------------------------------------
// memory:forget
// ---------------------------------------------------------------------------

async function memoryForgetTool(input: unknown, context?: ToolContextLike): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const id = asNonEmptyString(parsed.id);

  if (!id) {
    return failure('INVALID_INPUT', 'id is required.');
  }

  const storage = getStoragePort();
  const memories = await storage.readStore('memories');
  const exists = memories.some((memory) => memory.id === id);

  if (!exists) {
    return failure('NOT_FOUND', `memory ${id} was not found.`);
  }

  if (isDryRun(parsed)) {
    return success({ dry_run: true, deleted_id: id });
  }

  await storage.withLock(async () => {
    const latest = await storage.readStore('memories');
    const remaining = latest.filter((memory) => memory.id !== id);
    await storage.writeStore('memories', remaining);
    await storage.appendAudit(
      buildAuditEvent({
        tool: TOOL_NAMES.FORGET,
        op: 'delete',
        context,
        ids: [id],
      }),
    );
  });

  return success({ deleted_id: id });
}

// ---------------------------------------------------------------------------
// Router (default export)
// ---------------------------------------------------------------------------

export default async function memoryTools(
  input: unknown,
  context?: ToolContextLike,
): Promise<ToolOutput> {
  switch (context?.tool_name) {
    case TOOL_NAMES.STORE:
      return memoryStoreTool(input, context);
    case TOOL_NAMES.RECALL:
      return memoryRecallTool(input, context);
    case TOOL_NAMES.FORGET:
      return memoryForgetTool(input, context);
    default:
      return failure('UNKNOWN_TOOL', `Unknown memory tool: ${context?.tool_name ?? 'unknown'}`);
  }
}
