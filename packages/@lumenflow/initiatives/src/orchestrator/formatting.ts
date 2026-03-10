// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Output formatting for initiative orchestration.
 *
 * All display/output formatting functions for execution plans,
 * checkpoint waves, progress stats, and spawn commands.
 *
 * WU-2375: Client-capability-aware output formatting.
 * XML Task invocations for Claude, markdown prompts for Codex/Gemini/generic.
 *
 * @module orchestrator/formatting
 */

import { existsSync, readFileSync } from 'node:fs';
import type { WUEntry } from '../initiative-yaml.js';
import type { InitiativeDoc } from '../initiative-yaml.js';
import type { ExecutionPlan, ProgressStats, BottleneckWU, CheckpointWaveResult } from './types.js';
import { getAllDependencies } from './shared.js';
import { WU_STATUS, STRING_LITERALS } from '@lumenflow/core/wu-constants';
import { WU_PATHS } from '@lumenflow/core/wu-paths';
import { parseYAML } from '@lumenflow/core/wu-yaml';
import { createError, ErrorCodes } from '@lumenflow/core/error-handler';
// WU-2027: Import spawn generation for embedding in orchestration output
// WU-2375: Import both XML (Task) and markdown (Codex) prompt generators
import { generateTaskInvocation, generateCodexPrompt } from '@lumenflow/core/wu-spawn';
import { SpawnStrategyFactory } from '@lumenflow/core/spawn-strategy';

/**
 * WU-2280: Banner separator for ACTION REQUIRED output.
 * Used to make it unambiguous that agents have NOT been spawned yet.
 */
const BANNER_SEPARATOR =
  '==============================================================================';

/**
 * WU-2040: XML tag patterns for Task invocation extraction.
 * Split to avoid XML parsing issues in agent tools.
 */
const ANTML_NS = 'antml:';
const XML_PATTERNS = {
  FUNCTION_CALLS_OPEN: `<${ANTML_NS}function_calls>`,
  FUNCTION_CALLS_CLOSE: `</${ANTML_NS}function_calls>`,
  INVOKE_OPEN: `<${ANTML_NS}invoke`,
  INVOKE_CLOSE: `</${ANTML_NS}invoke>`,
};

/**
 * WU-2375: Clients that support XML Task invocations (Claude Code).
 * All other clients receive markdown prompts.
 */
const XML_CAPABLE_CLIENTS = new Set(['claude-code', 'claude']);

/**
 * WU-2375: Check if a client supports XML Task invocations.
 */
function isXmlCapableClient(clientName?: string): boolean {
  return clientName !== undefined && XML_CAPABLE_CLIENTS.has(clientName.toLowerCase());
}

