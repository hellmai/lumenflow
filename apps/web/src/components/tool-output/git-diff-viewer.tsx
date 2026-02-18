'use client';

/**
 * Git diff viewer component for git tool outputs.
 * Renders unified diff lines with add/remove/context coloring.
 */

const DIFF_LINE_COLORS = new Map<string, string>([
  ['added', 'bg-green-50 text-green-800'],
  ['removed', 'bg-red-50 text-red-800'],
  ['context', 'bg-white text-slate-700'],
  ['header', 'bg-blue-50 text-blue-700 font-semibold'],
]);

const DIFF_LINE_PREFIXES = new Map<string, string>([
  ['added', '+'],
  ['removed', '-'],
  ['context', ' '],
  ['header', ''],
]);

const DEFAULT_DIFF_LINE_COLOR = 'bg-white text-slate-700';

interface DiffLineData {
  readonly type: string;
  readonly content: string;
  readonly lineNumber?: number;
}

interface GitDiffViewerProps {
  readonly filePath: string;
  readonly lines: readonly DiffLineData[];
}

export function GitDiffViewer({ filePath, lines }: GitDiffViewerProps) {
  return (
    <div
      data-testid="git-diff-viewer"
      className="rounded-lg border border-slate-200 overflow-hidden"
    >
      {/* File header */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-2">
        <span className="font-mono text-sm font-medium text-slate-700">{filePath}</span>
      </div>

      {/* Diff lines */}
      <div className="font-mono text-xs leading-relaxed">
        {lines.map((line, index) => (
          <div
            key={`${line.type}-${index}`}
            data-testid={`diff-line-${index}`}
            data-diff-type={line.type}
            className={`flex px-4 py-0.5 ${DIFF_LINE_COLORS.get(line.type) ?? DEFAULT_DIFF_LINE_COLOR}`}
          >
            {line.lineNumber !== undefined && (
              <span className="mr-4 w-8 select-none text-right text-slate-400">
                {line.lineNumber}
              </span>
            )}
            {line.type !== 'header' && (
              <span className="mr-2 select-none text-slate-400">
                {DIFF_LINE_PREFIXES.get(line.type) ?? ' '}
              </span>
            )}
            <span className="flex-1 whitespace-pre">{line.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
