#!/usr/bin/env node
// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * WU Verify Command (WU-2350)
 *
 * Stable CLI wrapper for agent-verification. Verifies that a WU has been
 * completed and merged to main by checking:
 *   1. Working tree is clean
 *   2. Completion stamp exists
 *   3. Main history contains a commit updating the WU YAML
 *
 * This command replaces the hardcoded direct-path invocation of agent-verification.js
 * that only worked in lumenflow-dev but not in consumer repos.
 *
 * Usage:
 *   pnpm wu:verify --id WU-123
 */

import { createWUParser, WU_OPTIONS } from '@lumenflow/core/arg-parser';
import { EXIT_CODES } from '@lumenflow/core/wu-constants';
import { verifyWUComplete, debugSummary } from '@lumenflow/agent/verification';

const opts = createWUParser({
  name: 'wu-verify',
  description: 'Verify WU completion (stamp, commit, clean tree)',
  options: [WU_OPTIONS.id],
  required: ['id'],
});

const id: string = opts.id;

try {
  const result = verifyWUComplete(id);
  const message = debugSummary(result);
  // eslint-disable-next-line no-console -- CLI output
  console.log(message);
  process.exit(result.complete ? EXIT_CODES.SUCCESS : EXIT_CODES.ERROR);
} catch (error) {
  // eslint-disable-next-line no-console -- CLI error output
  console.error(
    `Verification error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(EXIT_CODES.ERROR);
}
