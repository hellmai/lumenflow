'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import type { MarketplacePackSummary, MarketplaceCategory } from '../lib/marketplace-types';
import type { PackRegistryEntry, PackManifestSummary } from '../lib/pack-registry-types';
import { MarketplaceBrowse } from './marketplace-browse';

/* ------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------ */

const REGISTRY_API_PATH = '/api/registry/packs';
const LOADING_MESSAGE = 'Loading marketplace...';
const ERROR_MESSAGE_PREFIX = 'Failed to load marketplace';
const RETRY_LABEL = 'Retry';
const TRUST_INTEGRITY_BADGE = 'trust-integrity-verified';
const TRUST_MANIFEST_BADGE = 'trust-manifest-parsed';
const TRUST_PUBLISHER_BADGE = 'trust-publisher-verified';
const SCOPE_BADGE_PREFIX = 'scope-';

/* ------------------------------------------------------------------
 * Data transformation
 * ------------------------------------------------------------------ */

type FetchState = 'idle' | 'loading' | 'success' | 'error';

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function buildTrustBadges(summary: PackManifestSummary | undefined): string[] {
  if (!summary) {
    return [];
  }

  const badges: string[] = [];
  if (summary.trust.integrityVerified) {
    badges.push(TRUST_INTEGRITY_BADGE);
  }
  if (summary.trust.manifestParsed) {
    badges.push(TRUST_MANIFEST_BADGE);
  }
  if (summary.trust.publisherVerified) {
    badges.push(TRUST_PUBLISHER_BADGE);
  }

  for (const permission of summary.trust.permissionScopes) {
    badges.push(`${SCOPE_BADGE_PREFIX}${permission}`);
  }

  return uniqueStrings(badges);
}

/**
 * Derive categories from pack descriptions.
 * In production, categories would come from pack manifests.
 * For now, we derive them from pack IDs and descriptions.
 */
function deriveCategories(packs: readonly MarketplacePackSummary[]): MarketplaceCategory[] {
  const categoryMap = new Map<string, number>();

  for (const pack of packs) {
    for (const cat of pack.categories) {
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
    }
  }

  return Array.from(categoryMap.entries())
    .map(([id, count]) => ({
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

function toMarketplaceSummary(entry: PackRegistryEntry): MarketplacePackSummary {
  const latestVersion = entry.versions.find((version) => version.version === entry.latestVersion);
  const manifestSummary = latestVersion?.manifest_summary;
  const fallbackCategories = deriveCategoriesFromDescription(entry.id, entry.description);
  const manifestCategories = manifestSummary?.categories ?? [];
  const categories = uniqueStrings([
    ...(manifestCategories.length > 0 ? manifestCategories : fallbackCategories),
    ...buildTrustBadges(manifestSummary),
  ]);

  return {
    id: entry.id,
    description: entry.description,
    latestVersion: entry.latestVersion,
    updatedAt: entry.updatedAt,
    categories,
  };
}

const CATEGORY_KEYWORDS = new Map<string, readonly string[]>([
  ['development', ['git', 'code', 'build', 'test', 'lint', 'format', 'worktree', 'software']],
  ['devops', ['deploy', 'ci', 'cd', 'pipeline', 'infrastructure', 'gate']],
  ['support', ['ticket', 'support', 'customer', 'escalation']],
  ['data', ['data', 'etl', 'schema', 'database', 'analytics']],
  ['security', ['security', 'auth', 'pii', 'redaction', 'policy']],
]);

function deriveCategoriesFromDescription(id: string, description: string): string[] {
  const lowerText = `${id} ${description}`.toLowerCase();
  const matched: string[] = [];

  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lowerText.includes(kw))) {
      matched.push(category);
    }
  }

  return matched;
}

/* ------------------------------------------------------------------
 * Hook
 * ------------------------------------------------------------------ */

interface UseMarketplaceDataResult {
  readonly state: FetchState;
  readonly packs: readonly MarketplacePackSummary[];
  readonly categories: readonly MarketplaceCategory[];
  readonly errorMessage: string | null;
  readonly refetch: () => void;
}

function useMarketplaceData(): UseMarketplaceDataResult {
  const [state, setState] = useState<FetchState>('idle');
  const [packs, setPacks] = useState<readonly MarketplacePackSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setState('loading');
    setErrorMessage(null);

    try {
      const response = await fetch(REGISTRY_API_PATH);
      if (!response.ok) {
        throw new Error(`${ERROR_MESSAGE_PREFIX}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        packs?: PackRegistryEntry[];
      };
      const rawPacks = Array.isArray(data?.packs) ? data.packs : [];
      const summaries = rawPacks.map(toMarketplaceSummary);

      setPacks(summaries);
      setState('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : ERROR_MESSAGE_PREFIX;
      setErrorMessage(message);
      setState('error');
    }
  }, []);

  const refetch = useCallback(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const categories = useMemo(() => deriveCategories(packs), [packs]);

  return { state, packs, categories, errorMessage, refetch };
}

/* ------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------ */

export function MarketplaceBrowseLive() {
  const { state, packs, categories, errorMessage, refetch } = useMarketplaceData();

  if (state === 'idle' || state === 'loading') {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="animate-pulse rounded-lg bg-slate-100 p-8 text-center text-sm text-slate-400">
          {LOADING_MESSAGE}
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm text-red-700">{errorMessage ?? ERROR_MESSAGE_PREFIX}</p>
          <button
            type="button"
            onClick={refetch}
            className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
          >
            {RETRY_LABEL}
          </button>
        </div>
      </div>
    );
  }

  return <MarketplaceBrowse packs={packs} categories={categories} />;
}
