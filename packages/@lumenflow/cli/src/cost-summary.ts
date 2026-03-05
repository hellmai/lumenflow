#!/usr/bin/env node
// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, readFileSync } from 'node:fs';
import { Command } from 'commander';
import type { CostEvent, CostSummary, CostSummaryRow } from '@lumenflow/metrics';
import { runCLI } from './cli-entry-point.js';

const DEFAULT_COSTS_PATH = '.lumenflow/telemetry/costs.ndjson';
const DEFAULT_GROUP_KEY = 'unknown';
const LOG_PREFIX = '[cost:summary]';
const SOURCE_TYPE_COST = 'cost';

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function parseCostEventLine(line: string): CostEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const sourceTypeRaw = asNonEmptyString(record.source_type);
  const timestamp = asNonEmptyString(record.timestamp);
  const operation = asNonEmptyString(record.operation);
  const model = asNonEmptyString(record.model);
  const inputTokens = asFiniteNumber(record.input_tokens);
  const outputTokens = asFiniteNumber(record.output_tokens);
  const costUsd = asFiniteNumber(record.cost_usd);

  if (!timestamp || !operation || !model) {
    return null;
  }
  if (inputTokens === undefined || outputTokens === undefined || costUsd === undefined) {
    return null;
  }
  if (sourceTypeRaw !== undefined && sourceTypeRaw !== SOURCE_TYPE_COST) {
    return null;
  }

  return {
    timestamp,
    sourceType: SOURCE_TYPE_COST,
    operation,
    model,
    inputTokens,
    outputTokens,
    costUsd,
    wuId: asNonEmptyString(record.wu_id),
    agentId: asNonEmptyString(record.agent_id),
    sessionId: asNonEmptyString(record.session_id),
  };
}

export function readCostEvents(costsPath = DEFAULT_COSTS_PATH): CostEvent[] {
  if (!existsSync(costsPath)) {
    return [];
  }

  const content = readFileSync(costsPath, 'utf-8');
  return content
    .split('\n')
    .map((line) => parseCostEventLine(line))
    .filter((event): event is CostEvent => event !== null);
}

function sortRowsDescending(rows: CostSummaryRow[]): CostSummaryRow[] {
  return [...rows].sort((a, b) => b.costUsd - a.costUsd || b.eventCount - a.eventCount);
}

function buildGroupedRows(
  events: CostEvent[],
  keySelector: (event: CostEvent) => string | undefined,
): CostSummaryRow[] {
  const byKey = new Map<string, CostSummaryRow>();
  for (const event of events) {
    const key = keySelector(event) ?? DEFAULT_GROUP_KEY;
    const current = byKey.get(key) ?? {
      key,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      eventCount: 0,
    };
    current.costUsd += event.costUsd;
    current.inputTokens += event.inputTokens;
    current.outputTokens += event.outputTokens;
    current.eventCount += 1;
    byKey.set(key, current);
  }
  return sortRowsDescending(Array.from(byKey.values()));
}

export function summarizeCostEvents(events: CostEvent[]): CostSummary {
  const summary: CostSummary = {
    totalCostUsd: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    eventCount: 0,
    byModel: buildGroupedRows(events, (event) => event.model),
    byAgent: buildGroupedRows(events, (event) => event.agentId),
    byWu: buildGroupedRows(events, (event) => event.wuId),
  };

  for (const event of events) {
    summary.totalCostUsd += event.costUsd;
    summary.totalInputTokens += event.inputTokens;
    summary.totalOutputTokens += event.outputTokens;
    summary.eventCount += 1;
  }

  return summary;
}

function formatRows(title: string, rows: CostSummaryRow[]): string[] {
  const lines: string[] = [];
  lines.push(title);
  if (rows.length === 0) {
    lines.push('  (none)');
    return lines;
  }
  for (const row of rows) {
    lines.push(
      `  - ${row.key}: $${row.costUsd.toFixed(6)} (${row.eventCount} events, in=${row.inputTokens}, out=${row.outputTokens})`,
    );
  }
  return lines;
}

export function formatCostSummary(summary: CostSummary): string {
  const lines: string[] = [];
  lines.push('Cost Summary');
  lines.push(`  Events: ${summary.eventCount}`);
  lines.push(`  Total Cost (USD): $${summary.totalCostUsd.toFixed(6)}`);
  lines.push(`  Total Input Tokens: ${summary.totalInputTokens}`);
  lines.push(`  Total Output Tokens: ${summary.totalOutputTokens}`);
  lines.push('');
  lines.push(...formatRows('By Model:', summary.byModel));
  lines.push('');
  lines.push(...formatRows('By Agent:', summary.byAgent));
  lines.push('');
  lines.push(...formatRows('By WU:', summary.byWu));
  return lines.join('\n');
}

function parseArgs(): {
  json: boolean;
  path: string;
} {
  const program = new Command()
    .name('cost-summary')
    .description('Summarize local cost telemetry from .lumenflow/telemetry/costs.ndjson')
    .option('--json', 'Output JSON instead of human-readable text', false)
    .option('--path <path>', `Path to costs NDJSON file (default: ${DEFAULT_COSTS_PATH})`)
    .exitOverride();

  try {
    program.parse(process.argv);
  } catch (err: unknown) {
    const error = err as { code?: string };
    if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
      process.exit(0);
    }
    throw err;
  }

  const options = program.opts<{ json?: boolean; path?: string }>();
  return {
    json: options.json ?? false,
    path: options.path ?? DEFAULT_COSTS_PATH,
  };
}

export async function main(): Promise<void> {
  const options = parseArgs();
  const events = readCostEvents(options.path);
  const summary = summarizeCostEvents(events);

  if (events.length === 0) {
    console.log(`${LOG_PREFIX} No cost telemetry found at ${options.path}`);
  }

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(formatCostSummary(summary));
}

if (import.meta.main) {
  void runCLI(main);
}
