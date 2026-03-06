// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * WU-2243: initiative:create --phase and --success-metric flags must populate
 * the phases and success_metrics arrays in the created YAML.
 *
 * The parser now normalizes custom option names, so initiative:create should
 * read the canonical `args.initPhase` and `args.successMetric` keys when
 * writing YAML and running completeness validation.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC_PATH = path.join(__dirname, '..', 'src', 'initiative-create.ts');

describe('WU-2243: initiative:create --phase and --success-metric flags', () => {
  it('main() passes args.initPhase and args.successMetric to YAML creation', () => {
    const content = fs.readFileSync(SRC_PATH, 'utf-8');
    const callBlock = extractCreateCallOptionsBlock(content);

    expect(callBlock).toBeTruthy();
    expect(callBlock).toMatch(/initPhase:\s*args\.initPhase/);
    expect(callBlock).toMatch(/successMetric:\s*args\.successMetric/);
  });

  it('completeness validation uses args.initPhase and args.successMetric', () => {
    const content = fs.readFileSync(SRC_PATH, 'utf-8');
    const completenessBlock = extractCompletenessBlock(content);

    expect(completenessBlock).toBeTruthy();
    expect(completenessBlock).toMatch(/const\s+completenessPhases\s*=\s*args\.initPhase/);
    expect(completenessBlock).toMatch(/const\s+completenessMetrics\s*=\s*args\.successMetric/);
    expect(completenessBlock).not.toMatch(/phases:\s*\[\s*\]/);
    expect(completenessBlock).not.toMatch(/success_metrics:\s*\[\s*\]/);
  });
});

function extractCreateCallOptionsBlock(source: string): string | null {
  const pattern = /createInitiativeYamlInWorktree\([^{]*\{[^}]*initPhase[^}]*successMetric[^}]*\}/s;
  const match = source.match(pattern);
  return match ? match[0] : null;
}

function extractCompletenessBlock(source: string): string | null {
  const pattern =
    /const\s+completenessPhases\s*=\s*args\.initPhase[\s\S]*?const\s+initContent\s*=\s*\{[\s\S]*?success_metrics:\s*completenessMetrics[\s\S]*?\};/;
  const match = source.match(pattern);
  return match ? match[0] : null;
}
