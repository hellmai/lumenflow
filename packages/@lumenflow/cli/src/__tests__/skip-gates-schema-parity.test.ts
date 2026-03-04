// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @file skip-gates-schema-parity.test.ts
 * @description Tests for skip-gates audit writer/reader parity (WU-2315)
 *
 * Bug: Writer (wu-done.ts) writes to .log without gate field.
 *      Reader (metrics-snapshot.ts) expects .ndjson with gate field.
 *      Result: CFR always computes as 0%.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/** Path constant used by metrics-snapshot reader */
const READER_PATH = '.lumenflow/skip-gates-audit.ndjson';

/** Regex to extract the skip-gates audit path from wu-done.ts writer */
const WRITER_PATH_REGEX = /skip-gates-audit\.\w+/;

describe('WU-2315: skip-gates audit schema parity', () => {
  it('writer and reader should use the same file extension', () => {
    const writerSource = readFileSync(
      join(__dirname, '../wu-done.ts'),
      'utf-8',
    );

    const writerPathMatch = writerSource.match(WRITER_PATH_REGEX);
    expect(writerPathMatch).not.toBeNull();

    const writerFilename = writerPathMatch![0];
    const readerFilename = READER_PATH.split('/').pop();

    expect(writerFilename).toBe(readerFilename);
  });

  it('writer should include gate field in audit entry', () => {
    const writerSource = readFileSync(
      join(__dirname, '../wu-done.ts'),
      'utf-8',
    );

    // The auditSkipGates function should produce entries with a gate field
    // so the reader's validation (raw.gate check) can succeed
    expect(writerSource).toContain('gate:');
  });
});
