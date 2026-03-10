// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * WU-2370: Verify that the P0 emergency git restore of wu-events.jsonl
 * preserves wu:brief evidence lines.
 *
 * Bug: When wu:done fails and is retried, the P0 git restore from the
 * first run wipes uncommitted wu:brief evidence. Subsequent runs then
 * report "Missing wu:brief evidence" even though wu:brief was run.
 *
 * Fix: Before restoring, extract uncommitted wu:brief evidence lines.
 * After restoring, re-append them to preserve evidence across retries.
 */
describe('WU-2370: wu:brief evidence survives P0 git restore', () => {
  it('preserves wu:brief evidence lines during P0 restore in executePreFlightChecks', async () => {
    const source = await readFile(new URL('../wu-done.ts', import.meta.url), 'utf-8');

    // The P0 emergency fix section must read evidence before git restore
    expect(source).toContain('[wu:brief]');
    // Must extract uncommitted lines before restore
    expect(source).toContain('uncommittedBriefLines');
    // Must re-append after restore
    expect(source).toMatch(/appendFileSync.*uncommittedBriefLines/s);
  });

  it('reads uncommitted lines before git restore and re-appends after', async () => {
    const source = await readFile(new URL('../wu-done.ts', import.meta.url), 'utf-8');

    // The P0 section must follow the pattern: read → restore → re-append
    // Using a multiline regex to verify the ordering within executePreFlightChecks
    const pattern =
      /uncommittedBriefLines\s*=\s*preRestoreContent[\s\S]*?git.*restore[\s\S]*?appendFileSync.*uncommittedBriefLines/;
    expect(source).toMatch(pattern);
  });

  describe('evidence line extraction and re-append logic', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(path.join(tmpdir(), 'wu-2370-'));
      mkdirSync(path.join(tempDir, '.lumenflow', 'state'), { recursive: true });

      // Initialize git repo so git show works
      execSync('git init', { cwd: tempDir });
      execSync('git config user.email "test@test.com"', { cwd: tempDir });
      execSync('git config user.name "Test"', { cwd: tempDir });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('preserves wu:brief evidence lines across git restore', () => {
      const eventsPath = path.join(tempDir, '.lumenflow', 'state', 'wu-events.jsonl');
      const eventsRelPath = '.lumenflow/state/wu-events.jsonl';

      // Simulate committed baseline (e.g., from wu:claim)
      const committedLine =
        '{"type":"checkpoint","wuId":"WU-100","note":"[wu:brief] generated via wu:claim:auto","timestamp":"2026-01-01T00:00:00.000Z"}';
      writeFileSync(eventsPath, committedLine + '\n');
      execSync(`git add "${eventsRelPath}"`, { cwd: tempDir });
      execSync('git commit -m "initial"', { cwd: tempDir });

      // Simulate wu:brief adding uncommitted evidence
      const briefLine =
        '{"type":"checkpoint","wuId":"WU-100","note":"[wu:brief] generated via claude-code","timestamp":"2026-01-02T12:00:00.000Z","nextSteps":"client=claude-code;mode=full"}';
      appendFileSync(eventsPath, briefLine + '\n');

      // Verify the uncommitted line exists
      const preRestore = readFileSync(eventsPath, 'utf-8');
      expect(preRestore).toContain('claude-code');

      // Simulate the P0 restore + evidence preservation logic
      // 1. Read uncommitted brief lines
      const preRestoreContent = readFileSync(eventsPath, 'utf-8');
      let committedContent: string;
      try {
        committedContent = execSync(`git -C "${tempDir}" show HEAD:"${eventsRelPath}"`, {
          encoding: 'utf-8',
        });
      } catch {
        committedContent = '';
      }
      const committedLines = new Set(committedContent.trim().split('\n').filter(Boolean));
      const uncommittedBriefLines = preRestoreContent
        .trim()
        .split('\n')
        .filter((line: string) => !committedLines.has(line) && line.includes('[wu:brief]'));

      // 2. git restore
      execSync(`git -C "${tempDir}" restore "${eventsRelPath}"`);
      const postRestore = readFileSync(eventsPath, 'utf-8');
      expect(postRestore).not.toContain('claude-code');

      // 3. Re-append
      if (uncommittedBriefLines.length > 0) {
        appendFileSync(eventsPath, uncommittedBriefLines.join('\n') + '\n');
      }

      // Verify evidence survived
      const final = readFileSync(eventsPath, 'utf-8');
      expect(final).toContain('claude-code');
      expect(final).toContain(committedLine);
      expect(final.trim().split('\n')).toHaveLength(2);
    });

    it('does not duplicate already-committed evidence lines', () => {
      const eventsPath = path.join(tempDir, '.lumenflow', 'state', 'wu-events.jsonl');
      const eventsRelPath = '.lumenflow/state/wu-events.jsonl';

      // Committed evidence
      const committedLine =
        '{"type":"checkpoint","wuId":"WU-100","note":"[wu:brief] generated via wu:claim:auto","timestamp":"2026-01-01T00:00:00.000Z"}';
      writeFileSync(eventsPath, committedLine + '\n');
      execSync(`git add "${eventsRelPath}"`, { cwd: tempDir });
      execSync('git commit -m "initial"', { cwd: tempDir });

      // No uncommitted changes
      const preRestoreContent = readFileSync(eventsPath, 'utf-8');
      const committedContent = execSync(`git -C "${tempDir}" show HEAD:"${eventsRelPath}"`, {
        encoding: 'utf-8',
      });
      const committedLines = new Set(committedContent.trim().split('\n').filter(Boolean));
      const uncommittedBriefLines = preRestoreContent
        .trim()
        .split('\n')
        .filter((line: string) => !committedLines.has(line) && line.includes('[wu:brief]'));

      // No uncommitted evidence to preserve
      expect(uncommittedBriefLines).toHaveLength(0);
    });

    it('filters out non-brief uncommitted lines during restore', () => {
      const eventsPath = path.join(tempDir, '.lumenflow', 'state', 'wu-events.jsonl');
      const eventsRelPath = '.lumenflow/state/wu-events.jsonl';

      writeFileSync(eventsPath, '');
      execSync(`git add "${eventsRelPath}"`, { cwd: tempDir });
      execSync('git commit -m "initial"', { cwd: tempDir });

      // Add both brief and non-brief uncommitted lines
      const briefLine =
        '{"type":"checkpoint","wuId":"WU-100","note":"[wu:brief] generated via claude-code"}';
      const otherLine = '{"type":"checkpoint","wuId":"WU-100","note":"some other event"}';
      appendFileSync(eventsPath, briefLine + '\n' + otherLine + '\n');

      const preRestoreContent = readFileSync(eventsPath, 'utf-8');
      const committedContent = (() => {
        try {
          return execSync(`git -C "${tempDir}" show HEAD:"${eventsRelPath}"`, {
            encoding: 'utf-8',
          });
        } catch {
          return '';
        }
      })();
      const committedLines = new Set(committedContent.trim().split('\n').filter(Boolean));
      const uncommittedBriefLines = preRestoreContent
        .trim()
        .split('\n')
        .filter((line: string) => !committedLines.has(line) && line.includes('[wu:brief]'));

      // Only brief lines are preserved
      expect(uncommittedBriefLines).toHaveLength(1);
      expect(uncommittedBriefLines[0]).toContain('[wu:brief]');
      expect(uncommittedBriefLines[0]).not.toContain('some other event');
    });
  });
});
