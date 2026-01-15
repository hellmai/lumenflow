/**
 * @lumenflow/core - Core WU lifecycle tools
 *
 * The foundational package for LumenFlow workflow management.
 * This package provides wu:claim, wu:done, wu:block, wu:unblock and related utilities.
 *
 * @packageDocumentation
 */

// Package version
export const VERSION = '0.0.0';

// Git utilities (also available via @lumenflow/core/git)
export {
  GitAdapter,
  createGitAdapter,
  WorktreeManager,
  createWorktreeManager,
  type GitAdapterOptions,
  type GitStatus,
  type PushOptions,
  type FetchOptions,
  type CommitResult,
  type MergeResult,
  type WorktreeManagerOptions,
  type WorktreeInfo,
  type WorktreeCreateOptions,
  type WorktreeRemoveOptions,
  type WorktreeCreateResult,
} from './git/index.js';

// Gates utilities (also available via @lumenflow/core/gates)
export {
  runGates,
  type GateName,
  type GateResult,
  type GatesResult,
  type RunGatesOptions,
} from './gates/index.js';
