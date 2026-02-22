// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * WU State Indexer (WU-2013)
 *
 * Manages in-memory WU state and maintains O(1) indexes by status, lane,
 * and parent-child delegation relationships. Applies events to state
 * following the INIT-007 event-sourcing pattern.
 *
 * Single responsibility: in-memory state management and event application.
 *
 * @see {@link ./wu-state-store.ts} - Facade that delegates to this service
 */

import { WU_STATUS } from './wu-constants.js';
import { WU_EVENT_TYPE, type WUEvent } from './wu-state-schema.js';
import type { WUStateEntry, CheckpointOptions } from './ports/wu-state.ports.js';

// Re-export for backward compatibility (consumers importing from wu-state-indexer)
export type { WUStateEntry, CheckpointOptions };

/**
 * WU State Indexer
 *
 * Maintains in-memory WU state with O(1) indexes for status, lane,
 * and parent-child queries. Processes events to update state.
 */
export class WUStateIndexer {
  private wuState: Map<string, WUStateEntry>;
  private byStatus: Map<string, Set<string>>;
  private byLane: Map<string, Set<string>>;
  private byParent: Map<string, Set<string>>;

  constructor() {
    this.wuState = new Map();
    this.byStatus = new Map();
    this.byLane = new Map();
    this.byParent = new Map();
  }

  /**
   * Clear all in-memory state and indexes.
   */
  clear(): void {
    this.wuState.clear();
    this.byStatus.clear();
    this.byLane.clear();
    this.byParent.clear();
  }

  /**
   * Apply an event to the in-memory state.
   */
  applyEvent(event: WUEvent): void {
    const { wuId, type } = event;

    if (type === WU_EVENT_TYPE.CREATE || type === WU_EVENT_TYPE.CLAIM) {
      // Discriminated union narrows to CreateEvent | ClaimEvent (both have lane/title)
      this._setState(wuId, WU_STATUS.IN_PROGRESS, event.lane, event.title);
      return;
    }

    if (type === WU_EVENT_TYPE.BLOCK) {
      this._transitionToStatus(wuId, WU_STATUS.BLOCKED);
      return;
    }

    if (type === WU_EVENT_TYPE.UNBLOCK) {
      this._transitionToStatus(wuId, WU_STATUS.IN_PROGRESS);
      return;
    }

    if (type === WU_EVENT_TYPE.COMPLETE) {
      this._transitionToStatus(wuId, WU_STATUS.DONE);
      // WU-2244: Store completion timestamp for accurate date reporting
      const current = this.wuState.get(wuId);
      if (current) {
        current.completedAt = event.timestamp;
      }
      return;
    }

    if (type === WU_EVENT_TYPE.CHECKPOINT) {
      // Discriminated union narrows to CheckpointEvent (has note field)
      const currentCheckpoint = this.wuState.get(wuId);
      if (currentCheckpoint) {
        currentCheckpoint.lastCheckpoint = event.timestamp;
        currentCheckpoint.lastCheckpointNote = event.note;
      }
      return;
    }

    if (type === WU_EVENT_TYPE.DELEGATION) {
      // Discriminated union narrows to DelegationEvent (has parentWuId)
      const { parentWuId } = event;
      if (!this.byParent.has(parentWuId)) {
        this.byParent.set(parentWuId, new Set());
      }
      this.byParent.get(parentWuId)!.add(wuId);
      return;
    }

    // WU-1080: Handle release event - transitions from in_progress to ready
    if (type === WU_EVENT_TYPE.RELEASE) {
      this._transitionToStatus(wuId, WU_STATUS.READY);
    }
  }

  /**
   * Get current in-memory state for a WU.
   */
  getWUState(wuId: string): WUStateEntry | undefined {
    return this.wuState.get(wuId);
  }

  /**
   * Get WU IDs by status (O(1) lookup).
   */
  getByStatus(status: string): Set<string> {
    return this.byStatus.get(status) ?? new Set();
  }

  /**
   * Get WU IDs by lane (O(1) lookup).
   */
  getByLane(lane: string): Set<string> {
    return this.byLane.get(lane) ?? new Set();
  }

  /**
   * Get child WU IDs delegated from a parent WU (O(1) lookup).
   */
  getChildWUs(parentWuId: string): Set<string> {
    return this.byParent.get(parentWuId) ?? new Set();
  }

  /**
   * Transition WU to a new status if it exists.
   */
  private _transitionToStatus(wuId: string, newStatus: string): void {
    const current = this.wuState.get(wuId);
    if (current) {
      this._setState(wuId, newStatus, current.lane, current.title);
    }
  }

  /**
   * Set WU state and update indexes.
   */
  private _setState(wuId: string, status: string, lane: string, title: string): void {
    // Remove from old status index
    const oldState = this.wuState.get(wuId);
    if (oldState) {
      const oldStatusSet = this.byStatus.get(oldState.status);
      if (oldStatusSet) {
        oldStatusSet.delete(wuId);
      }

      // Remove from old lane index
      const oldLaneSet = this.byLane.get(oldState.lane);
      if (oldLaneSet) {
        oldLaneSet.delete(wuId);
      }
    }

    // Update state
    this.wuState.set(wuId, { status, lane, title });

    // Add to new status index
    if (!this.byStatus.has(status)) {
      this.byStatus.set(status, new Set());
    }
    this.byStatus.get(status)!.add(wuId);

    // Add to new lane index
    if (!this.byLane.has(lane)) {
      this.byLane.set(lane, new Set());
    }
    this.byLane.get(lane)!.add(wuId);
  }
}
