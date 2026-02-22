// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Duration Constants
 *
 * WU-2010: Named constants for duration values expressed in milliseconds.
 * Consolidates the various day/hour/minute calculations scattered across
 * lumenflow-config-schema.ts and other modules.
 *
 * @module constants/duration-constants
 */

/** Milliseconds in one second */
const MS_PER_SECOND = 1_000;

/** Milliseconds in one minute */
const MS_PER_MINUTE = 60 * MS_PER_SECOND;

/** Milliseconds in one hour */
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

/** Milliseconds in one day */
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Duration constants in milliseconds, used as schema defaults.
 */
export const DURATION_MS = Object.freeze({
  /** 7 days in milliseconds (signal cleanup TTL for read signals) */
  SEVEN_DAYS: 7 * MS_PER_DAY,

  /** 30 days in milliseconds (signal cleanup TTL for unread signals, checkpoint TTL) */
  THIRTY_DAYS: 30 * MS_PER_DAY,

  /** 90 days in milliseconds (event archival threshold) */
  NINETY_DAYS: 90 * MS_PER_DAY,
});
