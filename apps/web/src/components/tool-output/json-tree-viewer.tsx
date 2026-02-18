'use client';

/**
 * Default JSON tree viewer for tool outputs with unknown data shapes.
 * Renders arbitrary JSON as a collapsible tree structure.
 */

const VALUE_TYPE_CLASSES = {
  string: 'text-green-700',
  number: 'text-blue-700',
  boolean: 'text-purple-700',
  null: 'text-slate-400 italic',
} as const;

function getValueClass(value: unknown): string {
  if (value === null) return VALUE_TYPE_CLASSES.null;
  if (typeof value === 'string') return VALUE_TYPE_CLASSES.string;
  if (typeof value === 'number') return VALUE_TYPE_CLASSES.number;
  if (typeof value === 'boolean') return VALUE_TYPE_CLASSES.boolean;
  return '';
}

function formatPrimitive(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}

function isExpandable(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === 'object';
}

interface JsonNodeProps {
  readonly label?: string;
  readonly value: unknown;
  readonly depth: number;
}

function JsonNode({ label, value, depth }: JsonNodeProps) {
  if (!isExpandable(value)) {
    return (
      <div className="flex items-baseline gap-1" style={{ paddingLeft: `${depth * 16}px` }}>
        {label !== undefined && (
          <span className="font-mono text-xs font-medium text-slate-600">{label}</span>
        )}
        {label !== undefined && <span className="text-slate-400">:</span>}
        <span className={`font-mono text-xs ${getValueClass(value)}`}>
          {formatPrimitive(value)}
        </span>
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? value.map((item, index) => [`[${index}]`, item] as const)
    : Object.entries(value);

  return (
    <div>
      {label !== undefined && (
        <div
          className="flex items-baseline gap-1 font-mono text-xs"
          style={{ paddingLeft: `${depth * 16}px` }}
        >
          <span className="font-medium text-slate-600">{label}</span>
          <span className="text-slate-400">
            {isArray ? `[${value.length}]` : `{${Object.keys(value).length}}`}
          </span>
        </div>
      )}
      {entries.map(([key, val]) => (
        <JsonNode key={String(key)} label={String(key)} value={val} depth={depth + 1} />
      ))}
    </div>
  );
}

interface JsonTreeViewerProps {
  readonly data: unknown;
}

export function JsonTreeViewer({ data }: JsonTreeViewerProps) {
  return (
    <div
      data-testid="json-tree-viewer"
      className="rounded-lg border border-slate-200 bg-slate-50 p-3 overflow-auto"
    >
      <JsonNode value={data} depth={0} />
    </div>
  );
}
