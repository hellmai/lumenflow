// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: Apache-2.0

// Property-based fuzz tests for the patternContains glob heuristic.
//
// The heuristic is security-critical: if it returns a false positive
// (claims container contains nested when it does not), tools may execute
// outside their declared scope.
//
// Oracle: micromatch.isMatch is the ground truth.
// Strategy: generate random glob pairs, expand them to concrete paths,
// and verify the heuristic never claims containment when micromatch
// disagrees on actual paths.
//
// @see WU-1864

/* eslint-disable sonarjs/assertions-in-tests -- fc.assert IS the assertion mechanism for property-based tests */

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import micromatch from 'micromatch';
import { patternContains } from '../tool-host/scope-intersection.js';

// ---------------------------------------------------------------------------
// Arbitrary generators
// ---------------------------------------------------------------------------

// Generate a path segment: 1-8 lowercase alpha chars
const segmentArb = fc.string({
  minLength: 1,
  maxLength: 8,
  unit: fc.constantFrom(...'abcdefghij'.split('')),
});

// Generate a glob segment: either a literal, single star, or double star
const globSegmentArb = fc.oneof(
  { weight: 5, arbitrary: segmentArb },
  { weight: 2, arbitrary: fc.constant('*') },
  { weight: 1, arbitrary: fc.constant('**') },
);

// Generate a glob pattern as slash-separated segments (1-5 deep)
const globPatternArb = fc
  .array(globSegmentArb, { minLength: 1, maxLength: 5 })
  .map((segments) => segments.join('/'));

// Generate a pattern that might include brace expansion
const bracePatternArb = fc
  .tuple(segmentArb, segmentArb, segmentArb)
  .map(([prefix, a, b]) => `${prefix}/{${a},${b}}`);

// Generate a negation pattern
const negationPatternArb = globPatternArb.map((p) => `!${p}`);

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const FUZZ_ITERATIONS = 10_000;
const PATHS_PER_CHECK = 20;

// ---------------------------------------------------------------------------
// Helper: generate concrete paths that should match a glob
// ---------------------------------------------------------------------------

