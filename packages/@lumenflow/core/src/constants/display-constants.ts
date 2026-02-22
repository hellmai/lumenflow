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

/** Milliseconds per hour (for duration formatting) */
export const MS_PER_HOUR = 1_000 * 60 * 60;

/** Milliseconds per minute (for duration formatting) */
export const MS_PER_MINUTE = 1_000 * 60;

/** Milliseconds per second (for duration formatting) */
export const MS_PER_SECOND = 1_000;
