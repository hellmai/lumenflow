/**
 * @file flow-tools.ts
 * @description Flow/Metrics tool implementations
 *
 * WU-1642: Extracted from tools.ts during domain decomposition.
 * WU-1426: Flow/Metrics tools: flow_bottlenecks, flow_report, metrics_snapshot
 * WU-1457: All flow/metrics commands use shared schemas
 */

import {
  flowBottlenecksSchema,
  flowReportSchema,
  metricsSnapshotSchema,
  metricsSchema,
} from '@lumenflow/core';
import {
  type ToolDefinition,
  ErrorCodes,
  CliArgs,
  success,
  error,
  buildMetricsArgs,
  runCliCommand,
  type CliRunnerOptions,
} from '../tools-shared.js';

/**
 * flow_bottlenecks - Identify flow bottlenecks
 */
export const flowBottlenecksTool: ToolDefinition = {
  name: 'flow_bottlenecks',
  description: 'Identify flow bottlenecks in the workflow (WIP violations, stuck WUs, etc.)',
  inputSchema: flowBottlenecksSchema,

  async execute(input, options) {
    const args: string[] = [];
    // WU-1457: Use shared schema fields (limit, format match CLI flags)
    if (input.limit) args.push('--limit', String(input.limit));
    if (input.format) args.push('--format', input.format as string);
    // WU-1452: flow:bottlenecks uses --format json, not --json
    if (input.json) args.push(...CliArgs.FORMAT_JSON);

    const cliOptions: CliRunnerOptions = { projectRoot: options?.projectRoot };
    const result = await runCliCommand('flow:bottlenecks', args, cliOptions);

    if (result.success) {
      try {
        const data = JSON.parse(result.stdout);
        return success(data);
      } catch {
        return success({ message: result.stdout || 'Bottleneck analysis complete' });
      }
    } else {
      return error(
        result.stderr || result.error?.message || 'flow:bottlenecks failed',
        ErrorCodes.FLOW_BOTTLENECKS_ERROR,
      );
    }
  },
};

/**
 * flow_report - Generate flow metrics report
 */
export const flowReportTool: ToolDefinition = {
  name: 'flow_report',
  description: 'Generate flow metrics report with cycle time, throughput, and other DORA metrics',
  inputSchema: flowReportSchema,

  async execute(input, options) {
    const args: string[] = [];
    // WU-1457: Use shared schema field names (start/end match CLI flags)
    if (input.start) args.push('--start', input.start as string);
    if (input.end) args.push('--end', input.end as string);
    if (input.days) args.push('--days', String(input.days));
    // WU-1452: flow:report uses --format, not --json
    if (input.format) args.push('--format', input.format as string);
    if (input.json) args.push(...CliArgs.FORMAT_JSON);

    const cliOptions: CliRunnerOptions = { projectRoot: options?.projectRoot };
    const result = await runCliCommand('flow:report', args, cliOptions);

    if (result.success) {
      try {
        const data = JSON.parse(result.stdout);
        return success(data);
      } catch {
        return success({ message: result.stdout || 'Flow report generated' });
      }
    } else {
      return error(
        result.stderr || result.error?.message || 'flow:report failed',
        ErrorCodes.FLOW_REPORT_ERROR,
      );
    }
  },
};

/**
 * metrics_snapshot - Capture metrics snapshot
 */
export const metricsSnapshotTool: ToolDefinition = {
  name: 'metrics_snapshot',
  description: 'Capture a snapshot of current LumenFlow metrics',
  inputSchema: metricsSnapshotSchema,

  async execute(_input, options) {
    // WU-1452: metrics:snapshot always outputs JSON (writes to file); no --json flag exists
    const args: string[] = [];

    const cliOptions: CliRunnerOptions = { projectRoot: options?.projectRoot };
    const result = await runCliCommand('metrics:snapshot', args, cliOptions);

    if (result.success) {
      try {
        const data = JSON.parse(result.stdout);
        return success(data);
      } catch {
        return success({ message: result.stdout || 'Metrics snapshot captured' });
      }
    } else {
      return error(
        result.stderr || result.error?.message || 'metrics:snapshot failed',
        ErrorCodes.METRICS_SNAPSHOT_ERROR,
      );
    }
  },
};

/**
 * lumenflow_metrics - Public metrics alias
 */
export const lumenflowMetricsTool: ToolDefinition = {
  name: 'lumenflow_metrics',
  description: 'View workflow metrics (lumenflow:metrics alias)',
  inputSchema: metricsSchema,

  async execute(input, options) {
    const args = buildMetricsArgs(input);
    const cliOptions: CliRunnerOptions = { projectRoot: options?.projectRoot };
    const result = await runCliCommand('metrics', args, cliOptions);

    if (result.success) {
      return success({ message: result.stdout || 'Metrics generated' });
    }
    return error(
      result.stderr || result.error?.message || 'lumenflow:metrics failed',
      ErrorCodes.LUMENFLOW_METRICS_ERROR,
    );
  },
};

/**
 * metrics - Unified workflow metrics command
 */
export const metricsTool: ToolDefinition = {
  name: 'metrics',
  description: 'View workflow metrics (lanes, dora, flow, all)',
  inputSchema: metricsSchema,

  async execute(input, options) {
    const args = buildMetricsArgs(input);
    const cliOptions: CliRunnerOptions = { projectRoot: options?.projectRoot };
    const result = await runCliCommand('metrics', args, cliOptions);

    if (result.success) {
      return success({ message: result.stdout || 'Metrics generated' });
    }
    return error(
      result.stderr || result.error?.message || 'metrics failed',
      ErrorCodes.METRICS_ERROR,
    );
  },
};
