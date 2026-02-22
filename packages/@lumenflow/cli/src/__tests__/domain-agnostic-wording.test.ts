// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIRNAME = fileURLToPath(new URL('.', import.meta.url));
const SOURCE_DIR = join(TEST_DIRNAME, '..');

const CLI_FILES_TO_SCAN = [
  join(SOURCE_DIR, 'pack-scaffold.ts'),
  join(SOURCE_DIR, 'task-claim.ts'),
] as const;

const CLI_PROHIBITED_DOMAIN_TERMS = [
  'domain-specific metadata',
  'domain-specific tools and policies',
] as const;

describe('CLI wording should remain domain-agnostic', () => {
  it('does not use domain-specific phrasing in command descriptions and templates', () => {
    const sourceSnapshot = CLI_FILES_TO_SCAN.map((sourcePath) =>
      readFileSync(sourcePath, 'utf-8'),
    ).join('\n');

    for (const prohibitedTerm of CLI_PROHIBITED_DOMAIN_TERMS) {
      expect(sourceSnapshot).not.toContain(prohibitedTerm);
    }
  });
});
