// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: Apache-2.0

import micromatch from 'micromatch';
import type { ToolScope } from '../kernel.schemas.js';

type PathScope = Extract<ToolScope, { type: 'path' }>;
type NetworkScope = Extract<ToolScope, { type: 'network' }>;
type PathAccess = PathScope['access'];

export interface ScopeIntersectionInput {
  workspaceAllowed: ToolScope[];
  laneAllowed: ToolScope[];
  taskDeclared: ToolScope[];
  toolRequired: ToolScope[];
}

function toPathScopes(scopes: ToolScope[], access: PathAccess): PathScope[] {
  return scopes.filter(
    (scope): scope is PathScope => scope.type === 'path' && scope.access === access,
  );
}

function toNetworkScopes(scopes: ToolScope[]): NetworkScope[] {
  return scopes.filter((scope): scope is NetworkScope => scope.type === 'network');
}

// Heuristic: does containerPattern glob-contain nestedPattern?
//
// Converts the nested pattern into synthetic test paths by replacing
// double-star with representative expansions and single-star with
// __segment__, then checks if the container matches ALL of them.
//
// GUARANTEES:
// - Correct for literal paths and simple wildcard hierarchies
//   (e.g. packages/double-star contains packages/foo/bar/double-star)
// - Correct for single-star segments (e.g. star.ts contains foo.ts)
// - Negation patterns (!) in either operand are rejected (return false)
// - Multiple depth expansions for double-star prevent false positives
//   from fixed-depth container patterns
//
// APPROXIMATIONS / KNOWN LIMITATIONS (WU-1864):
// - Brace expansion ({a,b}): partially handled by micromatch on the
//   container side, but the nested side's braces become literal text in
//   the synthetic path. This can produce false negatives but NOT false
//   positives (safe direction for security).
// - Character classes ([abc]): similar to brace expansion -- container
//   side works, nested side becomes literal. Safe direction.
//
// @internal Exported for property-based fuzz testing (WU-1864).
export function patternContains(containerPattern: string, nestedPattern: string): boolean {
  // Negation patterns are not supported by this heuristic. Returning
  // false is the safe direction (denies access rather than granting it).
  if (containerPattern.startsWith('!') || nestedPattern.startsWith('!')) {
    return false;
  }

  // When the nested pattern contains double-star (matches 0+ segments),
  // a single synthetic expansion can falsely match fixed-depth containers.
  // Test multiple depth expansions and require ALL valid ones to match
  // the container.
  const hasGlobstar = nestedPattern.includes('**');

  if (hasGlobstar) {
    // Generate test paths at different depths to verify containment
    // across the full range of what double-star can match.
    const rawExpansions = [
      // 0 segments: double-star matches empty (strip the globstar segment)
      nestedPattern
        .replace(/\*\*\/?/g, '')
        .replace(/\/+/g, '/')
        .replace(/^\/|\/$/g, ''),
      // 1 segment depth
      nestedPattern.replace(/\*\*/g, '__depth1__'),
      // 2 segment depth
      nestedPattern.replace(/\*\*/g, '__depth2a__/__depth2b__'),
      // 3 segment depth
      nestedPattern.replace(/\*\*/g, '__depth3a__/__depth3b__/__depth3c__'),
    ];

    // Replace remaining single-stars in all expansions
    const testPaths = rawExpansions
      .map((p) => p.replace(/\*/g, '__segment__'))
      .filter((p) => p.length > 0);

    // Only include test paths that the nested pattern itself would match.
    // Some depth expansions produce paths that the nested pattern does not
    // actually match (e.g. 0-depth expansion of star/doublestar produces
    // __segment__ which star/doublestar does not match). Including those
    // would cause false negatives.
    const validTestPaths = testPaths.filter((tp) => micromatch.isMatch(tp, nestedPattern));

    // ALL valid synthetic paths must match the container for containment
    // to hold. If any valid expansion fails, the heuristic conservatively
    // returns false. This prevents false positives where a fixed-depth
    // container incorrectly claims to contain a globstar pattern.
    return (
      validTestPaths.length > 0 &&
      validTestPaths.every((tp) => micromatch.isMatch(tp, containerPattern))
    );
  }

  // No globstar: simple replacement of single-star with a test segment.
  const testPath = nestedPattern.replace(/\*/g, '__segment__');
  return micromatch.isMatch(testPath, containerPattern);
}

function patternsOverlap(left: string, right: string): boolean {
  return (
    left === right ||
    patternContains(left, right) ||
    patternContains(right, left) ||
    micromatch.isMatch(right, left) ||
    micromatch.isMatch(left, right)
  );
}

function allPatternsOverlap(patterns: string[]): boolean {
  for (let i = 0; i < patterns.length; i += 1) {
    const left = patterns[i];
    if (left === undefined) {
      continue;
    }
    for (let j = i + 1; j < patterns.length; j += 1) {
      const right = patterns[j];
      if (right === undefined) {
        continue;
      }
      if (!patternsOverlap(left, right)) {
        return false;
      }
    }
  }
  return true;
}

function specificityScore(pattern: string): number {
  const literalLength = pattern.replace(/[*[\]{}()!?+@]/g, '').length;
  const wildcardCount = (pattern.match(/\*/g) ?? []).length;
  return literalLength - wildcardCount * 5;
}

function selectNarrowestPattern(patterns: string[]): string {
  return (
    [...patterns].sort((left, right) => specificityScore(right) - specificityScore(left))[0] ??
    patterns[0] ??
    ''
  );
}

