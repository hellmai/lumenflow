// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * WU-2010: Constants Module Integration Tests
 *
 * Verifies that all extracted constants from the constants/ barrel export
 * are well-formed, correctly typed, and internally consistent.
 */

import { describe, it, expect } from 'vitest';
import {
  // Lock constants
  LOCK_TIMEOUT_MS,
  MERGE_LOCK_STALE_MS,
  CLEANUP_LOCK_STALE_MS,
  LOCK_POLL_INTERVAL_MS,

  // Git constants
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

  // Validation constants
  INLINE_KEYWORD_MAX_OFFSET,

  // Display constants
  SECTION_SEPARATOR_WIDTH,
  PROGRESS_BAR_WIDTH,
  SEVERITY_LABEL_PAD_WIDTH,
  SECTION_HEADER_LINE_COUNT,
  PASS_RATE_GREEN_THRESHOLD,
  PASS_RATE_YELLOW_THRESHOLD,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,

  // Gate constants
  GATE_CONFIG,
  DEFAULT_MIN_COVERAGE,
  DEFAULT_MAX_ESLINT_WARNINGS,
  DEFAULT_GATE_TIMEOUT_MS,

  // Duration constants
  DURATION_MS,
} from '../constants/index.js';

describe('WU-2010: Extracted constants', () => {
  describe('lock constants', () => {
    it('LOCK_TIMEOUT_MS is a positive number', () => {
      expect(LOCK_TIMEOUT_MS).toBeGreaterThan(0);
      expect(typeof LOCK_TIMEOUT_MS).toBe('number');
    });

    it('MERGE_LOCK_STALE_MS is greater than LOCK_TIMEOUT_MS', () => {
      expect(MERGE_LOCK_STALE_MS).toBeGreaterThan(LOCK_TIMEOUT_MS);
    });

    it('CLEANUP_LOCK_STALE_MS is greater than MERGE_LOCK_STALE_MS', () => {
      expect(CLEANUP_LOCK_STALE_MS).toBeGreaterThan(MERGE_LOCK_STALE_MS);
    });

    it('LOCK_POLL_INTERVAL_MS is less than LOCK_TIMEOUT_MS', () => {
      expect(LOCK_POLL_INTERVAL_MS).toBeLessThan(LOCK_TIMEOUT_MS);
    });
  });

  describe('git constants', () => {
    it('SHA1_HEX_LENGTH is 40', () => {
      expect(SHA1_HEX_LENGTH).toBe(40);
    });

    it('GIT_COMMAND_TIMEOUT_MS is positive', () => {
      expect(GIT_COMMAND_TIMEOUT_MS).toBeGreaterThan(0);
    });

    it('GIT_MAX_BUFFER_BYTES is at least 1MB', () => {
      expect(GIT_MAX_BUFFER_BYTES).toBeGreaterThanOrEqual(1024 * 1024);
    });

    it('GIT_DEFAULT_MAX_COMMITS is positive', () => {
      expect(GIT_DEFAULT_MAX_COMMITS).toBeGreaterThan(0);
    });

    it('GIT_DEFAULT_MAX_RESULTS is positive', () => {
      expect(GIT_DEFAULT_MAX_RESULTS).toBeGreaterThan(0);
    });

    it('GIT_MIN_COMMIT_COUNT is positive', () => {
      expect(GIT_MIN_COMMIT_COUNT).toBeGreaterThan(0);
    });

    it('GIT_MIN_CO_OCCURRENCE_COUNT is at least 2', () => {
      expect(GIT_MIN_CO_OCCURRENCE_COUNT).toBeGreaterThanOrEqual(2);
    });

    it('GIT_MAX_TOP_LEVEL_DIRS is positive', () => {
      expect(GIT_MAX_TOP_LEVEL_DIRS).toBeGreaterThan(0);
    });

    it('GIT_SUMMARY_ITEM_LIMIT is positive', () => {
      expect(GIT_SUMMARY_ITEM_LIMIT).toBeGreaterThan(0);
    });

    it('CHARS_PER_TOKEN is positive', () => {
      expect(CHARS_PER_TOKEN).toBeGreaterThan(0);
    });

    it('GIT_DEFAULT_MAX_SUMMARY_TOKENS is positive', () => {
      expect(GIT_DEFAULT_MAX_SUMMARY_TOKENS).toBeGreaterThan(0);
    });

    it('GIT_TRUNCATION_PADDING is non-negative', () => {
      expect(GIT_TRUNCATION_PADDING).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validation constants', () => {
    it('INLINE_KEYWORD_MAX_OFFSET is positive', () => {
      expect(INLINE_KEYWORD_MAX_OFFSET).toBeGreaterThan(0);
    });
  });

  describe('display constants', () => {
    it('SECTION_SEPARATOR_WIDTH is positive', () => {
      expect(SECTION_SEPARATOR_WIDTH).toBeGreaterThan(0);
    });

    it('PROGRESS_BAR_WIDTH is positive', () => {
      expect(PROGRESS_BAR_WIDTH).toBeGreaterThan(0);
    });

    it('SEVERITY_LABEL_PAD_WIDTH is positive', () => {
      expect(SEVERITY_LABEL_PAD_WIDTH).toBeGreaterThan(0);
    });

    it('SECTION_HEADER_LINE_COUNT is positive', () => {
      expect(SECTION_HEADER_LINE_COUNT).toBeGreaterThan(0);
    });

    it('PASS_RATE_GREEN_THRESHOLD is greater than PASS_RATE_YELLOW_THRESHOLD', () => {
      expect(PASS_RATE_GREEN_THRESHOLD).toBeGreaterThan(PASS_RATE_YELLOW_THRESHOLD);
    });

    it('time conversion constants are consistent', () => {
      expect(MS_PER_SECOND).toBe(1_000);
      expect(MS_PER_MINUTE).toBe(60 * MS_PER_SECOND);
      expect(MS_PER_HOUR).toBe(60 * MS_PER_MINUTE);
    });
  });

  describe('gate constants', () => {
    it('GATE_CONFIG has required fields', () => {
      expect(GATE_CONFIG).toHaveProperty('TIMEOUT_MS');
      expect(GATE_CONFIG).toHaveProperty('MAX_FILE_SIZE_BYTES');
      expect(GATE_CONFIG).toHaveProperty('TOTAL_GATES');
    });

    it('DEFAULT_MIN_COVERAGE is between 0 and 100', () => {
      expect(DEFAULT_MIN_COVERAGE).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_MIN_COVERAGE).toBeLessThanOrEqual(100);
    });

    it('DEFAULT_MAX_ESLINT_WARNINGS is non-negative', () => {
      expect(DEFAULT_MAX_ESLINT_WARNINGS).toBeGreaterThanOrEqual(0);
    });

    it('DEFAULT_GATE_TIMEOUT_MS is positive', () => {
      expect(DEFAULT_GATE_TIMEOUT_MS).toBeGreaterThan(0);
    });
  });

  describe('duration constants', () => {
    it('DURATION_MS.SEVEN_DAYS is 7 days in milliseconds', () => {
      const expectedMs = 7 * 24 * 60 * 60 * 1000;
      expect(DURATION_MS.SEVEN_DAYS).toBe(expectedMs);
    });

    it('DURATION_MS.THIRTY_DAYS is 30 days in milliseconds', () => {
      const expectedMs = 30 * 24 * 60 * 60 * 1000;
      expect(DURATION_MS.THIRTY_DAYS).toBe(expectedMs);
    });

    it('DURATION_MS.NINETY_DAYS is 90 days in milliseconds', () => {
      const expectedMs = 90 * 24 * 60 * 60 * 1000;
      expect(DURATION_MS.NINETY_DAYS).toBe(expectedMs);
    });

    it('durations are in ascending order', () => {
      expect(DURATION_MS.SEVEN_DAYS).toBeLessThan(DURATION_MS.THIRTY_DAYS);
      expect(DURATION_MS.THIRTY_DAYS).toBeLessThan(DURATION_MS.NINETY_DAYS);
    });

    it('DURATION_MS is frozen (immutable)', () => {
      expect(Object.isFrozen(DURATION_MS)).toBe(true);
    });
  });
});
