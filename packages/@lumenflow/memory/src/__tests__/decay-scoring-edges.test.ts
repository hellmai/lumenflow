// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Edge case tests for decay scoring algorithm.
 *
 * Complements __tests__/decay-scoring.test.ts (happy-path) with:
 * - Future timestamps (node created in the future relative to `now`)
 * - Extremely short half-life values
 * - Metadata missing the nested access sub-object
 * - created_at newer than updated_at (uses max)
 * - Default options path in computeDecayScore
 * - Score ordering invariants (P0 > P3, recent > old)
 */
import { describe, expect, it } from 'vitest';
import {
  computeRecencyScore,
  computeAccessScore,
  computeImportanceScore,
  computeDecayScore,
  DEFAULT_HALF_LIFE_MS,
} from '../decay/scoring.js';
import type { MemoryNode } from '../memory-schema.js';

function makeNode(overrides: Partial<MemoryNode> = {}): MemoryNode {
  return {
    id: 'mem-edge',
    type: 'note',
    lifecycle: 'session',
    content: 'edge case node',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('decay scoring edge cases: recency', () => {
  it('returns score > 1 when node timestamp is in the future', () => {
    const now = Date.now();
    const futureTimestamp = now + DEFAULT_HALF_LIFE_MS;
    const node = makeNode({ created_at: new Date(futureTimestamp).toISOString() });

    const score = computeRecencyScore(node, DEFAULT_HALF_LIFE_MS, now);

    // exp(-(-halfLife) / halfLife) = exp(1) ~= 2.718
    expect(score).toBeCloseTo(Math.exp(1), 3);
    expect(score).toBeGreaterThan(1);
  });

  it('handles very small half-life (1ms) for rapid decay', () => {
    const now = Date.now();
    const tenMsAgo = now - 10;
    const node = makeNode({ created_at: new Date(tenMsAgo).toISOString() });

    const score = computeRecencyScore(node, 1, now);

    // exp(-10/1) = exp(-10) ~= 0.0000454
    expect(score).toBeCloseTo(Math.exp(-10), 6);
    expect(score).toBeLessThan(0.001);
  });

  it('uses created_at when updated_at is earlier than created_at', () => {
    const now = Date.now();
    const recentCreated = now - DEFAULT_HALF_LIFE_MS;
    const olderUpdated = now - 3 * DEFAULT_HALF_LIFE_MS;
    const node = makeNode({
      created_at: new Date(recentCreated).toISOString(),
      updated_at: new Date(olderUpdated).toISOString(),
    });

    const score = computeRecencyScore(node, DEFAULT_HALF_LIFE_MS, now);

    // Math.max picks created_at (1 half-life ago), so exp(-1)
    expect(score).toBeCloseTo(Math.exp(-1), 3);
  });

  it('treats identical created_at and updated_at the same as created_at only', () => {
    const now = Date.now();
    const ts = now - DEFAULT_HALF_LIFE_MS;
    const isoTs = new Date(ts).toISOString();
    const nodeWithBoth = makeNode({ created_at: isoTs, updated_at: isoTs });
    const nodeWithJustCreated = makeNode({ created_at: isoTs });

    const scoreBoth = computeRecencyScore(nodeWithBoth, DEFAULT_HALF_LIFE_MS, now);
    const scoreCreatedOnly = computeRecencyScore(nodeWithJustCreated, DEFAULT_HALF_LIFE_MS, now);

    expect(scoreBoth).toBeCloseTo(scoreCreatedOnly, 6);
  });
});

describe('decay scoring edge cases: access', () => {
  it('returns 0 when metadata exists but has no access field', () => {
    const node = makeNode({ metadata: { priority: 'P1' } });
    const score = computeAccessScore(node);
    expect(score).toBe(0);
  });

  it('returns 0 when access object exists but has no count field', () => {
    const node = makeNode({ metadata: { access: {} } });
    const score = computeAccessScore(node);
    expect(score).toBe(0);
  });

  it('returns 0 when metadata is undefined', () => {
    const node = makeNode();
    // Ensure no metadata
    delete node.metadata;
    const score = computeAccessScore(node);
    expect(score).toBe(0);
  });

  it('scales logarithmically: 100 accesses gives less than 2x of 10 accesses', () => {
    const node10 = makeNode({ metadata: { access: { count: 10 } } });
    const node100 = makeNode({ metadata: { access: { count: 100 } } });

    const score10 = computeAccessScore(node10);
    const score100 = computeAccessScore(node100);

    expect(score100).toBeGreaterThan(score10);
    expect(score100).toBeLessThan(2 * score10);
  });
});

describe('decay scoring edge cases: importance', () => {
  it('returns default importance when metadata has empty priority string', () => {
    const node = makeNode({ metadata: { priority: '' } });
    const score = computeImportanceScore(node);
    // Empty string is not in IMPORTANCE_BY_PRIORITY, falls to default
    expect(score).toBe(1);
  });

  it('returns default importance for numeric priority values', () => {
    const node = makeNode({ metadata: { priority: '0' } });
    const score = computeImportanceScore(node);
    expect(score).toBe(1);
  });
});

describe('decay scoring edge cases: computeDecayScore', () => {
  it('uses default options when none provided', () => {
    const node = makeNode({
      created_at: new Date().toISOString(),
      metadata: { priority: 'P2' },
    });

    // Should not throw; uses Date.now() and DEFAULT_HALF_LIFE_MS internally
    const score = computeDecayScore(node);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(2);
  });

  it('P0 node always scores higher than P3 node with same age and access', () => {
    const now = Date.now();
    const ts = new Date(now - DEFAULT_HALF_LIFE_MS).toISOString();
    const nodeP0 = makeNode({ created_at: ts, metadata: { priority: 'P0' } });
    const nodeP3 = makeNode({ created_at: ts, metadata: { priority: 'P3' } });

    const scoreP0 = computeDecayScore(nodeP0, { now });
    const scoreP3 = computeDecayScore(nodeP3, { now });

    expect(scoreP0).toBeGreaterThan(scoreP3);
    // P0 importance is 4x P3 importance
    expect(scoreP0 / scoreP3).toBeCloseTo(4, 3);
  });

  it('recent node scores higher than old node with same priority', () => {
    const now = Date.now();
    const recent = makeNode({
      created_at: new Date(now).toISOString(),
      metadata: { priority: 'P2' },
    });
    const old = makeNode({
      created_at: new Date(now - 3 * DEFAULT_HALF_LIFE_MS).toISOString(),
      metadata: { priority: 'P2' },
    });

    const scoreRecent = computeDecayScore(recent, { now });
    const scoreOld = computeDecayScore(old, { now });

    expect(scoreRecent).toBeGreaterThan(scoreOld);
  });

  it('access count can partially compensate for age', () => {
    const now = Date.now();
    // Slightly older node with high access
    const olderAccessed = makeNode({
      created_at: new Date(now - 0.5 * DEFAULT_HALF_LIFE_MS).toISOString(),
      metadata: { priority: 'P2', access: { count: 1000 } },
    });
    // Slightly newer node with no access
    const newerUnaccessed = makeNode({
      created_at: new Date(now - 0.3 * DEFAULT_HALF_LIFE_MS).toISOString(),
      metadata: { priority: 'P2' },
    });

    const scoreOlder = computeDecayScore(olderAccessed, { now });
    const scoreNewer = computeDecayScore(newerUnaccessed, { now });

    // The accessed older node should score higher due to access boost
    expect(scoreOlder).toBeGreaterThan(scoreNewer);
  });

  it('score approaches zero for extremely old low-priority nodes', () => {
    const now = Date.now();
    const veryOld = makeNode({
      created_at: new Date(now - 20 * DEFAULT_HALF_LIFE_MS).toISOString(),
      metadata: { priority: 'P3' },
    });

    const score = computeDecayScore(veryOld, { now });

    // exp(-20) * 0.5 ~= 1.03e-9
    expect(score).toBeLessThan(0.000001);
  });
});
