// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @file result.test.ts
 * @description Tests for Result<T,E> discriminated union type
 *
 * WU-2128: Standardize error return contracts
 *
 * TDD: RED phase - Tests written FIRST.
 */

import { describe, it, expect } from 'vitest';
import {
  ok,
  fail,
  unwrap,
  unwrapOr,
  mapResult,
  tryCatch,
  tryCatchAsync,
  type Result,
  type Success,
  type Failure,
} from '../../domain/result.js';

describe('Result type', () => {
  describe('ok()', () => {
    it('creates a Success result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
    });

    it('works with complex types', () => {
      const result = ok({ id: 'WU-2128', status: 'in_progress' });
      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ id: 'WU-2128', status: 'in_progress' });
    });

    it('works with null value', () => {
      const result = ok(null);
      expect(result.ok).toBe(true);
      expect(result.value).toBeNull();
    });
  });

  describe('fail()', () => {
    it('creates a Failure result', () => {
      const error = new Error('something went wrong');
      const result = fail(error);
      expect(result.ok).toBe(false);
      expect(result.error).toBe(error);
    });

    it('works with custom error types', () => {
      const result = fail({ code: 'NOT_FOUND', message: 'WU not found' });
      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ code: 'NOT_FOUND', message: 'WU not found' });
    });
  });

  describe('discriminated union', () => {
    it('narrows type via ok property', () => {
      const result: Result<number, Error> = ok(42);
      if (result.ok) {
        // TypeScript narrows to Success<number>
        const _value: number = result.value;
        expect(_value).toBe(42);
      } else {
        // TypeScript narrows to Failure<Error>
        const _error: Error = result.error;
        expect(_error).toBeDefined(); // should not reach
      }
    });

    it('Success has no error property', () => {
      const result: Success<number> = ok(42);
      expect(result).not.toHaveProperty('error');
    });

    it('Failure has no value property', () => {
      const result: Failure<Error> = fail(new Error('test'));
      expect(result).not.toHaveProperty('value');
    });
  });

  describe('unwrap()', () => {
    it('returns value for Success', () => {
      const result = ok(42);
      expect(unwrap(result)).toBe(42);
    });

    it('throws error for Failure', () => {
      const error = new Error('test error');
      const result = fail(error);
      expect(() => unwrap(result)).toThrow('test error');
    });
  });

  describe('unwrapOr()', () => {
    it('returns value for Success', () => {
      const result = ok(42);
      expect(unwrapOr(result, 0)).toBe(42);
    });

    it('returns default for Failure', () => {
      const result: Result<number> = fail(new Error('test'));
      expect(unwrapOr(result, 0)).toBe(0);
    });
  });

  describe('mapResult()', () => {
    it('maps Success value', () => {
      const result = ok(42);
      const mapped = mapResult(result, (v) => v * 2);
      expect(mapped.ok).toBe(true);
      if (mapped.ok) {
        expect(mapped.value).toBe(84);
      }
    });

    it('passes through Failure unchanged', () => {
      const error = new Error('test');
      const result: Result<number> = fail(error);
      const mapped = mapResult(result, (v) => v * 2);
      expect(mapped.ok).toBe(false);
      if (!mapped.ok) {
        expect(mapped.error).toBe(error);
      }
    });
  });

  describe('tryCatch()', () => {
    it('wraps successful function in ok', () => {
      const result = tryCatch(() => 42);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it('wraps thrown Error in fail', () => {
      const result = tryCatch(() => {
        throw new Error('boom');
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('boom');
      }
    });

    it('wraps non-Error throws in fail with wrapped message', () => {
      const result = tryCatch(() => {
        throw 'string error'; // eslint-disable-line no-throw-literal
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('string error');
        expect(result.error).toBeInstanceOf(Error);
      }
    });
  });

  describe('tryCatchAsync()', () => {
    it('wraps successful async function in ok', async () => {
      const result = await tryCatchAsync(async () => 42);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it('wraps rejected promise in fail', async () => {
      const result = await tryCatchAsync(async () => {
        throw new Error('async boom');
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('async boom');
      }
    });
  });
});