/**
 * Format execution plan for display.
 *
 * WU-2430: Enhanced to show skippedWithReasons and deferred WUs.
 *
 * @param {object} initiative - Initiative document
 * @param {{waves: Array<Array<{id: string, doc: object}>>, skipped: string[], skippedWithReasons?: Array<{id: string, reason: string}>, deferred?: Array<{id: string, blockedBy: string[], reason: string}>}} plan - Execution plan
 * @returns {string} Formatted plan output
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- display formatting inherently complex
export function formatExecutionPlan(initiative: InitiativeDoc, plan: ExecutionPlan): string {
  const lines = [];

  lines.push(`Initiative: ${initiative.id} \u2014 ${initiative.title}`);
  lines.push('');

  if (plan.skipped.length > 0) {
    lines.push(`Skipped (already done): ${plan.skipped.join(', ')}`);
    lines.push('');
  }

  // WU-2430: Show WUs skipped due to non-ready status
  if (plan.skippedWithReasons && plan.skippedWithReasons.length > 0) {
    lines.push('Skipped (not ready):');
    for (const entry of plan.skippedWithReasons) {
      lines.push(`  - ${entry.id}: ${entry.reason}`);
    }
    lines.push('');
  }

  // WU-2430: Show WUs deferred due to unmet dependencies
  if (plan.deferred && plan.deferred.length > 0) {
    lines.push('Deferred (waiting for dependencies):');
    for (const entry of plan.deferred) {
      lines.push(`  - ${entry.id}: ${entry.reason}`);
      if (entry.blockedBy && entry.blockedBy.length > 0) {
        lines.push(`      blocked by: ${entry.blockedBy.join(', ')}`);
      }
    }
    lines.push('');
  }

  if (plan.waves.length === 0) {
    // WU-1906: Distinguish all-done from all-blocked
    const hasPending =
      plan.deferred.length > 0 || (plan.skippedWithReasons && plan.skippedWithReasons.length > 0);
    if (hasPending) {
      const pendingCount =
        plan.deferred.length + (plan.skippedWithReasons ? plan.skippedWithReasons.length : 0);
      lines.push(`${pendingCount} WU(s) still pending but none are unblocked.`);
    } else {
      lines.push('All WUs are complete.');
    }
    return lines.join(STRING_LITERALS.NEWLINE);
  }

  lines.push(`Execution Plan: ${plan.waves.length} wave(s)`);
  lines.push('');

  // Identify bottleneck WUs (WU-1596)
  const allWUs = plan.waves.flat();
  const bottleneckWUs = getBottleneckWUs(allWUs);

  if (bottleneckWUs.length > 0) {
    lines.push('Bottleneck WUs (prioritise these for fastest unblocking):');
    for (const bottleneck of bottleneckWUs) {
      lines.push(
        `  - ${bottleneck.id}: ${bottleneck.title} [blocks ${bottleneck.blocksCount} WU${bottleneck.blocksCount !== 1 ? 's' : ''}]`,
      );
    }
    lines.push('');
  }

  for (let i = 0; i < plan.waves.length; i++) {
    const wave = plan.waves[i]!;
    lines.push(`Wave ${i} (${wave.length} WU${wave.length !== 1 ? 's' : ''} in parallel):`);

    for (const wu of wave) {
      // WU-1251: Use getAllDependencies to combine blocked_by and dependencies arrays
      const blockers = getAllDependencies(wu.doc);
      const blockerStr = blockers.length > 0 ? ` [blocked by: ${blockers.join(', ')}]` : '';
      // Mark bottleneck WUs (WU-1596)
      const isBottleneck = bottleneckWUs.some((b) => b.id === wu.id);
      const bottleneckMarker = isBottleneck ? ' *BOTTLENECK*' : '';
      lines.push(`  - ${wu.id}: ${wu.doc.title}${blockerStr}${bottleneckMarker}`);
    }

    lines.push('');
  }

  // Add coordination guidance for multi-wave plans (WU-1592)
  if (plan.waves.length > 1) {
    lines.push('Coordination Guidance:');
    lines.push('  - Poll mem:inbox between waves: pnpm mem:inbox --since 10m');
    lines.push('  - Check for bug discoveries from sub-agents');
    lines.push('  - Review signals before proceeding to next wave');
    lines.push('');
  }

  return lines.join(STRING_LITERALS.NEWLINE);
}

/**
 * Generate spawn commands for a wave of WUs.
 *
 * WU-2375: Now accepts optional clientName parameter.
 *
 * @param {Array<{id: string, doc: object}>} wave - WUs in the wave
 * @param {string} [clientName] - Client name (defaults to generic --client <client> placeholder)
 * @returns {string[]} Array of spawn command strings
 */
export function generateSpawnCommands(wave: WUEntry[], clientName?: string): string[] {
  const clientArg = clientName || '<client>';
  return wave.map(
    (wu) => `pnpm wu:delegate --id ${wu.id} --parent-wu <PARENT-WU-ID> --client ${clientArg}`,
  );
}

/**
 * Calculate progress statistics for WUs.
 *
 * @param {Array<{id: string, doc: object}>} wus - WUs to calculate progress for
 * @returns {{total: number, done: number, active: number, pending: number, blocked: number, percentage: number}}
 */
export function calculateProgress(wus: WUEntry[]): ProgressStats {
  const stats = {
    total: wus.length,
    done: 0,
    active: 0,
    pending: 0,
    blocked: 0,
    percentage: 0,
  };

  for (const { doc } of wus) {
    switch (doc.status) {
      case WU_STATUS.DONE:
        stats.done++;
        break;
      case WU_STATUS.IN_PROGRESS:
        stats.active++;
        break;
      case WU_STATUS.BLOCKED:
        stats.blocked++;
        break;
      case WU_STATUS.READY:
        stats.pending++;
        break;
      default:
        // Skip other statuses (e.g., cancelled) - counted in total only
        break;
    }
  }

  stats.percentage = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  return stats;
}

