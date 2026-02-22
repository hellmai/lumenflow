import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildWorkspaceVitestAliases,
  resolveAliasMatch,
} from '../testing/workspace-vitest-aliases';

const REPO_ROOT = process.cwd();

describe('buildWorkspaceVitestAliases', () => {
  it('maps package root exports to source entry points', () => {
    const aliases = buildWorkspaceVitestAliases({ repoRoot: REPO_ROOT });

    expect(resolveAliasMatch(aliases, '@lumenflow/kernel')).toBe(
      path.join(process.cwd(), 'packages/@lumenflow/kernel/src/index.ts'),
    );
  });

  it('maps package subpath exports to source modules', () => {
    const aliases = buildWorkspaceVitestAliases({ repoRoot: REPO_ROOT });

    expect(resolveAliasMatch(aliases, '@lumenflow/memory/signal')).toBe(
      path.join(process.cwd(), 'packages/@lumenflow/memory/src/mem-signal-core.ts'),
    );
  });
});
