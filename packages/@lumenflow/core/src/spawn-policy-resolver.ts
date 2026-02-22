// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @file spawn-policy-resolver.ts
 * WU-2012: Extracted from wu-spawn.ts
 *
 * Generates policy-based sections for spawn prompts: mandatory standards,
 * enforcement summaries, and methodology telemetry.
 *
 * Single responsibility: Transform resolved methodology policies into
 * prompt sections that communicate standards and enforcement to sub-agents.
 *
 * @module spawn-policy-resolver
 */

import type { ResolvedPolicy } from './resolve-policy.js';
import { emit as emitTelemetryEvent } from './telemetry.js';
import { LUMENFLOW_PATHS } from './wu-constants.js';
import type { LumenFlowConfig } from './lumenflow-config-schema.js';

// Re-export from spawn-guidance-generators where the canonical implementations live
export {
  generateMandatoryStandards,
  generateEnforcementSummary,
} from './spawn-guidance-generators.js';

/**
 * WU-1270: Emit methodology telemetry event (opt-in)
 *
 * Emits privacy-preserving telemetry about methodology selection.
 * Only emits if telemetry.methodology.enabled is true in config.
 *
 * @param config - LumenFlow configuration
 * @param policy - Resolved methodology policy
 */
export function emitMethodologyTelemetry(config: LumenFlowConfig, policy: ResolvedPolicy): void {
  // Check if methodology telemetry is opt-in enabled
  if (!config.telemetry?.methodology?.enabled) {
    return;
  }

  const event = {
    timestamp: new Date().toISOString(),
    event_type: 'methodology.selection',
    methodology_testing: policy.testing,
    methodology_architecture: policy.architecture,
    event_context: 'spawn',
  };

  // Use the telemetry emit function from telemetry.ts - WU-1430: Use centralized constant
  emitTelemetryEvent(LUMENFLOW_PATHS.METHODOLOGY_LOG, event);
}
