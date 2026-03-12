// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Tests for SessionManager checkpoint lifecycle.
 *
 * Covers:
 * - Create, checkpoint, restore full cycle
 * - State overwrite on subsequent checkpoints
 * - Restore from disk after close
 * - Concurrent session creation uniqueness
 * - Error handling for missing sessions
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionManager } from '../session/session-manager.js';

describe('SessionManager checkpoint lifecycle', () => {
  let tempRoot: string;
  let manager: SessionManager;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'lf-session-lifecycle-'));
    manager = new SessionManager({ checkpointsDir: join(tempRoot, 'checkpoints') });
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('create -> checkpoint -> restore preserves state', async () => {
    const session = await manager.createSession({ agent_id: 'agent-a' });
    expect(session.session_id).toBeTruthy();
    expect(session.agent_id).toBe('agent-a');
    expect(session.state).toBeUndefined();

    const checkpointed = await manager.checkpoint(session.session_id, { step: 1, note: 'progress' });
    expect(checkpointed.state).toEqual({ step: 1, note: 'progress' });

    const restored = await manager.restore(session.session_id);
    expect(restored).toBeDefined();
    expect(restored?.state).toEqual({ step: 1, note: 'progress' });
  });

  it('subsequent checkpoints overwrite previous state', async () => {
    const session = await manager.createSession({ agent_id: 'agent-b' });

    await manager.checkpoint(session.session_id, { phase: 'phase-1' });
    const first = await manager.restore(session.session_id);
    expect(first?.state).toEqual({ phase: 'phase-1' });

    await manager.checkpoint(session.session_id, { phase: 'phase-2', completed: true });
    const second = await manager.restore(session.session_id);
    expect(second?.state).toEqual({ phase: 'phase-2', completed: true });
  });

  it('updates the updated_at timestamp on checkpoint', async () => {
    const session = await manager.createSession({ agent_id: 'agent-c' });
    const originalUpdatedAt = session.updated_at;

    // Small delay to ensure timestamp differs
    await new Promise((resolve) => setTimeout(resolve, 10));

    const checkpointed = await manager.checkpoint(session.session_id, { x: 1 });
    expect(checkpointed.updated_at).not.toBe(originalUpdatedAt);
  });

  it('closeSession removes from in-memory cache', async () => {
    const session = await manager.createSession({ agent_id: 'agent-d' });
    await manager.closeSession(session.session_id);

    // A new manager instance can still restore from disk
    const freshManager = new SessionManager({ checkpointsDir: join(tempRoot, 'checkpoints') });
    const restored = await freshManager.restore(session.session_id);
    expect(restored).toBeDefined();
    expect(restored?.agent_id).toBe('agent-d');
  });

  it('restore returns null for a session that was never created', async () => {
    const result = await manager.restore('nonexistent-session-id');
    expect(result).toBeNull();
  });

  it('checkpoint throws for an unknown session ID', async () => {
    await expect(
      manager.checkpoint('no-such-session', { data: 'test' }),
    ).rejects.toThrow('Session not found');
  });

  it('concurrent session creation produces unique IDs', async () => {
    const sessions = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        manager.createSession({ agent_id: `agent-${i}` }),
      ),
    );
    const ids = new Set(sessions.map((s) => s.session_id));
    expect(ids.size).toBe(20);
  });
});
