/**
 * Memory Export Core Tests (WU-1137)
 *
 * TDD: verify markdown and JSON export with filtering.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exportMemory } from '../src/mem-export-core.js';

const FIXTURES = {
  nodes: [
    {
      id: 'mem-aaaa',
      type: 'checkpoint',
      lifecycle: 'wu',
      content: 'Checkpoint: finished scaffolding',
      created_at: '2026-01-26T10:00:00.000Z',
      wu_id: 'WU-1137',
    },
    {
      id: 'mem-bbbb',
      type: 'discovery',
      lifecycle: 'session',
      content: 'Found missing doc link',
      created_at: '2026-01-26T11:00:00.000Z',
      wu_id: 'WU-1137',
    },
    {
      id: 'mem-cccc',
      type: 'note',
      lifecycle: 'project',
      content: 'Project-level note',
      created_at: '2026-01-26T12:00:00.000Z',
      wu_id: 'WU-9999',
    },
  ],
};

async function writeJsonl(filePath: string, nodes: object[]) {
  const content = nodes.map((node) => JSON.stringify(node)).join('\n') + '\n';
  await fs.writeFile(filePath, content, 'utf-8');
}

describe('mem-export-core', () => {
  let tempDir: string;
  let memoryDir: string;
  let memoryFile: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mem-export-test-'));
    memoryDir = path.join(tempDir, '.lumenflow', 'memory');
    await fs.mkdir(memoryDir, { recursive: true });
    memoryFile = path.join(memoryDir, 'memory.jsonl');
    await writeJsonl(memoryFile, FIXTURES.nodes);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('exports markdown by default with filters applied', async () => {
    const result = await exportMemory(tempDir, { wuId: 'WU-1137', type: 'checkpoint' });

    expect(result.format).toBe('markdown');
    expect(result.nodes).toHaveLength(1);
    expect(result.output).toContain('# Memory Export');
    expect(result.output).toContain('Filters:');
    expect(result.output).toContain('WU-1137');
    expect(result.output).toContain('checkpoint');
    expect(result.output).toContain('mem-aaaa');
    expect(result.output).toContain('Checkpoint: finished scaffolding');
  });

  it('exports JSON when format=json', async () => {
    const result = await exportMemory(tempDir, { format: 'json', wuId: 'WU-1137' });

    expect(result.format).toBe('json');
    const parsed = JSON.parse(result.output);
    expect(parsed.count).toBe(2);
    expect(parsed.filters.wuId).toBe('WU-1137');
  });

  it('returns empty output when filters match no nodes', async () => {
    const result = await exportMemory(tempDir, { wuId: 'WU-404', format: 'markdown' });

    expect(result.nodes).toHaveLength(0);
    expect(result.output).toContain('No matching nodes');
  });
});