/**
 * Format progress for display.
 *
 * @param {{total: number, done: number, active: number, pending: number, blocked: number, percentage: number}} progress
 * @returns {string} Formatted progress string
 */
export function formatProgress(progress: ProgressStats): string {
  const bar = createProgressBar(progress.percentage);
  return [
    `Progress: ${bar} ${progress.percentage}%`,
    `  Done: ${progress.done}/${progress.total}`,
    `  Active: ${progress.active}`,
    `  Pending: ${progress.pending}`,
    `  Blocked: ${progress.blocked}`,
  ].join(STRING_LITERALS.NEWLINE);
}

/**
 * Create a visual progress bar.
 *
 * @param {number} percentage - Completion percentage (0-100)
 * @param {number} [width=20] - Bar width in characters
 * @returns {string} Visual progress bar
 */
function createProgressBar(percentage: number, width = 20): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

/**
 * Get bottleneck WUs from a set of WUs based on how many downstream WUs they block.
 * A bottleneck is a WU that blocks multiple other WUs.
 *
 * @param {Array<{id: string, doc: object}>} wus - WUs to analyse
 * @param {number} [limit=5] - Maximum number of bottlenecks to return
 * @returns {Array<{id: string, title: string, blocksCount: number}>} Bottleneck WUs sorted by impact
 */
export function getBottleneckWUs(wus: WUEntry[], limit = 5): BottleneckWU[] {
  // Build a map of WU ID -> count of WUs that depend on it
  const blocksCounts = new Map();

  // Initialise all WUs with 0
  for (const wu of wus) {
    blocksCounts.set(wu.id, 0);
  }

  // Count how many WUs each WU blocks
  for (const wu of wus) {
    // WU-1251: Use getAllDependencies to combine blocked_by and dependencies arrays
    const blockers = getAllDependencies(wu.doc);
    for (const blockerId of blockers) {
      if (blocksCounts.has(blockerId)) {
        blocksCounts.set(blockerId, blocksCounts.get(blockerId) + 1);
      }
    }
  }

  // Convert to array and filter out WUs that don't block anything
  const bottlenecks: BottleneckWU[] = [];
  for (const wu of wus) {
    const blocksCount = blocksCounts.get(wu.id);
    if (blocksCount !== undefined && blocksCount > 0) {
      bottlenecks.push({
        id: wu.id,
        title: wu.doc.title ?? wu.id,
        blocksCount,
      });
    }
  }

  // Sort by blocks count descending
  bottlenecks.sort((a, b) => b.blocksCount - a.blocksCount);

  return bottlenecks.slice(0, limit);
}

/**
 * Format checkpoint wave output.
 *
 * WU-1821: Token discipline - keep output minimal for context management.
 * WU-2040: Output full Task invocation blocks instead of pnpm wu:spawn meta-prompts.
 * WU-2280: Prevent false wave spawned confusion - use markdown code blocks and ACTION REQUIRED banner.
 * WU-2375: Client-capability-aware: XML for Claude, markdown for Codex/Gemini/generic.
 * WU-2430: Handle dry-run mode - indicate preview mode clearly.
 *
 * @param {CheckpointWaveResult} waveData
 * @returns {string} Formatted output with embedded spawn content
 */