function intersectPathScopes(
  workspaceAllowed: ToolScope[],
  laneAllowed: ToolScope[],
  taskDeclared: ToolScope[],
  toolRequired: ToolScope[],
  access: PathAccess,
): PathScope[] {
  const workspace = toPathScopes(workspaceAllowed, access);
  const lane = toPathScopes(laneAllowed, access);
  const task = toPathScopes(taskDeclared, access);
  const tool = toPathScopes(toolRequired, access);

  if (workspace.length === 0 || lane.length === 0 || task.length === 0 || tool.length === 0) {
    return [];
  }

  const scopes = new Map<string, PathScope>();

  for (const toolScope of tool) {
    for (const workspaceScope of workspace) {
      if (!patternsOverlap(toolScope.pattern, workspaceScope.pattern)) {
        continue;
      }
      for (const laneScope of lane) {
        if (!patternsOverlap(toolScope.pattern, laneScope.pattern)) {
          continue;
        }
        for (const taskScope of task) {
          if (!patternsOverlap(toolScope.pattern, taskScope.pattern)) {
            continue;
          }
          const candidates = [
            workspaceScope.pattern,
            laneScope.pattern,
            taskScope.pattern,
            toolScope.pattern,
          ];
          if (!allPatternsOverlap(candidates)) {
            continue;
          }
          const pattern = selectNarrowestPattern(candidates);
          const dedupeKey = `${access}:${pattern}`;
          scopes.set(dedupeKey, {
            type: 'path',
            access,
            pattern,
          });
        }
      }
    }
  }

  return [...scopes.values()];
}

/**
 * Network posture precedence (deny-wins):
 *   off < allowlist < full
 *
 * When all layers agree on posture, that posture is used.
 * When layers differ, the most restrictive posture wins:
 *   - Any layer declaring 'off' blocks all network access
 *   - 'full' is compatible with 'allowlist' (downgrades to allowlist)
 *   - 'allowlist' entries are intersected across layers that declare them
 */
function intersectNetworkScopes(
  workspaceAllowed: ToolScope[],
  laneAllowed: ToolScope[],
  taskDeclared: ToolScope[],
  toolRequired: ToolScope[],
): NetworkScope[] {
  const workspace = toNetworkScopes(workspaceAllowed);
  const lane = toNetworkScopes(laneAllowed);
  const task = toNetworkScopes(taskDeclared);
  const tool = toNetworkScopes(toolRequired);

  if (workspace.length === 0 || lane.length === 0 || task.length === 0 || tool.length === 0) {
    return [];
  }

  const allLayers = [workspace, lane, task, tool];

  // If any layer declares 'off' with no other posture, network is blocked
  for (const layer of allLayers) {
    const hasOnlyOff = layer.every((s) => s.posture === 'off');
    if (hasOnlyOff) {
      // Check if this layer is compatible with the tool's request
      const toolWantsNetwork = tool.some((s) => s.posture !== 'off');
      if (toolWantsNetwork) {
        return [];
      }
    }
  }

  // Determine the effective posture: most restrictive wins
  const hasAllowlist = allLayers.some((layer) => layer.some((s) => s.posture === 'allowlist'));

  if (hasAllowlist) {
    // Collect allowlist entries from all layers that declare allowlist.
    // Layers declaring 'full' are treated as "allow anything" (no restriction).
    // Layers declaring 'off' block everything (handled above).
    const layerEntries: Set<string>[] = [];

    for (const layer of allLayers) {
      const allowlistScopes = layer.filter((s) => s.posture === 'allowlist');
      const hasFullScope = layer.some((s) => s.posture === 'full');

      if (allowlistScopes.length > 0) {
        // Collect all entries from this layer's allowlist scopes
        const entries = new Set<string>();
        for (const scope of allowlistScopes) {
          const scopeEntries =
            'allowlist_entries' in scope ? (scope.allowlist_entries as string[]) : [];
          for (const entry of scopeEntries) {
            entries.add(entry);
          }
        }
        layerEntries.push(entries);
      } else if (hasFullScope) {
        // 'full' acts as unrestricted; skip this layer from intersection
        continue;
      } else {
        // Layer has 'off' only -- should have been caught above
        return [];
      }
    }

    if (layerEntries.length === 0) {
      return [];
    }

    // Intersect entries across all restricting layers
    let intersected = layerEntries[0];
    for (let i = 1; i < layerEntries.length; i++) {
      const next = layerEntries[i];
      if (!intersected || !next) {
        return [];
      }
      intersected = new Set([...intersected].filter((entry) => next.has(entry)));
    }

    if (!intersected || intersected.size === 0) {
      return [];
    }

    return [
      {
        type: 'network',
        posture: 'allowlist',
        allowlist_entries: [...intersected].sort(),
      } as NetworkScope,
    ];
  }

  // No allowlist involved: original logic for off/full
  const scopes = new Map<NetworkScope['posture'], NetworkScope>();
  for (const toolScope of tool) {
    const posture = toolScope.posture;
    if (
      workspace.some((scope) => scope.posture === posture) &&
      lane.some((scope) => scope.posture === posture) &&
      task.some((scope) => scope.posture === posture)
    ) {
      scopes.set(posture, {
        type: 'network',
        posture,
      });
    }
  }

  return [...scopes.values()];
}

export function intersectToolScopes(input: ScopeIntersectionInput): ToolScope[] {
  const readPaths = intersectPathScopes(
    input.workspaceAllowed,
    input.laneAllowed,
    input.taskDeclared,
    input.toolRequired,
    'read',
  );
  const writePaths = intersectPathScopes(
    input.workspaceAllowed,
    input.laneAllowed,
    input.taskDeclared,
    input.toolRequired,
    'write',
  );
  const network = intersectNetworkScopes(
    input.workspaceAllowed,
    input.laneAllowed,
    input.taskDeclared,
    input.toolRequired,
  );

  return [...readPaths, ...writePaths, ...network];
}
