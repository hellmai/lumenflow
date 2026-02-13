/**
 * @file context-tools.ts
 * @description Context/read operations via @lumenflow/core
 *
 * WU-1642: Extracted from tools.ts during domain decomposition.
 */

import { z } from 'zod';
import { wuStatusEnum } from '@lumenflow/core';
import {
  type ToolDefinition,
  ErrorCodes,
  getCore,
  success,
  error,
  runCliCommand,
  type CliRunnerOptions,
} from '../tools-shared.js';

/**
 * context_get - Get current WU context (location, git state, WU state)
 */
export const contextGetTool: ToolDefinition = {
  name: 'context_get',
  description: 'Get current LumenFlow context including location, git state, and active WU',
  inputSchema: z.object({}).optional(),

  async execute(_input, options) {
    try {
      const core = await getCore();
      const context = await core.computeWuContext({
        cwd: options?.projectRoot,
      });
      return success(context);
    } catch (err) {
      return error(err instanceof Error ? err.message : String(err), ErrorCodes.CONTEXT_ERROR);
    }
  },
};

/**
 * wu_list - List all WUs with optional status filter
 * Uses CLI shell-out for consistency with other tools
 *
 * WU-1431: Uses shared wuStatusEnum for status filter
 */
export const wuListTool: ToolDefinition = {
  name: 'wu_list',
  description: 'List all Work Units (WUs) with optional status filter',
  // WU-1431: Uses shared wuStatusEnum for status filter
  // (wu_list is MCP-specific, not a shared CLI command, so inline schema is OK)
  inputSchema: z.object({
    status: wuStatusEnum.optional(),
    lane: z.string().optional(),
  }),

  async execute(input, options) {
    // Use spec:linter which validates and lists all WUs
    const cliOptions: CliRunnerOptions = { projectRoot: options?.projectRoot };

    // Shell out to get all WU YAMLs via validate --all
    const result = await runCliCommand('wu:validate', ['--all', '--json'], cliOptions);

    if (result.success) {
      try {
        const data = JSON.parse(result.stdout);
        let wus = Array.isArray(data) ? data : data.wus || [];

        // Apply filters
        if (input.status) {
          wus = wus.filter((wu: Record<string, unknown>) => wu.status === input.status);
        }
        if (input.lane) {
          wus = wus.filter((wu: Record<string, unknown>) => wu.lane === input.lane);
        }

        return success(wus);
      } catch {
        // If JSON parse fails, return raw output
        return success({ message: result.stdout });
      }
    } else {
      return error(
        result.stderr || result.error?.message || 'wu_list failed',
        ErrorCodes.WU_LIST_ERROR,
      );
    }
  },
};