export function formatCheckpointOutput(waveData: CheckpointWaveResult): string {
  const lines = [];
  const isDryRun = waveData.dryRun === true;
  const clientName = waveData.clientName;

  // WU-2040: Handle blocked case with waiting message
  if (waveData.blockedBy && waveData.blockedBy.length > 0) {
    lines.push(`Waiting for dependencies to complete:`);
    for (const depId of waveData.blockedBy) {
      lines.push(`  - ${depId}`);
    }
    lines.push('');
    lines.push(waveData.waitingMessage || 'No WUs can spawn until dependencies have stamps.');
    lines.push('');
    lines.push('Check dependency progress with:');
    lines.push(`  pnpm mem:inbox --since 10m`);
    lines.push(`  pnpm orchestrate:initiative -i ${waveData.initiative} -c`);
    return lines.join(STRING_LITERALS.NEWLINE);
  }

  // WU-2430: Dry-run header
  if (isDryRun) {
    lines.push('[DRY-RUN PREVIEW] Checkpoint mode output (no manifest written)');
    lines.push('');
  }

  lines.push(`Wave ${waveData.wave} manifest: ${waveData.manifestPath}`);
  lines.push(`WUs in this wave: ${waveData.wus.length}`);

  for (const wu of waveData.wus) {
    lines.push(`  - ${wu.id} (${wu.lane})`);
  }

  lines.push('');

  // WU-2375: Branch by client capability
  if (isXmlCapableClient(clientName)) {
    formatCheckpointXml(waveData, lines);
  } else {
    formatCheckpointMarkdown(waveData, lines, clientName);
  }

  lines.push('');
  lines.push('Resume with:');
  lines.push(`  pnpm mem:ready --wu WU-ORCHESTRATOR`);
  lines.push(`  pnpm orchestrate:initiative -i ${waveData.initiative} -c`);

  return lines.join(STRING_LITERALS.NEWLINE);
}

/**
 * WU-2375: Format checkpoint output as XML Task invocations (Claude).
 */
function formatCheckpointXml(waveData: CheckpointWaveResult, lines: string[]): void {
  // WU-2280: ACTION REQUIRED banner
  lines.push(BANNER_SEPARATOR);
  lines.push('ACTION REQUIRED: Agents have NOT been spawned yet.');
  lines.push('');
  lines.push('To spawn agents, copy the XML below and invoke the Task tool.');
  lines.push('The output below is documentation only - it will NOT execute automatically.');
  lines.push(BANNER_SEPARATOR);
  lines.push('');

  lines.push('```xml');

  const xmlLines = [];
  xmlLines.push(XML_PATTERNS.FUNCTION_CALLS_OPEN);

  for (const wu of waveData.wus) {
    try {
      const fullInvocation = generateEmbeddedSpawnPrompt(wu.id, waveData.clientName);
      const startIdx = fullInvocation.indexOf(XML_PATTERNS.INVOKE_OPEN);
      const endIdx = fullInvocation.indexOf(XML_PATTERNS.INVOKE_CLOSE);

      if (startIdx !== -1 && endIdx !== -1) {
        const invokeBlock = fullInvocation.substring(
          startIdx,
          endIdx + XML_PATTERNS.INVOKE_CLOSE.length,
        );
        xmlLines.push(invokeBlock);
      }
    } catch {
      xmlLines.push(`<!-- Could not generate Task invocation for ${wu.id} -->`);
    }
  }

  xmlLines.push(XML_PATTERNS.FUNCTION_CALLS_CLOSE);
  lines.push(xmlLines.join(STRING_LITERALS.NEWLINE));
  lines.push('```');
}

/**
 * WU-2375: Format checkpoint output as markdown prompts (Codex/Gemini/generic).
 */
function formatCheckpointMarkdown(
  waveData: CheckpointWaveResult,
  lines: string[],
  clientName?: string,
): void {
  lines.push(BANNER_SEPARATOR);
  lines.push('ACTION REQUIRED: Agents have NOT been spawned yet.');
  lines.push('');
  lines.push('Copy the prompt(s) below to your agent platform.');
  lines.push('The output below is documentation only - it will NOT execute automatically.');
  lines.push(BANNER_SEPARATOR);
  lines.push('');

  for (const wu of waveData.wus) {
    try {
      const prompt = generateEmbeddedMarkdownPrompt(wu.id, clientName);
      lines.push(`### ${wu.id}`);
      lines.push('');
      lines.push('```markdown');
      lines.push(prompt);
      lines.push('```');
      lines.push('');
    } catch {
      lines.push(`<!-- Could not generate prompt for ${wu.id} -->`);
    }
  }
}

/**
 * WU-2027: Generate embedded spawn prompt for a WU.
 * WU-2375: Now accepts clientName to select output format.
 *
 * @param {string} wuId - WU ID (e.g., 'WU-001')
 * @param {string} [clientName] - Client name for strategy selection
 * @returns {string} Spawn prompt content (XML for Claude, markdown for others)
 * @throws {Error} If WU file not found or cannot be parsed
 */
