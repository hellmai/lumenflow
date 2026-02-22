// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Constants Barrel Export
 *
 * WU-2010: Central re-export for all named constants.
 * Includes both pre-existing domain constants and new
 * WU-2010 extractions from business logic.
 *
 * @module constants
 */

// Pre-existing domain constants
export { IN_PROGRESS_HEADERS, WU_LINK_PATTERN, isInProgressHeader } from './backlog-patterns.js';
export {
  DEPLOYMENT_FREQUENCY,
  LEAD_TIME_HOURS,
  CFR_PERCENT,
  MTTR_HOURS,
  STATISTICS,
} from './dora-constants.js';
export { LINTER_CONFIG } from './linter-constants.js';
export { TOKENIZER } from './tokenizer-constants.js';

// WU-2010: Lock constants (shared between merge-lock.ts and cleanup-lock.ts)
export {
  LOCK_TIMEOUT_MS,
  MERGE_LOCK_STALE_MS,
  CLEANUP_LOCK_STALE_MS,
  LOCK_POLL_INTERVAL_MS,
} from './lock-constants.js';

// WU-2010: Git analysis constants (git-context-extractor.ts)
export {
  SHA1_HEX_LENGTH,
  GIT_COMMAND_TIMEOUT_MS,
  GIT_MAX_BUFFER_BYTES,
  GIT_DEFAULT_MAX_COMMITS,
  GIT_DEFAULT_MAX_RESULTS,
  GIT_MIN_COMMIT_COUNT,
  GIT_MIN_CO_OCCURRENCE_COUNT,
  GIT_MAX_TOP_LEVEL_DIRS,
  GIT_SUMMARY_ITEM_LIMIT,
  CHARS_PER_TOKEN,
  GIT_DEFAULT_MAX_SUMMARY_TOKENS,
  GIT_TRUNCATION_PADDING,
} from './git-constants.js';

// WU-2010: Validation constants (code-path-validator.ts, wu-validator.ts)
export { INLINE_KEYWORD_MAX_OFFSET } from './validation-constants.js';

// WU-2010: Display constants (terminal-renderer.adapter.ts)
// WU-2044: MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND now exported from duration-constants.ts
export {
  SECTION_SEPARATOR_WIDTH,
  PROGRESS_BAR_WIDTH,
  SEVERITY_LABEL_PAD_WIDTH,
  SECTION_HEADER_LINE_COUNT,
  PASS_RATE_GREEN_THRESHOLD,
  PASS_RATE_YELLOW_THRESHOLD,
} from './display-constants.js';

// WU-2010: Gate threshold constants (gates-config.ts, lumenflow-config-schema.ts)
export {
  GATE_CONFIG,
  DEFAULT_MIN_COVERAGE,
  DEFAULT_MAX_ESLINT_WARNINGS,
  DEFAULT_GATE_TIMEOUT_MS,
} from './gate-constants.js';

// WU-2010: Duration constants (lumenflow-config-schema.ts)
// WU-2044: Export primitive duration constants alongside DURATION_MS
export {
  MS_PER_SECOND,
  MS_PER_MINUTE,
  MS_PER_HOUR,
  MS_PER_DAY,
  DURATION_MS,
} from './duration-constants.js';
