// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * WU-2246: initiative:create --description flag must populate the description
 * field in the created YAML.
 *
 * The bug: Commander.js maps `--description <text>` to `opts.description`,
 * but the code reads `args.initDescription` (from the WUOption.name field,
 * which Commander ignores). The value is therefore always undefined.
 *
 * Tests:
 * 1. main() passes args.description (not args.initDescription) to createInitiativeYamlInWorktree
 * 2. createInitiativeYamlInWorktree populates description from options.initDescription
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC_PATH = path.join(__dirname, '..', 'src', 'initiative-create.ts');

describe('WU-2246: initiative:create --description flag populates YAML', () => {
  it('main() passes args.description (Commander key) to createInitiativeYamlInWorktree', () => {
    const content = fs.readFileSync(SRC_PATH, 'utf-8');

    // Find the call to createInitiativeYamlInWorktree in main()
    // The options object should use args.description, not args.initDescription
    // because Commander maps --description to opts.description
    const callBlock = extractCreateCallOptionsBlock(content);
    expect(callBlock).toBeTruthy();

    // The initDescription property should be set from args.description
    // NOT from args.initDescription (which Commander never sets)
    expect(callBlock).toMatch(/initDescription:\s*args\.description/);
  });

  it('completeness validation uses args.description for description field', () => {
    const content = fs.readFileSync(SRC_PATH, 'utf-8');

    // Find the completeness validation block
    const completenessBlock = extractCompletenessBlock(content);
    expect(completenessBlock).toBeTruthy();

    // The description field should use args.description, not args.initDescription
    expect(completenessBlock).toMatch(/description:\s*args\.description/);
  });
});

/**
 * Extract the options block passed to createInitiativeYamlInWorktree in main().
 * This is the object literal containing initDescription, initPhase, successMetric.
 */
function extractCreateCallOptionsBlock(source: string): string | null {
  // Match the options object passed to createInitiativeYamlInWorktree
  const pattern = /createInitiativeYamlInWorktree\([^{]*\{[^}]*initDescription[^}]*\}/s;
  const match = source.match(pattern);
  return match ? match[0] : null;
}

/**
 * Extract the completeness validation initContent block.
 */
function extractCompletenessBlock(source: string): string | null {
  const pattern =
    /const\s+initContent\s*=\s*\{[^}]*description[^}]*success_metrics[^}]*\};\s*const\s+completenessResult/s;
  const match = source.match(pattern);
  if (match) return match[0];

  // Fallback
  const fallbackPattern =
    /const\s+initContent\s*=\s*\{[^}]*description[^}]*\};\s*const\s+completenessResult/s;
  const fallbackMatch = source.match(fallbackPattern);
  return fallbackMatch ? fallbackMatch[0] : null;
}
