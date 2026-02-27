// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import path from 'node:path';
import { rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FsStoragePort, runWithStoragePort, type StoragePort } from '../tool-impl/storage.js';

// ---------------------------------------------------------------------------
// Deferred imports -- modules under test created during implementation
// ---------------------------------------------------------------------------

// Task tools
import taskTools from '../tool-impl/task-tools.js';
// Memory tools
import memoryTools from '../tool-impl/memory-tools.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_ROOT = path.join(import.meta.dirname ?? __dirname, '.tmp-tools-test');

function makePort(): FsStoragePort {
  return new FsStoragePort(TEST_ROOT);
}

function ctx(toolName: string) {
  return { tool_name: toolName, receipt_id: 'test-receipt' };
}

async function withPort<T>(port: StoragePort, fn: () => Promise<T>): Promise<T> {
  return runWithStoragePort(port, fn);
}

// ============================================================================
// TASK TOOLS
// ============================================================================

describe('task:create', () => {
  let port: FsStoragePort;

  beforeEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
    port = makePort();
  });

  afterEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  it('returns contract-compliant output with success=true and data.task', async () => {
    const result = await withPort(port, () => taskTools({ title: 'Buy milk' }, ctx('task:create')));
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    const data = result.data as Record<string, unknown>;
    const task = data.task as Record<string, unknown>;
    expect(task.id).toMatch(/^task-/);
    expect(task.title).toBe('Buy milk');
    expect(task.status).toBe('pending');
    expect(task.priority).toBe('P2');
  });

  it('persists the task to the store', async () => {
    await withPort(port, () => taskTools({ title: 'Persisted' }, ctx('task:create')));
    const tasks = await port.readStore('tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe('Persisted');
  });

  it('appends an audit event on create', async () => {
    await withPort(port, () => taskTools({ title: 'Audited' }, ctx('task:create')));
    const events = await port.readAuditEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.tool).toBe('task:create');
    expect(events[0]?.op).toBe('create');
  });

  it('dry_run returns the task but does NOT persist', async () => {
    const result = await withPort(port, () =>
      taskTools({ title: 'Dry', dry_run: true }, ctx('task:create')),
    );
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.dry_run).toBe(true);
    expect((data.task as Record<string, unknown>).title).toBe('Dry');

    // No writes
    const tasks = await port.readStore('tasks');
    expect(tasks).toHaveLength(0);
    const events = await port.readAuditEvents();
    expect(events).toHaveLength(0);
  });

  it('rejects missing title', async () => {
    const result = await withPort(port, () => taskTools({}, ctx('task:create')));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('accepts optional priority, due_at, tags, description', async () => {
    const result = await withPort(port, () =>
      taskTools(
        {
          title: 'Full',
          priority: 'P0',
          due_at: '2026-03-01T00:00:00Z',
          tags: ['urgent'],
          description: 'desc',
        },
        ctx('task:create'),
      ),
    );
    expect(result.success).toBe(true);
    const task = (result.data as Record<string, unknown>).task as Record<string, unknown>;
    expect(task.priority).toBe('P0');
    expect(task.due_at).toBe('2026-03-01T00:00:00Z');
    expect(task.tags).toEqual(['urgent']);
    expect(task.description).toBe('desc');
  });
});

