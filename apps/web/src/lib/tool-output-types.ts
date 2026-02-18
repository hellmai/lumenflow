/**
 * Types for the GenUI tool output renderer system.
 *
 * Tool outputs from the kernel are rendered as rich UI components.
 * The renderer is selected based on tool_name prefix matching.
 */

/** The shape of a tool output as received from the kernel. */
export interface ToolOutput {
  /** The tool name (e.g., "git.diff", "gates.run", "fs.read"). */
  readonly toolName: string;
  /** The raw output data from the tool execution. */
  readonly data: unknown;
}

/** Known tool output categories for renderer selection. */
export const TOOL_CATEGORIES = {
  GIT: 'git',
  GATES: 'gates',
  FILE: 'file',
  UNKNOWN: 'unknown',
} as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[keyof typeof TOOL_CATEGORIES];

/** Prefix-to-category mapping for tool name detection. */
export const TOOL_PREFIX_MAP = new Map<string, ToolCategory>([
  ['git.', TOOL_CATEGORIES.GIT],
  ['gates.', TOOL_CATEGORIES.GATES],
  ['fs.', TOOL_CATEGORIES.FILE],
  ['file.', TOOL_CATEGORIES.FILE],
]);

/**
 * Detect the tool category from a tool name by prefix matching.
 * Returns 'unknown' if no prefix matches.
 */
export function detectToolCategory(toolName: string): ToolCategory {
  for (const [prefix, category] of TOOL_PREFIX_MAP) {
    if (toolName.startsWith(prefix)) {
      return category;
    }
  }
  return TOOL_CATEGORIES.UNKNOWN;
}

/** A single line in a git diff. */
export interface DiffLine {
  readonly type: 'added' | 'removed' | 'context' | 'header';
  readonly content: string;
  readonly lineNumber?: number;
}

/** Parsed git diff output. */
export interface GitDiffData {
  readonly filePath: string;
  readonly lines: readonly DiffLine[];
}

/** A single gate result. */
export interface GateResult {
  readonly name: string;
  readonly status: 'pass' | 'fail' | 'skip' | 'warn';
  readonly message?: string;
  readonly durationMs?: number;
}

/** Gate tool output data shape. */
export interface GatesOutputData {
  readonly gates: readonly GateResult[];
  readonly summary?: string;
}

/** Props shared by all tool output renderers. */
export interface ToolOutputRendererProps {
  readonly output: ToolOutput;
}
