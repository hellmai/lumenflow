'use client';

/**
 * Gate badge grid component for gate tool outputs.
 * Renders a grid of pass/fail/skip/warn badges for each gate result.
 */

const STATUS_COLORS = new Map<string, string>([
  ['pass', 'bg-green-100 text-green-700 border-green-200'],
  ['fail', 'bg-red-100 text-red-700 border-red-200'],
  ['skip', 'bg-slate-100 text-slate-500 border-slate-200'],
  ['warn', 'bg-amber-100 text-amber-700 border-amber-200'],
]);

const STATUS_ICONS = new Map<string, string>([
  ['pass', 'P'],
  ['fail', 'F'],
  ['skip', 'S'],
  ['warn', 'W'],
]);

const DEFAULT_STATUS_COLOR = 'bg-slate-100 text-slate-500 border-slate-200';

interface GateResultData {
  readonly name: string;
  readonly status: string;
  readonly message?: string;
  readonly durationMs?: number;
}

interface GateBadgeGridProps {
  readonly gates: readonly GateResultData[];
  readonly summary?: string;
}

export function GateBadgeGrid({ gates, summary }: GateBadgeGridProps) {
  return (
    <div data-testid="gate-badge-grid" className="space-y-3">
      {/* Badge grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {gates.map((gate) => (
          <div
            key={gate.name}
            data-testid={`gate-badge-${gate.name}`}
            data-status={gate.status}
            className={`rounded-lg border p-3 ${STATUS_COLORS.get(gate.status) ?? DEFAULT_STATUS_COLOR}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{STATUS_ICONS.get(gate.status) ?? '?'}</span>
              <span className="text-sm font-semibold">{gate.name}</span>
            </div>
            {gate.message && <p className="mt-1 text-xs opacity-75">{gate.message}</p>}
            {gate.durationMs !== undefined && (
              <p className="mt-1 text-xs opacity-50">{gate.durationMs}ms</p>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      {summary && (
        <div
          data-testid="gate-summary"
          className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600"
        >
          {summary}
        </div>
      )}
    </div>
  );
}
