// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Display Constants
 *
 * WU-2010: Named constants for terminal UI rendering, including
 * separator widths, progress bar dimensions, and padding.
 *
 * @module constants/display-constants
 */

/** Width of the section separator line in terminal dashboard */
export const SECTION_SEPARATOR_WIDTH = 80;

/** Width of the DoD progress bar in terminal dashboard */
export const PROGRESS_BAR_WIDTH = 30;

/** Padding width for severity labels in terminal output */
export const SEVERITY_LABEL_PAD_WIDTH = 6;

/** Number of header lines to preserve when truncating sections */
export const SECTION_HEADER_LINE_COUNT = 2;

/** Pass rate threshold for green (good) display colour */
export const PASS_RATE_GREEN_THRESHOLD = 90;

/** Pass rate threshold for yellow (warning) display colour */
export const PASS_RATE_YELLOW_THRESHOLD = 50;

// WU-2044: MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND consolidated into duration-constants.ts
// Re-export from canonical location for backward compatibility
export { MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from './duration-constants.js';
