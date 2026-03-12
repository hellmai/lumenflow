// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * WU-2425: wu:brief file output to survive Bash tool truncation.
 *
 * Validates that emitSpawnOutputWithRegistry writes full output to .logs/
 * and prints a recovery header to stdout.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { emitSpawnOutputWithRegistry } from '../wu-spawn-strategy-resolver.js';

describe('WU-2425: wu:brief file output', () => {
  let tmpDir: string;
  let logLines: string[];
  let log: (msg: string) => void;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `wu-brief-file-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    logLines = [];
    log = (msg: string) => logLines.push(msg);
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('writes full output to .logs/wu-brief-{id}.md', async () => {
    const output = 'Full prompt content for WU-100';

    await emitSpawnOutputWithRegistry(
      {
        id: 'WU-100',
        output,
        isCodexClient: false,
        logPrefix: '[wu:brief]',
      },
      { log, cwd: tmpDir },
    );

    const filePath = path.join(tmpDir, '.logs', 'wu-brief-WU-100.md');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf8')).toBe(output);
  });

  it('prints file path and recovery hint as first two lines of stdout', async () => {
    const output = 'Prompt content';

    await emitSpawnOutputWithRegistry(
      {
        id: 'WU-200',
        output,
        isCodexClient: false,
        logPrefix: '[wu:brief]',
      },
      { log, cwd: tmpDir },
    );

    expect(logLines[0]).toContain('.logs/wu-brief-WU-200.md');
    expect(logLines[1]).toMatch(/truncat/i);
  });

  it('still prints full prompt to stdout after the header', async () => {
    const output = 'Full prompt goes here';

    await emitSpawnOutputWithRegistry(
      {
        id: 'WU-300',
        output,
        isCodexClient: false,
        logPrefix: '[wu:brief]',
      },
      { log, cwd: tmpDir },
    );

    const joined = logLines.join('\n');
    expect(joined).toContain(output);
  });

  it('uses wu-delegate prefix for delegate mode', async () => {
    const output = 'Delegate prompt';

    await emitSpawnOutputWithRegistry(
      {
        id: 'WU-400',
        output,
        isCodexClient: false,
        logPrefix: '[wu:delegate]',
      },
      { log, cwd: tmpDir },
    );

    const filePath = path.join(tmpDir, '.logs', 'wu-delegate-WU-400.md');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf8')).toBe(output);
  });

  it('creates .logs/ directory if missing', async () => {
    const logsDir = path.join(tmpDir, '.logs');
    expect(existsSync(logsDir)).toBe(false);

    await emitSpawnOutputWithRegistry(
      {
        id: 'WU-500',
        output: 'test',
        isCodexClient: false,
      },
      { log, cwd: tmpDir },
    );

    expect(existsSync(logsDir)).toBe(true);
  });

  it('overwrites file on re-run (no timestamp)', async () => {
    await emitSpawnOutputWithRegistry(
      { id: 'WU-600', output: 'first run', isCodexClient: false },
      { log, cwd: tmpDir },
    );

    logLines = [];
    await emitSpawnOutputWithRegistry(
      { id: 'WU-600', output: 'second run', isCodexClient: false },
      { log, cwd: tmpDir },
    );

    const filePath = path.join(tmpDir, '.logs', 'wu-brief-WU-600.md');
    expect(readFileSync(filePath, 'utf8')).toBe('second run');
  });

  it('works for Codex client output', async () => {
    const output = 'Codex markdown prompt';

    await emitSpawnOutputWithRegistry(
      {
        id: 'WU-700',
        output,
        isCodexClient: true,
        logPrefix: '[wu:brief]',
      },
      { log, cwd: tmpDir },
    );

    const filePath = path.join(tmpDir, '.logs', 'wu-brief-WU-700.md');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf8')).toBe(output);
  });

  it('includes line count in file path message', async () => {
    const output = 'line1\nline2\nline3';

    await emitSpawnOutputWithRegistry(
      { id: 'WU-800', output, isCodexClient: false },
      { log, cwd: tmpDir },
    );

    expect(logLines[0]).toContain('3 lines');
  });
});