// Given a glob pattern, produce concrete paths by replacing wildcards
// with deterministic literal segments. This is NOT exhaustive but
// provides a representative sample.
function expandGlobToSamplePaths(pattern: string, count: number): string[] {
  const paths: string[] = [];
  const segments = pattern.split('/');

  for (let i = 0; i < count; i++) {
    const expanded: string[] = [];
    for (const seg of segments) {
      if (seg === '**') {
        // Expand to 0-3 levels of depth
        const depth = i % 4;
        for (let d = 0; d < depth; d++) {
          expanded.push(`dir${(i + d) % 10}`);
        }
      } else if (seg === '*') {
        expanded.push(`file${i % 10}`);
      } else {
        expanded.push(seg);
      }
    }
    if (expanded.length > 0) {
      paths.push(expanded.join('/'));
    }
  }

  // Deduplicate
  return [...new Set(paths)];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('patternContains fuzz tests (WU-1864)', () => {
  // AC1: Property-based tests verify patternContains against micromatch
  // reference for 10,000+ random patterns.
  //
  // Security invariant: if patternContains(container, nested) returns true,
  // then for ANY concrete path matched by nested, that path must also be
  // matched by container. A violation means a false containment claim
  // that could allow unauthorized tool execution.
  it('never claims containment when concrete nested paths escape the container (security invariant)', () => {
    fc.assert(
      fc.property(globPatternArb, globPatternArb, (container, nested) => {
        const heuristicResult = patternContains(container, nested);

        if (!heuristicResult) {
          // If heuristic says "not contained", that is the safe direction.
          // False negatives are acceptable (deny access when it could be
          // allowed). We do not need to verify this direction.
          return true;
        }

        // Heuristic claims containment: verify with oracle.
        // Generate sample paths matching the nested pattern and verify
        // they all match the container pattern too.
        const samplePaths = expandGlobToSamplePaths(nested, PATHS_PER_CHECK);
        for (const path of samplePaths) {
          if (micromatch.isMatch(path, nested)) {
            // This path matches nested -- it MUST also match container
            // for the containment claim to be valid.
            if (!micromatch.isMatch(path, container)) {
              // Found a counterexample: nested matches this path but
              // container does not. The heuristic lied -- this is a
              // security-relevant false positive.
              return false;
            }
          }
        }
        return true;
      }),
      { numRuns: FUZZ_ITERATIONS, seed: 42, verbose: 1 },
    );
  });

  // AC1 (supplement): Verify reflexivity -- every pattern contains itself.
  it('is reflexive: patternContains(p, p) is true for simple patterns', () => {
    fc.assert(
      fc.property(globPatternArb, (pattern) => {
        return patternContains(pattern, pattern);
      }),
      { numRuns: 5_000, seed: 123 },
    );
  });

  // AC2: Negation patterns (!foo) handled correctly or explicitly rejected.
  //
  // The heuristic does not explicitly handle negation. We verify that
  // negation patterns do not produce false-positive containment claims.
  it('does not produce false-positive containment for negation patterns', () => {
    fc.assert(
      fc.property(negationPatternArb, globPatternArb, (negContainer, nested) => {
        const result = patternContains(negContainer, nested);

        if (!result) return true;

        // If heuristic claims containment with a negation container,
        // verify with oracle on concrete paths.
        const samplePaths = expandGlobToSamplePaths(nested, PATHS_PER_CHECK);
        for (const path of samplePaths) {
          if (micromatch.isMatch(path, nested)) {
            if (!micromatch.isMatch(path, negContainer)) {
              return false;
            }
          }
        }
        return true;
      }),
      { numRuns: 2_000, seed: 456 },
    );
  });

  it('does not produce false-positive containment when nested is negation', () => {
    fc.assert(
      fc.property(globPatternArb, negationPatternArb, (container, negNested) => {
        const result = patternContains(container, negNested);

        if (!result) return true;

        // The synthetic path for a negation nested will start with "!"
        // which is a literal char -- micromatch would not normally match.
        // Verify the claim is valid.
        const samplePaths = expandGlobToSamplePaths(negNested.slice(1), PATHS_PER_CHECK);
        for (const path of samplePaths) {
          if (micromatch.isMatch(path, negNested)) {
            if (!micromatch.isMatch(path, container)) {
              return false;
            }
          }
        }
        return true;
      }),
      { numRuns: 2_000, seed: 789 },
    );
  });

  // AC3: Brace expansion ({a,b}) handled correctly or explicitly rejected.
  it('does not produce false-positive containment for brace expansion patterns', () => {
    fc.assert(
      fc.property(bracePatternArb, globPatternArb, (braceContainer, nested) => {
        const result = patternContains(braceContainer, nested);

        if (!result) return true;

        const samplePaths = expandGlobToSamplePaths(nested, PATHS_PER_CHECK);
        for (const path of samplePaths) {
          if (micromatch.isMatch(path, nested)) {
            if (!micromatch.isMatch(path, braceContainer)) {
              return false;
            }
          }
        }
        return true;
      }),
      { numRuns: 2_000, seed: 101 },
    );
  });

  it('does not produce false-positive containment when nested uses brace expansion', () => {
    fc.assert(
      fc.property(globPatternArb, bracePatternArb, (container, braceNested) => {
        const result = patternContains(container, braceNested);

        if (!result) return true;

        // Brace expansion in nested: the heuristic replaces wildcards but
        // leaves braces as literal text in the synthetic path. Verify.
        // Expand braces manually for oracle check.
        const expanded = micromatch.braces(braceNested, { expand: true });
        for (const expandedPattern of expanded) {
          const samplePaths = expandGlobToSamplePaths(expandedPattern, 10);
          for (const path of samplePaths) {
            if (micromatch.isMatch(path, braceNested)) {
              if (!micromatch.isMatch(path, container)) {
                return false;
              }
            }
          }
        }
        return true;
      }),
      { numRuns: 2_000, seed: 202 },
    );
  });

  // -------------------------------------------------------------------------
  // AC4: Edge cases documented with regression tests
  // -------------------------------------------------------------------------

  describe('edge case regression tests', () => {
    // Edge case: double-star at different positions
    it('handles double-star at start (prefix globstar)', () => {
      expect(patternContains('**/foo', 'bar/foo')).toBe(true);
      expect(patternContains('**/foo', 'a/b/c/foo')).toBe(true);
    });

    it('handles double-star at end (suffix globstar)', () => {
      expect(patternContains('foo/**', 'foo/bar')).toBe(true);
      expect(patternContains('foo/**', 'foo/bar/baz')).toBe(true);
    });

    it('rejects disjoint literal paths', () => {
      expect(patternContains('foo/bar', 'baz/qux')).toBe(false);
    });

    it('handles double-star vs double-star at different nesting levels', () => {
      // packages/double-star should contain packages/foo/bar/double-star
      expect(patternContains('packages/**', 'packages/foo/bar/**')).toBe(true);
    });

    // Edge case: single star should match only within one segment.
    it('single star does not cross directory boundaries', () => {
      expect(patternContains('foo/*', 'foo/bar')).toBe(true);
      expect(patternContains('foo/*', 'foo/bar/baz')).toBe(false);
    });

    // Edge case: empty-ish patterns.
    it('handles single-segment patterns', () => {
      expect(patternContains('*', 'foo')).toBe(true);
      expect(patternContains('**', 'foo')).toBe(true);
      expect(patternContains('**', 'foo/bar')).toBe(true);
    });

    // Edge case: overlapping character class in container.
    it('character classes in container work via micromatch', () => {
      expect(patternContains('[ab]', 'a')).toBe(true);
      expect(patternContains('[ab]', 'b')).toBe(true);
      expect(patternContains('[ab]', 'c')).toBe(false);
    });

    // Edge case: brace expansion in container.
    it('brace expansion in container works via micromatch', () => {
      expect(patternContains('{foo,bar}', 'foo')).toBe(true);
      expect(patternContains('{foo,bar}', 'bar')).toBe(true);
      expect(patternContains('{foo,bar}', 'baz')).toBe(false);
    });

    // Edge case: brace expansion in nested pattern becomes literal.
    // The heuristic converts nested wildcards but leaves braces as-is.
    it('brace expansion in nested is treated as literal text (safe direction)', () => {
      // double-star matches anything, including the literal text {foo,bar}
      // The heuristic will say "contained" -- verify this is safe.
      const result = patternContains('**', '{foo,bar}');
      // This is safe because double-star does contain everything {foo,bar} matches
      expect(result).toBe(true);
    });

    // Edge case: negation in container.
    it('negation in container does not produce false containment for simple paths', () => {
      // !foo should NOT contain foo (negation excludes it)
      expect(patternContains('!foo', 'foo')).toBe(false);
    });
  });
});
