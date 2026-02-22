// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Validation Constants
 *
 * WU-2010: Named constants for validation thresholds and bounds
 * used across code-path-validator.ts, wu-validator.ts, and others.
 *
 * @module constants/validation-constants
 */

/**
 * Maximum character offset from comment start to consider a keyword
 * as actionable (e.g., TODO, FIXME). Keywords buried deeper in
 * comment prose are treated as documentation, not action items.
 */
export const INLINE_KEYWORD_MAX_OFFSET = 10;
