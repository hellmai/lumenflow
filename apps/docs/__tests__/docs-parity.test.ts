import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PUBLIC_MANIFEST } from '../../../packages/@lumenflow/cli/src/public-manifest.ts';
import {
  allTools,
  registeredTools,
  runtimeTaskTools,
} from '../../../packages/@lumenflow/mcp/src/tools.ts';

const DOCS_APP_ROOT = resolve(import.meta.dirname, '..');
const DOCS_CONTENT_ROOT = resolve(DOCS_APP_ROOT, 'src/content/docs');
const ASTRO_CONFIG_PATH = resolve(DOCS_APP_ROOT, 'astro.config.mjs');
const CLI_REFERENCE_PATH = resolve(DOCS_CONTENT_ROOT, 'reference/cli.mdx');
const PUBLIC_MCP_REFERENCE_PATH = resolve(DOCS_CONTENT_ROOT, 'reference/mcp.mdx');
const INTERNAL_MCP_REFERENCE_PATH = resolve(
  DOCS_APP_ROOT,
  '../../docs/operations/_frameworks/lumenflow/mcp-server.md',
);
const QUICK_REF_COMMANDS_PATH = resolve(
  DOCS_APP_ROOT,
  '../../docs/operations/_frameworks/lumenflow/agent/onboarding/quick-ref-commands.md',
);
const LEGACY_PACK_OVERVIEW_PATH = resolve(DOCS_CONTENT_ROOT, 'pack/overview.mdx');

function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

function listDocsFiles(rootDir: string): string[] {
  const entries = readdirSync(rootDir, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const entryPath = resolve(rootDir, entry.name);

    if (entry.isDirectory()) {
      return listDocsFiles(entryPath);
    }

    return entryPath.endsWith('.mdx') ? [entryPath] : [];
  });
}

describe('public docs parity', () => {
  it('lists the public Sidekick pack in the sidebar', () => {
    const astroConfig = readText(ASTRO_CONFIG_PATH);

    expect(astroConfig).toContain("label: 'Sidekick Pack'");
    expect(astroConfig).toContain("slug: 'packs/sidekick'");
    expect(astroConfig).toContain("slug: 'packs/sidekick/overview'");
    expect(astroConfig).toContain("slug: 'packs/sidekick/workflows'");
  });

  it('keeps the CLI reference in parity with the primary public command manifest', () => {
    const cliReference = readText(CLI_REFERENCE_PATH);
    const primaryCommands = PUBLIC_MANIFEST.filter(
      (command) => (command.surface ?? 'primary') === 'primary',
    );

    expect(cliReference).toContain('{/* AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY */}');

    for (const command of primaryCommands) {
      expect(cliReference, `Missing CLI heading for ${command.name}`).toContain(
        `### ${command.name}`,
      );
    }
  });

  it('documents quick reference scope and command discovery in internal docs', () => {
    const quickRef = readText(QUICK_REF_COMMANDS_PATH);

    expect(quickRef).toContain('This document is a quick reference, not the complete list.');
    expect(quickRef).toContain('pnpm lumenflow:commands');
  });

  it('documents the current MCP registry counts in public and internal docs', () => {
    const publicMcpReference = readText(PUBLIC_MCP_REFERENCE_PATH);
    const internalMcpReference = readText(INTERNAL_MCP_REFERENCE_PATH);

    const registeredToolCount = registeredTools.length;
    const coreToolCount = allTools.length;
    const runtimeToolCount = runtimeTaskTools.length;

    expect(publicMcpReference).toContain(`**${registeredToolCount} tools**`);
    expect(publicMcpReference).toContain(
      `(${coreToolCount} in the core \`allTools\` registry plus ${runtimeToolCount} runtime task tools)`,
    );

    expect(internalMcpReference).toContain(`${registeredToolCount} tools`);
    expect(internalMcpReference).toContain(`${runtimeToolCount} runtime task tools`);
  });

  it('does not link public docs content back to the legacy /pack/overview route', () => {
    const docsFiles = listDocsFiles(DOCS_CONTENT_ROOT).filter(
      (filePath) => filePath !== LEGACY_PACK_OVERVIEW_PATH,
    );
    const staleRouteUsages = docsFiles.filter((filePath) =>
      readText(filePath).includes('/pack/overview'),
    );

    expect(staleRouteUsages).toEqual([]);
  });
});
