// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Shared Lock Constants
 *
 * WU-2010: Consolidated lock-related constants used by both
 * merge-lock.ts and cleanup-lock.ts to eliminate duplication.
 *
 * @module constants/lock-constants
 */

/**
 * Default timeout for waiting to acquire a lock (ms).
 * After this time, acquisition fails if the lock is held.
 */
export const LOCK_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Time after which a merge lock is considered stale (ms).
 * Should be greater than expected merge operation duration.
 */
export const MERGE_LOCK_STALE_MS = 60_000; // 60 seconds

/**
 * Time after which a cleanup lock is considered stale (ms).
 * Cleanup is slower than merge, so a longer timeout is used.
 */
export const CLEANUP_LOCK_STALE_MS = 5 * 60 * 1_000; // 5 minutes

/**
 * Polling interval for lock acquisition retries (ms).
 * Used by both merge and cleanup lock loops.
 */
export const LOCK_POLL_INTERVAL_MS = 500;
