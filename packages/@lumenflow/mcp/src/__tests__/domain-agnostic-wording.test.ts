// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIRNAME = fileURLToPath(new URL('.', import.meta.url));
const SOURCE_DIR = join(TEST_DIRNAME, '..');

const MCP_FILES_TO_SCAN = [
  join(SOURCE_DIR, 'runtime-tool-resolver.ts'),
  join(SOURCE_DIR, 'tools-shared.ts'),
  join(SOURCE_DIR, 'tools/agent-tools.ts'),
  join(SOURCE_DIR, 'tools/context-tools.ts'),
  join(SOURCE_DIR, 'tools/flow-tools.ts'),
  join(SOURCE_DIR, 'tools/initiative-tools.ts'),
  join(SOURCE_DIR, 'tools/memory-tools.ts'),
  join(SOURCE_DIR, 'tools/orchestration-tools.ts'),
  join(SOURCE_DIR, 'tools/parity-tools.ts'),
  join(SOURCE_DIR, 'tools/setup-tools.ts'),
  join(SOURCE_DIR, 'tools/validation-tools.ts'),
  join(SOURCE_DIR, 'tools/wu-tools.ts'),
] as const;

const MCP_PROHIBITED_DOMAIN_TERMS = [
  'domain decomposition',
  'software-delivery pack handlers',
] as const;

describe('MCP wording should remain domain-agnostic', () => {
  it('does not embed legacy domain-coupled migration wording in source comments', () => {
    const sourceSnapshot = MCP_FILES_TO_SCAN.map((sourcePath) =>
      readFileSync(sourcePath, 'utf-8'),
    ).join('\n');

    for (const prohibitedTerm of MCP_PROHIBITED_DOMAIN_TERMS) {
      expect(sourceSnapshot).not.toContain(prohibitedTerm);
    }
  });
});