export function generateEmbeddedSpawnPrompt(wuId: string, clientName?: string): string {
  const wuPath = WU_PATHS.WU(wuId);

  if (!existsSync(wuPath)) {
    throw createError(ErrorCodes.WU_NOT_FOUND, `WU file not found: ${wuPath}`, {
      wuId,
      path: wuPath,
    });
  }

  const text = readFileSync(wuPath, 'utf8');
  const doc = parseYAML(text);
  const resolvedClient = clientName || 'generic';
  const strategy = SpawnStrategyFactory.create(resolvedClient);

  if (isXmlCapableClient(resolvedClient)) {
    return generateTaskInvocation(doc, wuId, strategy);
  }
  return generateCodexPrompt(doc, wuId, strategy);
}

/**
 * WU-2375: Generate embedded markdown prompt for a WU (non-Claude clients).
 *
 * @param {string} wuId - WU ID
 * @param {string} [clientName] - Client name for strategy selection
 * @returns {string} Markdown prompt content
 * @throws {Error} If WU file not found or cannot be parsed
 */
function generateEmbeddedMarkdownPrompt(wuId: string, clientName?: string): string {
  const wuPath = WU_PATHS.WU(wuId);

  if (!existsSync(wuPath)) {
    throw createError(ErrorCodes.WU_NOT_FOUND, `WU file not found: ${wuPath}`, {
      wuId,
      path: wuPath,
    });
  }

  const text = readFileSync(wuPath, 'utf8');
  const doc = parseYAML(text);
  const resolvedClient = clientName || 'generic';
  const strategy = SpawnStrategyFactory.create(resolvedClient);
  return generateCodexPrompt(doc, wuId, strategy);
}

/**
 * WU-2027: Format a spawn prompt with embedded content for a WU.
 * WU-2375: Now accepts clientName to select output format.
 *
 * @param {{id: string, doc: object}} wu - WU with id and YAML doc
 * @param {string} [clientName] - Client name for format selection
 * @returns {string} Complete spawn content (XML Task invocation or markdown prompt)
 */
export function formatTaskInvocationWithEmbeddedSpawn(wu: WUEntry, clientName?: string): string {
  const resolvedClient = clientName || 'generic';
  const strategy = SpawnStrategyFactory.create(resolvedClient);

  if (isXmlCapableClient(resolvedClient)) {
    return generateTaskInvocation(wu.doc, wu.id, strategy);
  }
  return generateCodexPrompt(wu.doc, wu.id, strategy);
}

/**
 * WU-2027: Format execution plan with embedded spawns (no meta-prompts).
 * WU-2280: Updated to use markdown code blocks and ACTION REQUIRED banner.
 * WU-2375: Client-capability-aware: XML for Claude, markdown for Codex/Gemini/generic.
 *
 * @param {ExecutionPlan} plan - Execution plan
 * @param {string} [clientName] - Client name for output format selection
 * @returns {string} Formatted output with embedded spawn content
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- display formatting inherently complex
export function formatExecutionPlanWithEmbeddedSpawns(
  plan: ExecutionPlan,
  clientName?: string,
): string {
  const lines: string[] = [];

  if (plan.waves.length === 0) {
    // WU-1906: Distinguish all-done from all-blocked
    const hasPending =
      plan.deferred.length > 0 || (plan.skippedWithReasons && plan.skippedWithReasons.length > 0);
    if (hasPending) {
      const pendingCount =
        plan.deferred.length + (plan.skippedWithReasons ? plan.skippedWithReasons.length : 0);
      return `${pendingCount} WU(s) still pending but none are unblocked.`;
    }
    return 'All WUs are complete.';
  }

  // WU-2375: Branch by client capability
  if (isXmlCapableClient(clientName)) {
    formatPlanWavesXml(plan, lines, clientName);
  } else {
    formatPlanWavesMarkdown(plan, lines, clientName);
  }

  return lines.join(STRING_LITERALS.NEWLINE);
}

/**
 * WU-2375: Format execution plan waves as XML Task invocations (Claude).
 */
