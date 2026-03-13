// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('WU-2166: memory and telemetry extraction', () => {
  it('routes wu:done memory/telemetry concerns through dedicated module', async () => {
    const source = await readFile(new URL('../wu-done.ts', import.meta.url), 'utf-8');

    expect(source).toContain("from './wu-done-memory-telemetry.js'");
    expect(source).not.toContain('export const CHECKPOINT_GATE_MODES =');
    expect(source).not.toContain('export function resolveCheckpointGateMode(');
    expect(source).not.toContain('export async function enforceCheckpointGateForDone(');
    expect(source).not.toContain('async function createPreGatesCheckpoint(');
    expect(source).not.toContain('async function broadcastCompletionSignal(');
    expect(source).not.toContain('async function checkInboxForRecentSignals(');
    expect(source).not.toContain('export function emitTelemetry(');
  });

  it('uses legacy-compatible signal loading only in the non-blocking inbox helper', async () => {
    const source = await readFile(
      new URL('../wu-done-memory-telemetry.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toContain("compatibilityMode: 'skip-legacy'");
    expect(source).toContain('Could not check inbox for signals');
  });
});
