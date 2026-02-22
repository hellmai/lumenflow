// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Git-Related Constants
 *
 * WU-2010: Named constants for git-related magic numbers
 * used across git-context-extractor.ts and other modules.
 *
 * @module constants/git-constants
 */

/** Length of a full SHA-1 hex commit hash */
export const SHA1_HEX_LENGTH = 40;

/** Default timeout for git command execution (ms) */
export const GIT_COMMAND_TIMEOUT_MS = 30_000; // 30 seconds

/** Maximum buffer size for git command output (bytes) */
export const GIT_MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB

/** Default maximum number of commits to analyze for git context */
export const GIT_DEFAULT_MAX_COMMITS = 500;

/** Default maximum number of results returned from git analysis */
export const GIT_DEFAULT_MAX_RESULTS = 20;

/** Minimum number of commits required for meaningful history analysis */
export const GIT_MIN_COMMIT_COUNT = 10;

/** Minimum co-occurrence count to include a file pair */
export const GIT_MIN_CO_OCCURRENCE_COUNT = 2;

/** Maximum top-level directories to analyze for ownership */
export const GIT_MAX_TOP_LEVEL_DIRS = 20;

/** Number of co-occurrence/churn items to include in summaries */
export const GIT_SUMMARY_ITEM_LIMIT = 10;

/** Rough approximation of characters per LLM token */
export const CHARS_PER_TOKEN = 4;

/** Default max tokens for git context summaries */
export const GIT_DEFAULT_MAX_SUMMARY_TOKENS = 500;

/** Truncation padding for section headers */
export const GIT_TRUNCATION_PADDING = 20;
