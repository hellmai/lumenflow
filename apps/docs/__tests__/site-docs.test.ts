import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const DOCS_APP_ROOT = resolve(import.meta.dirname, '..');
const ASTRO_CONFIG_PATH = resolve(DOCS_APP_ROOT, 'astro.config.mjs');
const RELEASE_INDEX_PATH = resolve(DOCS_APP_ROOT, 'src/content/docs/releases/index.mdx');
const CHANGELOG_PATH = resolve(DOCS_APP_ROOT, 'src/content/docs/reference/changelog.mdx');
const CURRENT_STABLE_VERSION = '3.18.0';

function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

describe('published docs metadata', () => {
  it('lists the published Agent Runtime pack in the sidebar', () => {
    const astroConfig = readText(ASTRO_CONFIG_PATH);

    expect(astroConfig).toContain("label: 'Agent Runtime Pack'");
    expect(astroConfig).toContain("slug: 'packs/agent-runtime'");
    expect(astroConfig).toContain("slug: 'packs/agent-runtime/overview'");
    expect(astroConfig).toContain("slug: 'packs/agent-runtime/configuration'");
    expect(astroConfig).toContain("slug: 'packs/agent-runtime/workflows'");
  });

  it('marks the current stable release as latest on the releases page', () => {
    const releaseIndex = readText(RELEASE_INDEX_PATH);

    expect(releaseIndex).toContain(`<Card title="v${CURRENT_STABLE_VERSION}"`);
    expect(releaseIndex).toContain(`[v${CURRENT_STABLE_VERSION}]`);
  });

  it('marks the current stable release as latest in the changelog', () => {
    const changelog = readText(CHANGELOG_PATH);

    expect(changelog).toContain(`## v${CURRENT_STABLE_VERSION}`);
    expect(changelog).toContain(
      `Current package line for \`@lumenflow/*\` is \`v${CURRENT_STABLE_VERSION}\`.`,
    );
  });
});
