// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Tests for TaskScheduler WIP limits and priority ordering.
 *
 * Covers:
 * - Priority-based dequeue ordering (P0 before P3)
 * - FIFO within same priority
 * - Lane WIP limit enforcement
 * - markStarted / markCompleted lifecycle
 * - Dequeue returns null when WIP-blocked
 * - Queue depth tracking
 */
import { describe, expect, it } from 'vitest';
import { TaskScheduler, type ScheduledTask } from '../scheduler/task-scheduler.js';

function task(id: string, lane: string, priority: 'P0' | 'P1' | 'P2' | 'P3'): ScheduledTask {
  return { task_id: id, lane_id: lane, priority };
}

describe('TaskScheduler priority ordering', () => {
  it('dequeues P0 before P1 before P2 before P3', () => {
    const scheduler = new TaskScheduler();
    scheduler.enqueue(task('t3', 'lane-a', 'P3'));
    scheduler.enqueue(task('t0', 'lane-a', 'P0'));
    scheduler.enqueue(task('t2', 'lane-a', 'P2'));
    scheduler.enqueue(task('t1', 'lane-a', 'P1'));

    expect(scheduler.dequeue()?.task_id).toBe('t0');
    expect(scheduler.dequeue()?.task_id).toBe('t1');
    expect(scheduler.dequeue()?.task_id).toBe('t2');
    expect(scheduler.dequeue()?.task_id).toBe('t3');
  });

  it('preserves FIFO order within same priority', () => {
    const scheduler = new TaskScheduler();
    scheduler.enqueue(task('first', 'lane-a', 'P2'));
    scheduler.enqueue(task('second', 'lane-a', 'P2'));
    scheduler.enqueue(task('third', 'lane-a', 'P2'));

    expect(scheduler.dequeue()?.task_id).toBe('first');
    expect(scheduler.dequeue()?.task_id).toBe('second');
    expect(scheduler.dequeue()?.task_id).toBe('third');
  });

  it('returns null when queue is empty', () => {
    const scheduler = new TaskScheduler();
    expect(scheduler.dequeue()).toBeNull();
  });
});

describe('TaskScheduler WIP limits', () => {
  it('skips lane that is at WIP limit', () => {
    const scheduler = new TaskScheduler({ laneWipLimits: { 'lane-a': 1 } });
    scheduler.enqueue(task('t1', 'lane-a', 'P0'));
    scheduler.enqueue(task('t2', 'lane-a', 'P0'));
    scheduler.enqueue(task('t3', 'lane-b', 'P1'));

    const first = scheduler.dequeue();
    expect(first?.task_id).toBe('t1');
    scheduler.markStarted('t1');
    expect(scheduler.getLaneActiveCount('lane-a')).toBe(1);

    // t2 is WIP-blocked, t3 from different lane should be next
    const second = scheduler.dequeue();
    expect(second?.task_id).toBe('t3');
  });

  it('returns null when all candidates are WIP-blocked', () => {
    const scheduler = new TaskScheduler({ laneWipLimits: { 'lane-a': 1 } });
    scheduler.enqueue(task('t1', 'lane-a', 'P0'));
    scheduler.enqueue(task('t2', 'lane-a', 'P0'));

    const first = scheduler.dequeue();
    scheduler.markStarted(first?.task_id ?? '');

    const second = scheduler.dequeue();
    expect(second).toBeNull();
  });

  it('unblocks lane after markCompleted', () => {
    const scheduler = new TaskScheduler({ laneWipLimits: { 'lane-a': 1 } });
    scheduler.enqueue(task('t1', 'lane-a', 'P0'));
    scheduler.enqueue(task('t2', 'lane-a', 'P0'));

    const first = scheduler.dequeue();
    scheduler.markStarted(first?.task_id ?? '');
    scheduler.markCompleted(first?.task_id ?? '');

    expect(scheduler.getLaneActiveCount('lane-a')).toBe(0);

    const second = scheduler.dequeue();
    expect(second?.task_id).toBe('t2');
  });

  it('allows unlimited tasks when no WIP limit set for lane', () => {
    const scheduler = new TaskScheduler({ laneWipLimits: { 'other-lane': 1 } });
    scheduler.enqueue(task('t1', 'lane-a', 'P0'));
    scheduler.enqueue(task('t2', 'lane-a', 'P0'));

    const first = scheduler.dequeue();
    scheduler.markStarted(first?.task_id ?? '');

    const second = scheduler.dequeue();
    expect(second?.task_id).toBe('t2');
  });
});

describe('TaskScheduler queue depth and active tracking', () => {
  it('tracks queue depth correctly', () => {
    const scheduler = new TaskScheduler();
    expect(scheduler.getQueueDepth()).toBe(0);
    scheduler.enqueue(task('t1', 'lane-a', 'P0'));
    expect(scheduler.getQueueDepth()).toBe(1);
    scheduler.enqueue(task('t2', 'lane-a', 'P0'));
    expect(scheduler.getQueueDepth()).toBe(2);
    scheduler.dequeue();
    expect(scheduler.getQueueDepth()).toBe(1);
  });

  it('markStarted is a no-op for unknown task IDs', () => {
    const scheduler = new TaskScheduler();
    scheduler.markStarted('nonexistent');
    expect(scheduler.getLaneActiveCount('any')).toBe(0);
  });

  it('markCompleted is a no-op for unknown task IDs', () => {
    const scheduler = new TaskScheduler();
    scheduler.markCompleted('nonexistent');
    expect(scheduler.getLaneActiveCount('any')).toBe(0);
  });

  it('markCompleted cleans up lane counter to zero', () => {
    const scheduler = new TaskScheduler();
    scheduler.enqueue(task('t1', 'lane-a', 'P0'));
    const dequeued = scheduler.dequeue();
    scheduler.markStarted(dequeued?.task_id ?? '');
    expect(scheduler.getLaneActiveCount('lane-a')).toBe(1);
    scheduler.markCompleted(dequeued?.task_id ?? '');
    expect(scheduler.getLaneActiveCount('lane-a')).toBe(0);
  });
});