describe('task:list', () => {
  let port: FsStoragePort;

  beforeEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
    port = makePort();
  });

  afterEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  it('returns empty items when no tasks exist', async () => {
    const result = await withPort(port, () => taskTools({}, ctx('task:list')));
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.items).toEqual([]);
    expect(data.count).toBe(0);
  });

  it('returns all tasks by default', async () => {
    await withPort(port, () => taskTools({ title: 'A' }, ctx('task:create')));
    await withPort(port, () => taskTools({ title: 'B' }, ctx('task:create')));
    const result = await withPort(port, () => taskTools({}, ctx('task:list')));
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).count).toBe(2);
  });

  it('filters by status', async () => {
    await withPort(port, () => taskTools({ title: 'Open' }, ctx('task:create')));
    const result = await withPort(port, () => taskTools({ status: 'done' }, ctx('task:list')));
    expect((result.data as Record<string, unknown>).count).toBe(0);
  });

  it('filters by priority', async () => {
    await withPort(port, () => taskTools({ title: 'Low', priority: 'P3' }, ctx('task:create')));
    await withPort(port, () => taskTools({ title: 'High', priority: 'P0' }, ctx('task:create')));
    const result = await withPort(port, () => taskTools({ priority: 'P0' }, ctx('task:list')));
    expect((result.data as Record<string, unknown>).count).toBe(1);
  });

  it('filters by tags', async () => {
    await withPort(port, () => taskTools({ title: 'Tagged', tags: ['work'] }, ctx('task:create')));
    await withPort(port, () => taskTools({ title: 'Untagged' }, ctx('task:create')));
    const result = await withPort(port, () => taskTools({ tags: ['work'] }, ctx('task:list')));
    expect((result.data as Record<string, unknown>).count).toBe(1);
  });

  it('filters by due_before', async () => {
    await withPort(port, () =>
      taskTools({ title: 'Soon', due_at: '2026-01-01T00:00:00Z' }, ctx('task:create')),
    );
    await withPort(port, () =>
      taskTools({ title: 'Later', due_at: '2027-01-01T00:00:00Z' }, ctx('task:create')),
    );
    const result = await withPort(port, () =>
      taskTools({ due_before: '2026-06-01T00:00:00Z' }, ctx('task:list')),
    );
    expect((result.data as Record<string, unknown>).count).toBe(1);
  });

  it('respects limit', async () => {
    await withPort(port, () => taskTools({ title: 'A' }, ctx('task:create')));
    await withPort(port, () => taskTools({ title: 'B' }, ctx('task:create')));
    const result = await withPort(port, () => taskTools({ limit: 1 }, ctx('task:list')));
    expect((result.data as Record<string, unknown>).count).toBe(1);
  });
});

describe('task:complete', () => {
  let port: FsStoragePort;

  beforeEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
    port = makePort();
  });

  afterEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  it('marks a task as done and appends audit', async () => {
    const createResult = await withPort(port, () =>
      taskTools({ title: 'To complete' }, ctx('task:create')),
    );
    const taskId = ((createResult.data as Record<string, unknown>).task as Record<string, unknown>)
      .id as string;

    const result = await withPort(port, () => taskTools({ id: taskId }, ctx('task:complete')));
    expect(result.success).toBe(true);
    const task = (result.data as Record<string, unknown>).task as Record<string, unknown>;
    expect(task.status).toBe('done');
    expect(task.completed_at).toBeDefined();

    const events = await port.readAuditEvents();
    const completeEvents = events.filter((e) => e.tool === 'task:complete');
    expect(completeEvents).toHaveLength(1);
  });

  it('dry_run does NOT persist completion', async () => {
    const createResult = await withPort(port, () =>
      taskTools({ title: 'Dry complete' }, ctx('task:create')),
    );
    const taskId = ((createResult.data as Record<string, unknown>).task as Record<string, unknown>)
      .id as string;

    const result = await withPort(port, () =>
      taskTools({ id: taskId, dry_run: true }, ctx('task:complete')),
    );
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).dry_run).toBe(true);

    // Task should still be pending
    const tasks = await port.readStore('tasks');
    const task = tasks.find((t) => t.id === taskId);
    expect(task?.status).toBe('pending');
  });

  it('returns NOT_FOUND for unknown id', async () => {
    const result = await withPort(port, () =>
      taskTools({ id: 'task-nonexistent' }, ctx('task:complete')),
    );
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('rejects missing id', async () => {
    const result = await withPort(port, () => taskTools({}, ctx('task:complete')));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });
});