function formatPlanWavesXml(plan: ExecutionPlan, lines: string[], clientName?: string): void {
  for (let waveIndex = 0; waveIndex < plan.waves.length; waveIndex++) {
    const wave = plan.waves[waveIndex]!;
    lines.push(
      `## Wave ${waveIndex} (${wave.length} WU${wave.length !== 1 ? 's' : ''} in parallel)`,
    );
    lines.push('');

    lines.push(BANNER_SEPARATOR);
    lines.push('ACTION REQUIRED: Agents have NOT been spawned yet.');
    lines.push('');
    lines.push('To spawn agents, copy the XML below and invoke the Task tool.');
    lines.push('The output below is documentation only - it will NOT execute automatically.');
    lines.push(BANNER_SEPARATOR);
    lines.push('');

    lines.push('```xml');

    const xmlLines = [];
    const openTag = '<' + 'antml:function_calls>';
    const closeTag = '</' + 'antml:function_calls>';

    xmlLines.push(openTag);

    for (const wu of wave) {
      const resolvedClient = clientName || 'claude-code';
      const strategy = SpawnStrategyFactory.create(resolvedClient);
      const fullInvocation = generateTaskInvocation(wu.doc, wu.id, strategy);

      const startPattern = '<' + 'antml:invoke';
      const endPattern = '</' + 'antml:invoke>';
      const startIdx = fullInvocation.indexOf(startPattern);
      const endIdx = fullInvocation.indexOf(endPattern);

      if (startIdx !== -1 && endIdx !== -1) {
        let invokeBlock = fullInvocation.substring(startIdx, endIdx + endPattern.length);

        if (!invokeBlock.includes('run_in_background')) {
          const paramOpen = '<' + 'antml:parameter name="';
          const paramClose = '</' + 'antml:parameter>';
          const invokeTag = '<' + 'antml:invoke name="Task">';
          invokeBlock = invokeBlock.replace(
            invokeTag,
            `${invokeTag}\n${paramOpen}run_in_background">true${paramClose}`,
          );
        }
        xmlLines.push(invokeBlock);
      }
    }

    xmlLines.push(closeTag);
    lines.push(xmlLines.join(STRING_LITERALS.NEWLINE));
    lines.push('```');
    lines.push('');

    if (waveIndex < plan.waves.length - 1) {
      lines.push(`After all Wave ${waveIndex} agents complete, proceed to Wave ${waveIndex + 1}.`);
      lines.push('Before next wave: pnpm mem:inbox --since 10m (check for bug discoveries)');
      lines.push('');
    }
  }
}

/**
 * WU-2375: Format execution plan waves as markdown prompts (Codex/Gemini/generic).
 */
function formatPlanWavesMarkdown(plan: ExecutionPlan, lines: string[], clientName?: string): void {
  for (let waveIndex = 0; waveIndex < plan.waves.length; waveIndex++) {
    const wave = plan.waves[waveIndex]!;
    lines.push(
      `## Wave ${waveIndex} (${wave.length} WU${wave.length !== 1 ? 's' : ''} in parallel)`,
    );
    lines.push('');

    lines.push(BANNER_SEPARATOR);
    lines.push('ACTION REQUIRED: Agents have NOT been spawned yet.');
    lines.push('');
    lines.push('Copy the prompt(s) below to your agent platform.');
    lines.push('The output below is documentation only - it will NOT execute automatically.');
    lines.push(BANNER_SEPARATOR);
    lines.push('');

    for (const wu of wave) {
      const resolvedClient = clientName || 'generic';
      const strategy = SpawnStrategyFactory.create(resolvedClient);
      const prompt = generateCodexPrompt(wu.doc, wu.id, strategy);

      lines.push(`### ${wu.id}: ${wu.doc.title || 'Untitled'}`);
      lines.push('');
      lines.push('```markdown');
      lines.push(prompt);
      lines.push('```');
      lines.push('');
    }

    if (waveIndex < plan.waves.length - 1) {
      lines.push(`After all Wave ${waveIndex} agents complete, proceed to Wave ${waveIndex + 1}.`);
      lines.push('Before next wave: pnpm mem:inbox --since 10m (check for bug discoveries)');
      lines.push('');
    }
  }
}
