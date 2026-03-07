// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('WU-2341: JSONL merge strategy prevents conflicts', () => {
  it('.gitattributes configures merge=union for wu-events.jsonl', () => {
    const projectRoot = resolve(import.meta.dirname, '../../../../..');
    const gitattributes = readFileSync(
      resolve(projectRoot, '.gitattributes'),
      'utf-8',
    );
    expect(gitattributes).toContain('wu-events.jsonl');
    expect(gitattributes).toContain('merge=union');
  });
});
