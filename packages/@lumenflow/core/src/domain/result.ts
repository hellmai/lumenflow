// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Result Type - Discriminated Union for Error Contracts
 *
 * WU-2128: Standardize error return contracts
 *
 * Contract:
 * - Ports THROW on failure (boundary contracts at the hexagonal architecture edge)
 * - Adapters RETURN Result<T, E> (no exceptions in adapter layer)
 * - CLI command handlers CATCH and format errors for user output
 *
 * This module defines the canonical Result<T, E> discriminated union type
 * used by adapter implementations. It follows the same pattern as the
 * existing ParseResult<T> in test-baseline.ts but with a generic error type.
 *
 * @module domain/result
 */

// =============================================================================
// Result Type
// =============================================================================

/**
 * Success variant of the Result type.
 */
export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Failure variant of the Result type.
 */
export interface Failure<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Discriminated union representing either a successful value or an error.
 *
 * Adapters return Result<T, E> instead of throwing exceptions.
 * This enables predictable error handling without try-catch in calling code.
 *
 * @typeParam T - The success value type
 * @typeParam E - The error type (defaults to Error)
 *
 * @example
 * ```typescript
 * // Adapter returning Result
 * async resolveLocation(cwd?: string): Promise<Result<LocationContext>> {
 *   try {
 *     const location = await this.resolveLocationFn(cwd);
 *     return ok(location);
 *   } catch (error) {
 *     return fail(error instanceof Error ? error : new Error(String(error)));
 *   }
 * }
 *
 * // Consumer using Result
 * const result = await adapter.resolveLocation();
 * if (result.ok) {
 *   console.log(result.value.type); // 'main' | 'worktree'
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */
export type Result<T, E = Error> = Success<T> | Failure<E>;

// =============================================================================
// Constructor Functions
// =============================================================================

/**
 * Create a Success result.
 *
 * @param value - The success value
 * @returns A Success<T> instance
 */
export function ok<T>(value: T): Success<T> {
  return { ok: true, value };
}

/**
 * Create a Failure result.
 *
 * @param error - The error value
 * @returns A Failure<E> instance
 */
export function fail<E = Error>(error: E): Failure<E> {
  return { ok: false, error };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Unwrap a Result, throwing the error if it is a Failure.
 *
 * Useful at port boundaries where the contract is to throw.
 *
 * @param result - The Result to unwrap
 * @returns The success value
 * @throws The error value if Result is a Failure
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a Result with a default value for the Failure case.
 *
 * @param result - The Result to unwrap
 * @param defaultValue - The value to return if Result is a Failure
 * @returns The success value or the default value
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Map the success value of a Result.
 *
 * @param result - The Result to map
 * @param fn - The mapping function
 * @returns A new Result with the mapped value, or the original Failure
 */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Wrap a throwing function into a Result-returning function.
 *
 * @param fn - A function that may throw
 * @returns A Result containing the return value or the caught error
 */
export function tryCatch<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn());
  } catch (error) {
    return fail(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Wrap an async throwing function into a Result-returning function.
 *
 * @param fn - An async function that may throw
 * @returns A Promise<Result> containing the return value or the caught error
 */
export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(error instanceof Error ? error : new Error(String(error)));
  }
}
