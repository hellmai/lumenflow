/**
 * Memory Triage Core Tests (WU-1910)
 *
 * TDD: Tests written first, implementation follows.
 * Tests for archive-then-list round-trip behavior via triage operations.
 *
 * Verifies that archiveDiscovery + listOpenDiscoveries correctly
 * suppresses archived nodes after WU-1910 deduplication fix.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { archiveDiscovery, listOpenDiscoveries } from '../src/mem-triage-core.js';
import { MEMORY_FILE_NAME } from '../src/memory-store.js';
import { LUMENFLOW_MEMORY_PATHS } from '../src/paths.js';

/**
 * Helper to write JSONL content to a file
 */
async function writeJsonlFile(filePath: string, nodes: object[]): Promise<void> {
  const content = nodes.map((node) => JSON.stringify(node)).join('\n');
  await fs.writeFile(filePath, content + '\n', 'utf-8');
}

describe('mem-triage-core (WU-1910)', () => {
  let tempDir: string;
  let memoryDir: string;
  let memoryFilePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mem-triage-test-'));
    memoryDir = path.join(tempDir, LUMENFLOW_MEMORY_PATHS.MEMORY_DIR);
    await fs.mkdir(memoryDir, { recursive: true });
    memoryFilePath = path.join(memoryDir, MEMORY_FILE_NAME);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('archive-then-list round-trip', () => {
    it('should not show archived discovery in listOpenDiscoveries after archiveDiscovery', async () => {
      // Create two open discovery nodes
      const nodes = [
        {
          id: 'mem-tg01',
          type: 'discovery',
          lifecycle: 'wu',
          content: 'Bug: parser fails on empty input',
          created_at: '2025-12-08T10:00:00Z',
          wu_id: 'WU-1463',
        },
        {
          id: 'mem-tg02',
          type: 'discovery',
          lifecycle: 'wu',
          content: 'Bug: validator missing edge case',
          created_at: '2025-12-08T11:00:00Z',
          wu_id: 'WU-1463',
        },
      ];
      await writeJsonlFile(memoryFilePath, nodes);

      // Before archiving: both should appear in list
      const beforeList = await listOpenDiscoveries(tempDir);
      expect(beforeList.length).toBe(2);

      // Archive one discovery
      const archiveResult = await archiveDiscovery(tempDir, {
        nodeId: 'mem-tg01',
        reason: 'fixed in WU-999',
      });
      expect(archiveResult.success).toBe(true);

      // After archiving: only the non-archived discovery should appear
      const afterList = await listOpenDiscoveries(tempDir);
      expect(afterList.length).toBe(1);
      expect(afterList[0].id).toBe('mem-tg02');
    });

    it('should not show any discoveries after archiving all of them', async () => {
      const nodes = [
        {
          id: 'mem-tg03',
          type: 'discovery',
          lifecycle: 'wu',
          content: 'Single discovery',
          created_at: '2025-12-08T10:00:00Z',
        },
      ];
      await writeJsonlFile(memoryFilePath, nodes);

      // Archive the only discovery
      await archiveDiscovery(tempDir, {
        nodeId: 'mem-tg03',
        reason: 'no longer relevant',
      });

      // List should be empty
      const afterList = await listOpenDiscoveries(tempDir);
      expect(afterList.length).toBe(0);
    });
  });
});