describe('task:schedule', () => {
  let port: FsStoragePort;

  beforeEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
    port = makePort();
  });

  afterEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  it('sets due_at on a task', async () => {
    const createResult = await withPort(port, () =>
      taskTools({ title: 'Schedule me' }, ctx('task:create')),
    );
    const taskId = ((createResult.data as Record<string, unknown>).task as Record<string, unknown>)
      .id as string;

    const result = await withPort(port, () =>
      taskTools({ id: taskId, due_at: '2026-06-01T00:00:00Z' }, ctx('task:schedule')),
    );
    expect(result.success).toBe(true);
    const task = (result.data as Record<string, unknown>).task as Record<string, unknown>;
    expect(task.due_at).toBe('2026-06-01T00:00:00Z');
  });

  it('sets cron on a task', async () => {
    const createResult = await withPort(port, () =>
      taskTools({ title: 'Recurring' }, ctx('task:create')),
    );
    const taskId = ((createResult.data as Record<string, unknown>).task as Record<string, unknown>)
      .id as string;

    const result = await withPort(port, () =>
      taskTools({ id: taskId, cron: '0 9 * * *' }, ctx('task:schedule')),
    );
    expect(result.success).toBe(true);
    const task = (result.data as Record<string, unknown>).task as Record<string, unknown>;
    expect(task.cron).toBe('0 9 * * *');
  });

  it('appends audit event on schedule', async () => {
    const createResult = await withPort(port, () =>
      taskTools({ title: 'Audit schedule' }, ctx('task:create')),
    );
    const taskId = ((createResult.data as Record<string, unknown>).task as Record<string, unknown>)
      .id as string;

    await withPort(port, () =>
      taskTools({ id: taskId, due_at: '2026-06-01T00:00:00Z' }, ctx('task:schedule')),
    );
    const events = await port.readAuditEvents();
    const scheduleEvents = events.filter((e) => e.tool === 'task:schedule');
    expect(scheduleEvents).toHaveLength(1);
  });

  it('dry_run does NOT persist schedule changes', async () => {
    const createResult = await withPort(port, () =>
      taskTools({ title: 'Dry schedule' }, ctx('task:create')),
    );
    const taskId = ((createResult.data as Record<string, unknown>).task as Record<string, unknown>)
      .id as string;

    const result = await withPort(port, () =>
      taskTools(
        { id: taskId, due_at: '2026-12-25T00:00:00Z', dry_run: true },
        ctx('task:schedule'),
      ),
    );
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).dry_run).toBe(true);

    const tasks = await port.readStore('tasks');
    const task = tasks.find((t) => t.id === taskId);
    expect(task?.due_at).toBeUndefined();
  });

  it('returns NOT_FOUND for unknown id', async () => {
    const result = await withPort(port, () =>
      taskTools({ id: 'task-nonexistent' }, ctx('task:schedule')),
    );
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });
});

// ============================================================================
// MEMORY TOOLS
// ============================================================================

describe('memory:store', () => {
  let port: FsStoragePort;

  beforeEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
    port = makePort();
  });

  afterEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  it('returns contract-compliant output with success=true and data.memory', async () => {
    const result = await withPort(port, () =>
      memoryTools({ type: 'fact', content: 'The sky is blue' }, ctx('memory:store')),
    );
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const memory = data.memory as Record<string, unknown>;
    expect(memory.id).toMatch(/^mem-/);
    expect(memory.type).toBe('fact');
    expect(memory.content).toBe('The sky is blue');
  });

  it('persists the memory entry', async () => {
    await withPort(port, () =>
      memoryTools({ type: 'note', content: 'Persisted entry' }, ctx('memory:store')),
    );
    const memories = await port.readStore('memories');
    expect(memories).toHaveLength(1);
    expect(memories[0]?.content).toBe('Persisted entry');
  });

  it('appends an audit event on store', async () => {
    await withPort(port, () =>
      memoryTools({ type: 'fact', content: 'Audited' }, ctx('memory:store')),
    );
    const events = await port.readAuditEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.tool).toBe('memory:store');
    expect(events[0]?.op).toBe('create');
  });

  it('dry_run returns entry but does NOT persist', async () => {
    const result = await withPort(port, () =>
      memoryTools({ type: 'fact', content: 'Dry store', dry_run: true }, ctx('memory:store')),
    );
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).dry_run).toBe(true);

    const memories = await port.readStore('memories');
    expect(memories).toHaveLength(0);
    const events = await port.readAuditEvents();
    expect(events).toHaveLength(0);
  });

  it('rejects missing type', async () => {
    const result = await withPort(port, () =>
      memoryTools({ content: 'No type' }, ctx('memory:store')),
    );
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('rejects missing content', async () => {
    const result = await withPort(port, () => memoryTools({ type: 'fact' }, ctx('memory:store')));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('accepts tags', async () => {
    const result = await withPort(port, () =>
      memoryTools({ type: 'preference', content: 'Dark mode', tags: ['ui'] }, ctx('memory:store')),
    );
    expect(result.success).toBe(true);
    const memory = (result.data as Record<string, unknown>).memory as Record<string, unknown>;
    expect(memory.tags).toEqual(['ui']);
  });
});

describe('memory:recall', () => {
  let port: FsStoragePort;

  beforeEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
    port = makePort();
  });

  afterEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  it('returns empty items when no memories exist', async () => {
    const result = await withPort(port, () => memoryTools({}, ctx('memory:recall')));
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).items).toEqual([]);
  });

  it('returns all memories by default', async () => {
    await withPort(port, () => memoryTools({ type: 'fact', content: 'A' }, ctx('memory:store')));
    await withPort(port, () => memoryTools({ type: 'note', content: 'B' }, ctx('memory:store')));
    const result = await withPort(port, () => memoryTools({}, ctx('memory:recall')));
    expect((result.data as Record<string, unknown>).count).toBe(2);
  });

  it('filters by substring query', async () => {
    await withPort(port, () =>
      memoryTools({ type: 'fact', content: 'TypeScript is great' }, ctx('memory:store')),
    );
    await withPort(port, () =>
      memoryTools({ type: 'fact', content: 'Python is nice' }, ctx('memory:store')),
    );
    const result = await withPort(port, () =>
      memoryTools({ query: 'typescript' }, ctx('memory:recall')),
    );
    expect((result.data as Record<string, unknown>).count).toBe(1);
  });

  it('filters by tag', async () => {
    await withPort(port, () =>
      memoryTools({ type: 'fact', content: 'Tagged', tags: ['dev'] }, ctx('memory:store')),
    );
    await withPort(port, () =>
      memoryTools({ type: 'fact', content: 'Untagged' }, ctx('memory:store')),
    );
    const result = await withPort(port, () => memoryTools({ tags: ['dev'] }, ctx('memory:recall')));
    expect((result.data as Record<string, unknown>).count).toBe(1);
  });

  it('filters by type', async () => {
    await withPort(port, () => memoryTools({ type: 'fact', content: 'Fact' }, ctx('memory:store')));
    await withPort(port, () =>
      memoryTools({ type: 'preference', content: 'Pref' }, ctx('memory:store')),
    );
    const result = await withPort(port, () => memoryTools({ type: 'fact' }, ctx('memory:recall')));
    expect((result.data as Record<string, unknown>).count).toBe(1);
  });

  it('respects limit', async () => {
    await withPort(port, () => memoryTools({ type: 'fact', content: 'A' }, ctx('memory:store')));
    await withPort(port, () => memoryTools({ type: 'fact', content: 'B' }, ctx('memory:store')));
    const result = await withPort(port, () => memoryTools({ limit: 1 }, ctx('memory:recall')));
    expect((result.data as Record<string, unknown>).count).toBe(1);
  });
});

