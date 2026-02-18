'use client';

/**
 * Top-level tool output renderer.
 * Auto-detects the tool category from the tool_name prefix and data shape,
 * then dispatches to the appropriate specialized renderer.
 * Falls back to JSON tree viewer for unknown or unmatched outputs.
 */

import type { ToolOutput } from '../../lib/tool-output-types';
import { detectToolCategory, TOOL_CATEGORIES } from '../../lib/tool-output-types';
import { JsonTreeViewer } from './json-tree-viewer';
import { GitDiffViewer } from './git-diff-viewer';
import { GateBadgeGrid } from './gate-badge-grid';

const CATEGORY_BADGE_COLORS = new Map<string, string>([
  ['git', 'bg-orange-100 text-orange-700'],
  ['gates', 'bg-indigo-100 text-indigo-700'],
  ['file', 'bg-cyan-100 text-cyan-700'],
  ['unknown', 'bg-slate-100 text-slate-500'],
]);

const DEFAULT_BADGE_COLOR = 'bg-slate-100 text-slate-500';

/**
 * Type guard: checks if data has the shape expected by GitDiffViewer.
 * Requires { filePath: string, lines: Array<{ type: string, content: string }> }
 */
function isGitDiffData(data: unknown): data is {
  filePath: string;
  lines: Array<{ type: string; content: string; lineNumber?: number }>;
} {
  if (data === null || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.filePath !== 'string') return false;
  if (!Array.isArray(obj.lines)) return false;
  if (obj.lines.length === 0) return true;
  const firstLine = obj.lines[0] as Record<string, unknown>;
  return typeof firstLine.type === 'string' && typeof firstLine.content === 'string';
}

/**
 * Type guard: checks if data has the shape expected by GateBadgeGrid.
 * Requires { gates: Array<{ name: string, status: string }> }
 */
function isGatesData(data: unknown): data is {
  gates: Array<{ name: string; status: string; message?: string; durationMs?: number }>;
  summary?: string;
} {
  if (data === null || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.gates)) return false;
  if (obj.gates.length === 0) return true;
  const firstGate = obj.gates[0] as Record<string, unknown>;
  return typeof firstGate.name === 'string' && typeof firstGate.status === 'string';
}

interface ToolOutputRendererProps {
  readonly output: ToolOutput;
}

export function ToolOutputRenderer({ output }: ToolOutputRendererProps) {
  const category = detectToolCategory(output.toolName);

  return (
    <div className="space-y-2">
      {/* Header */}
      <div data-testid="tool-output-header" className="flex items-center gap-2">
        <span className="font-mono text-sm font-semibold text-slate-800">{output.toolName}</span>
        <span
          data-testid="tool-category-badge"
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_BADGE_COLORS.get(category) ?? DEFAULT_BADGE_COLOR}`}
        >
          {category}
        </span>
      </div>

      {/* Renderer dispatch */}
      {renderOutput(category, output.data)}
    </div>
  );
}

function renderOutput(category: string, data: unknown): React.JSX.Element {
  // Try category-specific renderers with data shape validation
  if (category === TOOL_CATEGORIES.GIT && isGitDiffData(data)) {
    return <GitDiffViewer filePath={data.filePath} lines={data.lines} />;
  }

  if (category === TOOL_CATEGORIES.GATES && isGatesData(data)) {
    return <GateBadgeGrid gates={data.gates} summary={data.summary} />;
  }

  // Default: JSON tree viewer for unknown or unmatched data shapes
  return <JsonTreeViewer data={data} />;
}
