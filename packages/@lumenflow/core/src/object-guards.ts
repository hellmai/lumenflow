// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

export const VALUE_TYPE = {
  OBJECT: 'object',
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
} as const;

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === VALUE_TYPE.OBJECT && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isString(value: unknown): value is string {
  return typeof value === VALUE_TYPE.STRING;
}

export function isNumber(value: unknown): value is number {
  return typeof value === VALUE_TYPE.NUMBER;
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === VALUE_TYPE.BOOLEAN;
}