describe('memory:forget', () => {
  let port: FsStoragePort;

  beforeEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
    port = makePort();
  });

  afterEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  it('removes a memory entry and appends audit', async () => {
    const storeResult = await withPort(port, () =>
      memoryTools({ type: 'fact', content: 'To forget' }, ctx('memory:store')),
    );
    const memId = ((storeResult.data as Record<string, unknown>).memory as Record<string, unknown>)
      .id as string;

    const result = await withPort(port, () => memoryTools({ id: memId }, ctx('memory:forget')));
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).deleted_id).toBe(memId);

    const memories = await port.readStore('memories');
    expect(memories).toHaveLength(0);

    const events = await port.readAuditEvents();
    const forgetEvents = events.filter((e) => e.tool === 'memory:forget');
    expect(forgetEvents).toHaveLength(1);
    expect(forgetEvents[0]?.op).toBe('delete');
  });

  it('dry_run does NOT persist deletion', async () => {
    const storeResult = await withPort(port, () =>
      memoryTools({ type: 'fact', content: 'Keep me' }, ctx('memory:store')),
    );
    const memId = ((storeResult.data as Record<string, unknown>).memory as Record<string, unknown>)
      .id as string;

    const result = await withPort(port, () =>
      memoryTools({ id: memId, dry_run: true }, ctx('memory:forget')),
    );
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).dry_run).toBe(true);

    // Memory should still exist
    const memories = await port.readStore('memories');
    expect(memories).toHaveLength(1);
  });

  it('returns NOT_FOUND for unknown id', async () => {
    const result = await withPort(port, () =>
      memoryTools({ id: 'mem-nonexistent' }, ctx('memory:forget')),
    );
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('rejects missing id', async () => {
    const result = await withPort(port, () => memoryTools({}, ctx('memory:forget')));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });
});

// ============================================================================
// Unknown tool routing
// ============================================================================

describe('unknown tool routing', () => {
  it('task tools returns UNKNOWN_TOOL for unrecognized tool_name', async () => {
    const result = await taskTools({}, ctx('task:bogus'));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_TOOL');
  });

  it('memory tools returns UNKNOWN_TOOL for unrecognized tool_name', async () => {
    const result = await memoryTools({}, ctx('memory:bogus'));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_TOOL');
  });
});
