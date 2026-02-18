// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  TASK_LIFECYCLE_EVENTS,
  TASK_LIFECYCLE_STATES,
  ALLOWED_TRANSITIONS,
  assertTransition,
  resolveTaskState,
  type TaskStateAliases,
} from '../state-machine/index.js';

describe('kernel task state machine', () => {
  it('allows canonical lifecycle transitions', () => {
    const transitions: Array<[string, string]> = [
      ['ready', 'active'],
      ['active', 'blocked'],
      ['active', 'waiting'],
      ['active', 'done'],
      ['active', 'ready'],
      ['blocked', 'active'],
      ['blocked', 'done'],
      ['waiting', 'active'],
      ['waiting', 'done'],
    ];

    for (const [from, to] of transitions) {
      expect(() => assertTransition(from, to, 'WU-1727')).not.toThrow();
    }
  });

  it('rejects all transitions from done (terminal state)', () => {
    expect(() => assertTransition('done', 'active', 'WU-1727')).toThrow('done is a terminal state');
    expect(() => assertTransition('done', 'ready', 'WU-1727')).toThrow('done is a terminal state');
  });

  it('resolves pack-provided aliases when validating transitions', () => {
    const aliases: TaskStateAliases = {
      active: 'in_progress',
    };

    expect(resolveTaskState('in_progress', aliases)).toBe('active');
    expect(resolveTaskState('active', aliases)).toBe('active');
    expect(() => assertTransition('ready', 'in_progress', 'WU-1727', aliases)).not.toThrow();
    expect(() => assertTransition('in_progress', 'done', 'WU-1727', aliases)).not.toThrow();
  });

  it('throws descriptive errors for illegal transitions', () => {
    expect(() => assertTransition('ready', 'done', 'WU-1727')).toThrow(
      'Illegal state transition for WU-1727',
    );
  });

  it('exports ALLOWED_TRANSITIONS as the canonical single source of truth', () => {
    // WU-1865: The manual transition map is the single source of truth.
    // xstate machine definition has been removed to eliminate duplication.
    expect(ALLOWED_TRANSITIONS).toBeDefined();
    expect(ALLOWED_TRANSITIONS.ready).toEqual(['active']);
    expect(ALLOWED_TRANSITIONS.active).toContain('blocked');
    expect(ALLOWED_TRANSITIONS.active).toContain('waiting');
    expect(ALLOWED_TRANSITIONS.active).toContain('done');
    expect(ALLOWED_TRANSITIONS.active).toContain('ready');
    expect(ALLOWED_TRANSITIONS.blocked).toContain('active');
    expect(ALLOWED_TRANSITIONS.blocked).toContain('done');
    expect(ALLOWED_TRANSITIONS.waiting).toContain('active');
    expect(ALLOWED_TRANSITIONS.waiting).toContain('done');
    expect(ALLOWED_TRANSITIONS.done).toEqual([]);
  });

  it('does not export taskLifecycleMachine (xstate dead code removed)', async () => {
    // WU-1865: xstate machine was dead code - verify it no longer exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exports = (await import('../state-machine/index.js')) as any;
    expect(exports.taskLifecycleMachine).toBeUndefined();
  });

  it('exports lifecycle events as string constants usable without xstate', () => {
    // WU-1865: Events are plain string constants, not xstate event types
    expect(TASK_LIFECYCLE_EVENTS.CLAIM).toBe('task.claim');
    expect(TASK_LIFECYCLE_EVENTS.BLOCK).toBe('task.block');
    expect(TASK_LIFECYCLE_EVENTS.WAIT).toBe('task.wait');
    expect(TASK_LIFECYCLE_EVENTS.COMPLETE).toBe('task.complete');
    expect(TASK_LIFECYCLE_EVENTS.RELEASE).toBe('task.release');
    expect(TASK_LIFECYCLE_EVENTS.UNBLOCK).toBe('task.unblock');
    expect(TASK_LIFECYCLE_EVENTS.RESUME).toBe('task.resume');
  });

  it('exports all lifecycle states as plain string constants', () => {
    expect(TASK_LIFECYCLE_STATES.READY).toBe('ready');
    expect(TASK_LIFECYCLE_STATES.ACTIVE).toBe('active');
    expect(TASK_LIFECYCLE_STATES.BLOCKED).toBe('blocked');
    expect(TASK_LIFECYCLE_STATES.WAITING).toBe('waiting');
    expect(TASK_LIFECYCLE_STATES.DONE).toBe('done');
  });
});
