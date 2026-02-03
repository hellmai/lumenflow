/**
 * @file commands.ts
 * LumenFlow CLI commands discovery feature (WU-1378)
 *
 * Provides a way to discover all available CLI commands grouped by category.
 * This helps agents and users find CLI workflows without reading docs.
 */

import { createWUParser } from '@lumenflow/core';
import { runCLI } from './cli-entry-point.js';

/**
 * Individual command entry
 */
export interface CommandEntry {
  /** Command name as used with pnpm (e.g., 'wu:create') */
  name: string;
  /** Brief description of what the command does */
  description: string;
}

/**
 * Category grouping related commands
 */
export interface CommandCategory {
  /** Category name (e.g., 'WU Lifecycle') */
  name: string;
  /** Commands in this category */
  commands: CommandEntry[];
}

/**
 * Command categories organized by function
 * Based on quick-ref-commands.md structure
 */
const COMMAND_CATEGORIES: CommandCategory[] = [
  {
    name: 'WU Lifecycle',
    commands: [
      { name: 'wu:create', description: 'Create new WU spec' },
      { name: 'wu:claim', description: 'Claim WU and create worktree' },
      { name: 'wu:prep', description: 'Run gates in worktree, prep for wu:done' },
      { name: 'wu:done', description: 'Complete WU (merge, stamp, cleanup) from main' },
      { name: 'wu:edit', description: 'Edit WU spec fields' },
      { name: 'wu:block', description: 'Block WU with reason' },
      { name: 'wu:unblock', description: 'Unblock WU' },
      { name: 'wu:release', description: 'Release orphaned WU (in_progress to ready)' },
      { name: 'wu:status', description: 'Show WU status, location, valid commands' },
      { name: 'wu:spawn', description: 'Generate sub-agent spawn prompt' },
      { name: 'wu:validate', description: 'Validate WU spec' },
      { name: 'wu:recover', description: 'Analyze and fix WU state inconsistencies' },
    ],
  },
  {
    name: 'Gates & Quality',
    commands: [
      { name: 'gates', description: 'Run all quality gates' },
      { name: 'format', description: 'Format all files (Prettier)' },
      { name: 'lint', description: 'Run ESLint' },
      { name: 'typecheck', description: 'Run TypeScript type checking' },
      { name: 'test', description: 'Run all tests (Vitest)' },
      { name: 'lane:health', description: 'Check lane config health' },
    ],
  },
  {
    name: 'Memory & Sessions',
    commands: [
      { name: 'mem:init', description: 'Initialize memory for WU' },
      { name: 'mem:checkpoint', description: 'Save progress checkpoint' },
      { name: 'mem:signal', description: 'Broadcast coordination signal' },
      { name: 'mem:inbox', description: 'Check coordination signals' },
      { name: 'mem:create', description: 'Create memory node (bug discovery)' },
      { name: 'mem:context', description: 'Get context for current lane/WU' },
    ],
  },
  {
    name: 'Initiatives',
    commands: [
      { name: 'initiative:create', description: 'Create new initiative' },
      { name: 'initiative:edit', description: 'Edit initiative fields' },
      { name: 'initiative:list', description: 'List all initiatives' },
      { name: 'initiative:status', description: 'Show initiative status' },
      { name: 'initiative:add-wu', description: 'Add WU to initiative' },
    ],
  },
  {
    name: 'Orchestration',
    commands: [
      { name: 'orchestrate:initiative', description: 'Orchestrate initiative execution' },
      { name: 'orchestrate:init-status', description: 'Compact initiative progress view' },
      { name: 'orchestrate:monitor', description: 'Monitor spawn/agent activity' },
      { name: 'spawn:list', description: 'List active spawned agents' },
    ],
  },
  {
    name: 'Setup & Development',
    commands: [
      { name: 'setup', description: 'Install deps and build CLI (first time)' },
      { name: 'lumenflow', description: 'Initialize LumenFlow in a project' },
      { name: 'lumenflow:doctor', description: 'Diagnose LumenFlow configuration' },
      { name: 'lumenflow:upgrade', description: 'Upgrade LumenFlow packages' },
      { name: 'docs:sync', description: 'Sync agent docs (for upgrades)' },
    ],
  },
  {
    name: 'Metrics & Flow',
    commands: [
      { name: 'flow:report', description: 'Generate flow metrics report' },
      { name: 'flow:bottlenecks', description: 'Identify flow bottlenecks' },
      { name: 'metrics:snapshot', description: 'Capture metrics snapshot' },
    ],
  },
  {
    name: 'State Management',
    commands: [
      { name: 'state:doctor', description: 'Diagnose state store issues' },
      { name: 'state:cleanup', description: 'Clean up stale state data' },
      { name: 'state:bootstrap', description: 'Bootstrap state store' },
    ],
  },
];

/**
 * Get the complete commands registry
 * @returns Array of command categories with their commands
 */
export function getCommandsRegistry(): CommandCategory[] {
  return COMMAND_CATEGORIES;
}

/**
 * Format commands output for terminal display
 * @returns Formatted string with all commands grouped by category
 */
export function formatCommandsOutput(): string {
  const lines: string[] = [];

  lines.push('LumenFlow CLI Commands');
  lines.push('======================');
  lines.push('');

  for (const category of COMMAND_CATEGORIES) {
    lines.push(`## ${category.name}`);
    lines.push('');

    // Find the longest command name for alignment
    const maxNameLength = Math.max(...category.commands.map((cmd) => cmd.name.length));

    for (const cmd of category.commands) {
      const padding = ' '.repeat(maxNameLength - cmd.name.length + 2);
      lines.push(`  ${cmd.name}${padding}${cmd.description}`);
    }

    lines.push('');
  }

  lines.push('---');
  lines.push('Tip: Run `pnpm <command> --help` for detailed options.');
  lines.push('');

  return lines.join('\n');
}

/**
 * CLI option definitions for commands command
 */
const COMMANDS_OPTIONS = {
  json: {
    name: 'json',
    flags: '--json',
    description: 'Output commands as JSON',
  },
};

/**
 * Parse commands command options using createWUParser
 */
export function parseCommandsOptions(): {
  json: boolean;
} {
  const opts = createWUParser({
    name: 'lumenflow-commands',
    description: 'List all available LumenFlow CLI commands',
    options: Object.values(COMMANDS_OPTIONS),
  });

  return {
    json: opts.json ?? false,
  };
}

/**
 * Main function for the commands CLI
 */
export async function main(): Promise<void> {
  const opts = parseCommandsOptions();

  if (opts.json) {
    console.log(JSON.stringify(getCommandsRegistry(), null, 2));
  } else {
    console.log(formatCommandsOutput());
  }
}

// CLI entry point
// WU-1071: Use import.meta.main for proper CLI detection with pnpm symlinks
if (import.meta.main) {
  runCLI(main);
}
