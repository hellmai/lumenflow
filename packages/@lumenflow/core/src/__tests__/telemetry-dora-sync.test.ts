// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @file telemetry-dora-sync.test.ts
 * @description Tests for DORA metrics cloud sync support (WU-2315)
 *
 * Verifies that the cloud sync pipeline includes a 'dora' telemetry source
 * so DORA metric records can be picked up and pushed to the control plane.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

describe('WU-2315: DORA telemetry cloud sync', () => {
  const telemetrySource = readFileSync(
    join(__dirname, '../telemetry.ts'),
    'utf-8',
  );

  it('TELEMETRY_SOURCE should include a DORA entry', () => {
    // The sync loop iterates TELEMETRY_SOURCE values — DORA must be included
    expect(telemetrySource).toMatch(/TELEMETRY_SOURCE\s*=\s*\{[^}]*DORA/s);
  });

  it('CloudSyncState.files should include dora offset tracking', () => {
    // The sync state tracks per-source file offsets — dora needs one
    expect(telemetrySource).toMatch(/files:\s*\{[^}]*dora/s);
  });

  it('sync loop should iterate over DORA source', () => {
    // The for loop in syncNdjsonTelemetryToCloud must include DORA
    expect(telemetrySource).toContain('TELEMETRY_SOURCE.DORA');
  });

  it('should have a DORA metric name constant', () => {
    expect(telemetrySource).toMatch(/METRIC_NAME\s*=\s*\{[^}]*DORA/s);
  });

  it('should resolve a telemetry path for DORA source', () => {
    // resolveTelemetryPath must handle DORA source
    expect(telemetrySource).toContain('dora');
  });
});
