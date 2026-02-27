// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * WU-2242: initiative:create auto-generates INIT-XXX ID when --id is omitted.
 *
 * Tests:
 * 1. getNextInitiativeId() scans initiatives dir and returns next sequential ID
 * 2. getNextInitiativeId() returns INIT-1 when no initiatives exist
 * 3. getNextInitiativeId() returns highest+1 (does not fill gaps)
 * 4. initiative:create parser does NOT require --id (it is optional)
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC_PATH = path.join(__dirname, '..', 'src', 'initiative-create.ts');

describe('WU-2242: initiative:create auto-ID generation', () => {
  describe('getNextInitiativeId()', () => {
    it('is exported from initiative-create.ts', () => {
      const content = fs.readFileSync(SRC_PATH, 'utf-8');
      expect(content).toContain('export function getNextInitiativeId');
    });

    it('returns INIT-1 when initiatives directory is empty', async () => {
      const { getNextInitiativeId } = await import('../src/initiative-create.js');
      // Mock INIT_PATHS to point to a temp dir
      const tmpDir = fs.mkdtempSync(path.join('/tmp', 'init-autoid-'));
      const result = getNextInitiativeId(tmpDir);
      expect(result).toBe('INIT-1');
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('returns INIT-1 when initiatives directory does not exist', async () => {
      const { getNextInitiativeId } = await import('../src/initiative-create.js');
      const result = getNextInitiativeId('/tmp/nonexistent-init-dir-' + Date.now());
      expect(result).toBe('INIT-1');
    });

    it('returns next sequential ID after highest existing', async () => {
      const { getNextInitiativeId } = await import('../src/initiative-create.js');
      const tmpDir = fs.mkdtempSync(path.join('/tmp', 'init-autoid-'));
      // Create some initiative files
      fs.writeFileSync(path.join(tmpDir, 'INIT-001.yaml'), 'id: INIT-001\n');
      fs.writeFileSync(path.join(tmpDir, 'INIT-005.yaml'), 'id: INIT-005\n');
      fs.writeFileSync(path.join(tmpDir, 'INIT-003.yaml'), 'id: INIT-003\n');
      const result = getNextInitiativeId(tmpDir);
      expect(result).toBe('INIT-6');
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('ignores non-INIT files in directory', async () => {
      const { getNextInitiativeId } = await import('../src/initiative-create.js');
      const tmpDir = fs.mkdtempSync(path.join('/tmp', 'init-autoid-'));
      fs.writeFileSync(path.join(tmpDir, 'INIT-010.yaml'), 'id: INIT-010\n');
      fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Readme\n');
      fs.writeFileSync(path.join(tmpDir, '.gitkeep'), '');
      const result = getNextInitiativeId(tmpDir);
      expect(result).toBe('INIT-11');
      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe('parser configuration', () => {
    it('does not list id in required options', () => {
      const content = fs.readFileSync(SRC_PATH, 'utf-8');
      // The required array should NOT include 'id'
      // It should be: required: ['slug', 'title'] or similar
      const requiredMatch = content.match(/required:\s*\[([^\]]*)\]/);
      expect(requiredMatch).toBeTruthy();
      const requiredList = requiredMatch![1];
      expect(requiredList).not.toContain("'id'");
    });
  });
});
