// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Gate Configuration Constants
 *
 * WU-2010: Centralizes magic numbers for gates, including
 * pre-commit/local gates AND config-driven gate thresholds.
 * Used by gates-pre-commit.ts, gates-local.ts, gates-config.ts,
 * and lumenflow-config-schema.ts.
 */

/** Gate execution configuration */
export const GATE_CONFIG = {
  /** Maximum execution time per gate step (ms) */
  TIMEOUT_MS: 180000,

  /** Maximum file size allowed in commits (bytes) - 5MB */
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024,

  /** Total number of gates (for progress display) */
  TOTAL_GATES: 14,
};

/** Default minimum code coverage percentage (used by TDD methodology) */
export const DEFAULT_MIN_COVERAGE = 90;

/** Default maximum allowed ESLint warnings before gate failure */
export const DEFAULT_MAX_ESLINT_WARNINGS = 100;

/** Default timeout for individual gate commands in gates-config (ms) */
export const DEFAULT_GATE_TIMEOUT_MS = 120_000; // 2 minutes
