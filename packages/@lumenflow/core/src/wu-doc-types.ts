// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * WU Document Type Definitions (WU-2044)
 *
 * Canonical type for parsed WU YAML documents. Previously independently
 * defined in 7+ files (spawn-agent-guidance.ts, wu-done-paths.ts,
 * code-path-validator.ts, lane-checker.ts, wu-repair-core.ts,
 * wu-status-transition.ts, wu-transaction-collectors.ts).
 *
 * This module defines a base type covering the superset of fields
 * needed across consumers. Files needing only a subset can use
 * Pick<WUDocBase, 'field1' | 'field2'>.
 *
 * @module wu-doc-types
 */

/**
 * Base WU document interface representing a parsed WU YAML file.
 *
 * All fields are optional since they may not be present depending
 * on the WU's lifecycle stage or type.
 */
export interface WUDocBase extends Record<string, unknown> {
  id?: string;
  title?: string;
  lane?: string;
  type?: string;
  status?: string;
  description?: string;
  acceptance?: string[];
  code_paths?: string[];
  spec_refs?: string[];
  notes?: string;
  risks?: string[];
  initiative?: string;
  worktree_path?: string;
  claimed_mode?: string;
  claimed_branch?: string;
  claimed_at?: string;
  locked?: boolean;
  created?: unknown;
  completed?: unknown;
  completed_at?: string;
  tests?: {
    manual?: string[];
    unit?: string[];
    e2e?: string[];
  };
}
