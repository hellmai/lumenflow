'use client';

import type { PackCatalogEntry, PackPolicyView, PackToolView } from '../lib/pack-catalog-types';

const PAGE_TITLE = 'Pack Catalog';
const EMPTY_STATE_MESSAGE =
  'No packs loaded. Configure packs in your workspace spec to get started.';

const PERMISSION_BADGE_COLORS = new Map<string, string>([
  ['read', 'bg-blue-100 text-blue-700'],
  ['write', 'bg-amber-100 text-amber-700'],
  ['admin', 'bg-red-100 text-red-700'],
]);

const DECISION_BADGE_COLORS = new Map<string, string>([
  ['allow', 'bg-green-100 text-green-700'],
  ['deny', 'bg-red-100 text-red-700'],
]);

const SOURCE_BADGE_COLORS = new Map<string, string>([
  ['local', 'bg-slate-100 text-slate-600'],
  ['git', 'bg-purple-100 text-purple-700'],
  ['registry', 'bg-indigo-100 text-indigo-700'],
]);

const DEFAULT_BADGE_COLOR = 'bg-slate-100 text-slate-600';
const SECTION_TITLE_CLASS = 'text-sm font-semibold uppercase tracking-wide text-slate-500';

interface ToolItemProps {
  readonly tool: PackToolView;
  readonly traceBaseUrl?: string;
}

function ToolItem({ tool, traceBaseUrl }: ToolItemProps) {
  return (
    <div className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-medium text-slate-800">{tool.name}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${PERMISSION_BADGE_COLORS.get(tool.permission) ?? DEFAULT_BADGE_COLOR}`}
        >
          {tool.permission}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {tool.scopes.map((scope) => (
          <span
            key={`scope-${tool.name}-${scope.type}-${scope.pattern ?? ''}-${scope.access ?? ''}`}
            className="inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600"
          >
            <span className="font-medium">{scope.type}</span>
            {scope.pattern && <span className="font-mono">{scope.pattern}</span>}
            {scope.access && (
              <span className="rounded bg-slate-300 px-1 text-[10px] font-medium uppercase">
                {scope.access}
              </span>
            )}
          </span>
        ))}
        {traceBaseUrl && (
          <a
            data-testid={`tool-trace-link-${tool.name}`}
            href={`${traceBaseUrl}?tool=${encodeURIComponent(tool.name)}`}
            className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-200"
          >
            traces
          </a>
        )}
      </div>
    </div>
  );
}

interface PolicyItemProps {
  readonly policy: PackPolicyView;
}

function PolicyItem({ policy }: PolicyItemProps) {
  return (
    <div className="flex items-center gap-2 rounded border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${DECISION_BADGE_COLORS.get(policy.decision) ?? DEFAULT_BADGE_COLOR}`}
      >
        {policy.decision}
      </span>
      <span className="font-mono text-slate-700">{policy.id}</span>
      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500">
        {policy.trigger}
      </span>
      {policy.reason && <span className="text-xs text-slate-400">{policy.reason}</span>}
    </div>
  );
}

interface PackCardProps {
  readonly pack: PackCatalogEntry;
  readonly traceBaseUrl?: string;
}

function PackCard({ pack, traceBaseUrl }: PackCardProps) {
  return (
    <div
      data-testid={`pack-card-${pack.id}`}
      className="rounded-lg border border-slate-200 bg-white"
    >
      {/* Pack Header */}
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-900">{pack.id}</h2>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-500">
              {pack.version}
            </span>
            <span
              data-testid={`pack-source-${pack.id}`}
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_BADGE_COLORS.get(pack.source) ?? DEFAULT_BADGE_COLOR}`}
            >
              {pack.source}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {pack.taskTypes.map((taskType) => (
              <span
                key={`task-type-${pack.id}-${taskType}`}
                className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
              >
                {taskType}
              </span>
            ))}
          </div>
        </div>
        <div
          data-testid={`pack-integrity-${pack.id}`}
          className="mt-1 font-mono text-xs text-slate-400"
        >
          {pack.integrity}
        </div>
      </div>

      {/* Tools Section */}
      <div data-testid={`pack-tools-${pack.id}`} className="border-b border-slate-100 px-4 py-3">
        <h3 className={SECTION_TITLE_CLASS}>
          Tools{' '}
          <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-400">
            {pack.tools.length}
          </span>
        </h3>
        <div className="mt-2 space-y-1">
          {pack.tools.map((tool) => (
            <ToolItem
              key={`tool-${pack.id}-${tool.name}`}
              tool={tool}
              traceBaseUrl={traceBaseUrl}
            />
          ))}
        </div>
      </div>

      {/* Policies Section */}
      <div data-testid={`pack-policies-${pack.id}`} className="px-4 py-3">
        <h3 className={SECTION_TITLE_CLASS}>
          Policies{' '}
          <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-400">
            {pack.policies.length}
          </span>
        </h3>
        {pack.policies.length > 0 ? (
          <div className="mt-2 space-y-1">
            {pack.policies.map((policy) => (
              <PolicyItem key={`policy-${pack.id}-${policy.id}`} policy={policy} />
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-400">No policies defined.</p>
        )}
      </div>
    </div>
  );
}

export interface PackCatalogProps {
  readonly packs: readonly PackCatalogEntry[];
  readonly traceBaseUrl?: string;
}

export function PackCatalog({ packs, traceBaseUrl }: PackCatalogProps) {
  const hasPacks = packs.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      {/* Header */}
      <div data-testid="pack-catalog-header" className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{PAGE_TITLE}</h1>
          <span className="rounded bg-slate-100 px-2 py-1 text-sm font-medium text-slate-500">
            {packs.length}
          </span>
        </div>
      </div>

      {hasPacks ? (
        <div className="space-y-6">
          {packs.map((pack) => (
            <PackCard key={`pack-${pack.id}`} pack={pack} traceBaseUrl={traceBaseUrl} />
          ))}
        </div>
      ) : (
        <div
          data-testid="pack-catalog-empty"
          className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400"
        >
          {EMPTY_STATE_MESSAGE}
        </div>
      )}
    </div>
  );
}
