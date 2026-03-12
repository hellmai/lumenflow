// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Signal queuing tests: create, load, filter, mark-read lifecycle.
 *
 * Tests the full signal lifecycle:
 * - createSignal validation and persistence
 * - loadSignals filtering by WU, lane, unread, since
 * - markSignalsAsRead receipt-based read tracking
 * - Error handling for invalid inputs
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSignal, loadSignals, markSignalsAsRead } from '../mem-signal-core.js';

describe('signal queuing lifecycle', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempRoots.length = 0;
  });

  async function makeTempDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-queue-'));
    tempRoots.push(dir);
    return dir;
  }

  describe('createSignal', () => {
    it('creates a signal with unique ID and persists it', async () => {
      const baseDir = await makeTempDir();
      const result = await createSignal(baseDir, {
        message: 'test signal',
        wuId: 'WU-100',
        lane: 'Operations',
      });

      expect(result.success).toBe(true);
      expect(result.signal.id).toMatch(/^sig-[a-f0-9]{8}$/);
      expect(result.signal.message).toBe('test signal');
      expect(result.signal.wu_id).toBe('WU-100');
      expect(result.signal.lane).toBe('Operations');
      expect(result.signal.read).toBe(false);
    });

    it('sets default type, sender, and origin when not provided', async () => {
      const baseDir = await makeTempDir();
      const result = await createSignal(baseDir, { message: 'defaults test' });

      expect(result.signal.type).toBe('coordination');
      expect(result.signal.sender).toBe('system');
      expect(result.signal.origin).toBe('local');
    });

    it('throws on empty message', async () => {
      const baseDir = await makeTempDir();
      await expect(createSignal(baseDir, { message: '' })).rejects.toThrow('message is required');
    });

    it('throws on whitespace-only message', async () => {
      const baseDir = await makeTempDir();
      await expect(createSignal(baseDir, { message: '   ' })).rejects.toThrow(
        'message is required',
      );
    });

    it('throws on invalid WU ID format', async () => {
      const baseDir = await makeTempDir();
      await expect(createSignal(baseDir, { message: 'test', wuId: 'invalid' })).rejects.toThrow(
        'Invalid WU ID',
      );
    });

    it('throws on empty optional string fields', async () => {
      const baseDir = await makeTempDir();
      await expect(createSignal(baseDir, { message: 'test', type: '  ' })).rejects.toThrow();
    });
  });

  describe('loadSignals', () => {
    it('returns empty array when no signals file exists', async () => {
      const baseDir = await makeTempDir();
      const signals = await loadSignals(baseDir);
      expect(signals).toEqual([]);
    });

    it('loads all signals in chronological order', async () => {
      const baseDir = await makeTempDir();
      await createSignal(baseDir, { message: 'first' });
      await createSignal(baseDir, { message: 'second' });
      await createSignal(baseDir, { message: 'third' });

      const signals = await loadSignals(baseDir);
      expect(signals).toHaveLength(3);
      expect(signals[0]?.message).toBe('first');
      expect(signals[1]?.message).toBe('second');
      expect(signals[2]?.message).toBe('third');
    });

    it('filters by WU ID', async () => {
      const baseDir = await makeTempDir();
      await createSignal(baseDir, { message: 'for WU-1', wuId: 'WU-1' });
      await createSignal(baseDir, { message: 'for WU-2', wuId: 'WU-2' });
      await createSignal(baseDir, { message: 'no WU' });

      const signals = await loadSignals(baseDir, { wuId: 'WU-1' });
      expect(signals).toHaveLength(1);
      expect(signals[0]?.message).toBe('for WU-1');
    });

    it('filters by lane', async () => {
      const baseDir = await makeTempDir();
      await createSignal(baseDir, { message: 'ops signal', lane: 'Operations' });
      await createSignal(baseDir, { message: 'dev signal', lane: 'Development' });

      const signals = await loadSignals(baseDir, { lane: 'Operations' });
      expect(signals).toHaveLength(1);
      expect(signals[0]?.message).toBe('ops signal');
    });

    it('filters unread only', async () => {
      const baseDir = await makeTempDir();
      const result1 = await createSignal(baseDir, { message: 'will be read' });
      await createSignal(baseDir, { message: 'stays unread' });

      await markSignalsAsRead(baseDir, [result1.signal.id]);

      const unread = await loadSignals(baseDir, { unreadOnly: true });
      expect(unread).toHaveLength(1);
      expect(unread[0]?.message).toBe('stays unread');
    });

    it('filters by since timestamp', async () => {
      const baseDir = await makeTempDir();
      await createSignal(baseDir, { message: 'old signal' });

      const cutoff = new Date();
      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await createSignal(baseDir, { message: 'new signal' });

      const recent = await loadSignals(baseDir, { since: cutoff });
      expect(recent).toHaveLength(1);
      expect(recent[0]?.message).toBe('new signal');
    });
  });

  describe('markSignalsAsRead', () => {
    it('marks signals as read via receipts', async () => {
      const baseDir = await makeTempDir();
      const result = await createSignal(baseDir, { message: 'to read' });

      const markResult = await markSignalsAsRead(baseDir, [result.signal.id]);
      expect(markResult.markedCount).toBe(1);

      const signals = await loadSignals(baseDir);
      expect(signals[0]?.read).toBe(true);
    });

    it('is idempotent -- marking same signal twice does not double-count', async () => {
      const baseDir = await makeTempDir();
      const result = await createSignal(baseDir, { message: 'to read twice' });

      await markSignalsAsRead(baseDir, [result.signal.id]);
      const secondResult = await markSignalsAsRead(baseDir, [result.signal.id]);
      expect(secondResult.markedCount).toBe(0);
    });

    it('returns 0 when no signals file exists', async () => {
      const baseDir = await makeTempDir();
      const result = await markSignalsAsRead(baseDir, ['sig-nonexist']);
      expect(result.markedCount).toBe(0);
    });

    it('ignores IDs that do not exist in the signals file', async () => {
      const baseDir = await makeTempDir();
      await createSignal(baseDir, { message: 'existing' });

      const result = await markSignalsAsRead(baseDir, ['sig-nonexist']);
      expect(result.markedCount).toBe(0);
    });
  });
});
