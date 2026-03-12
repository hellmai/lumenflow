import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PUBLIC_MANIFEST } from '../../../packages/@lumenflow/cli/src/public-manifest.ts';
import {
  allTools,
  registeredTools,
  runtimeTaskTools,
} from '../../../packages/@lumenflow/mcp/src/tools.ts';

const DOCS_APP_ROOT = resolve(import.meta.dirname, '..');
const DOCS_CONTENT_ROOT = resolve(DOCS_APP_ROOT, 'src/content/docs');
const INTERNAL_DOCS_ROOT = resolve(DOCS_APP_ROOT, '../../docs/operations/_frameworks/lumenflow');
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
const ALL_PUBLIC_COMMANDS = new Set(PUBLIC_MANIFEST.map((command) => command.name));
const PRIMARY_COMMANDS = new Set(
  PUBLIC_MANIFEST.filter((command) => (command.surface ?? 'primary') === 'primary').map(
    (command) => command.name,
  ),
);
const MCP_TOOL_NAMES = new Set(registeredTools.map((tool) => tool.name));
const EXAMPLE_TAG_PREFIX = 'lumenflow-example:';
const COMMAND_BLOCK_LANGUAGES = new Set(['bash', 'sh', 'shell', 'zsh']);
const WORKFLOW_STEP_CLAIM = 'wu:claim';
const WORKFLOW_STEP_BRIEF = 'wu:brief';
const WORKFLOW_STEP_PREP = 'wu:prep';
const WORKFLOW_STEP_DONE = 'wu:done';
const WORKFLOW_STEP_CLEANUP = 'wu:cleanup';
const COMMAND_MATCH_PATTERN =
  /\bpnpm\s+(?:exec\s+)?([a-z0-9][a-z0-9:_-]*)\b|\blumenflow\s+([a-z][a-z0-9:_-]*)\b/gi;
const MCP_TOOL_MATCH_PATTERNS = [
  /###\s+([a-z][a-z0-9_]+)/g,
  /\bname:\s*"([a-z][a-z0-9_]+)"/g,
  /"name"\s*:\s*"([a-z][a-z0-9_]+)"/g,
];
const MCP_TOOL_PREFIX_PATTERN =
  /^(agent|approval|backlog|cloud|config|context|cost|delegation|docs|file|flow|gate|gates|git|initiative|init|lane|lumenflow|mem|metrics|orchestrate|pack|plan|signal|state|sync|task|templates|tool|validate|wu)_/;
const TARGETED_COMMAND_PREFIXES = new Set([
  'agent',
  'approval',
  'cloud',
  'config',
  'gates',
  'initiative',
  'lane',
  'lumenflow',
  'mem',
  'pack',
  'plan',
  'signal',
  'state',
  'task',
  'wu',
]);
const HISTORICAL_OR_COMPATIBILITY_PATHS = [
  'src/content/docs/releases/',
  'src/content/docs/reference/compatibility.mdx',
];
const MCP_HISTORICAL_COMPATIBILITY_PATHS = ['mcp-concepts.md'];
const COMMAND_ALIAS_MAP = new Map<string, string>([
  ['lumenflow-doctor', 'lumenflow:doctor'],
  ['lumenflow-integrate', 'lumenflow:integrate'],
  ['lumenflow-init', 'lumenflow'],
  ['lumenflow-onboard', 'onboard'],
  ['workspace:init', 'workspace:init'],
]);
const DISALLOWED_COMMAND_USAGE_PATTERNS = [
  {
    pattern: /\bpnpm\s+wu:edit\b[^\n]*\s--status\b/i,
    message: 'Use dedicated WU lifecycle commands instead of `pnpm wu:edit --status`.',
  },
  {
    pattern: /\bpnpm\s+lane:unlock\b/i,
    message: 'Use `pnpm wu:unlock-lane` instead of `pnpm lane:unlock`.',
  },
  {
    pattern: /\bpnpm\s+exec\s+initiative-create\b/i,
    message: 'Use `pnpm initiative:create` instead of `pnpm exec initiative-create`.',
  },
  {
    pattern: /\bpnpm\s+exec\s+initiative-edit\b/i,
    message: 'Use `pnpm initiative:edit` instead of `pnpm exec initiative-edit`.',
  },
  {
    pattern: /\bpnpm\s+exec\s+wu-create\b/i,
    message: 'Use `pnpm wu:create` instead of `pnpm exec wu-create`.',
  },
];

type ExampleTag = 'strict' | 'illustrative' | 'historical' | 'legacy' | 'placeholder';

type CommandExample = {
  command: string;
  normalizedCommand: string;
  source: string;
  line: number;
};

type MappedToolExample = {
  tool: string;
  line: number;
};

type CodeBlock = {
  content: string;
  filePath: string;
  language: string;
  line: number;
  tag: ExampleTag;
};

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

    return entryPath.endsWith('.md') || entryPath.endsWith('.mdx') ? [entryPath] : [];
  });
}

function getRepoRelativePath(filePath: string): string {
  return relative(resolve(DOCS_APP_ROOT, '../..'), filePath);
}

function normalizeExampleCommand(command: string): string {
  if (PRIMARY_COMMANDS.has(command)) {
    return command;
  }

  return COMMAND_ALIAS_MAP.get(command) ?? command;
}

function isHistoricalOrCompatibilityFile(filePath: string, extraPatterns: string[] = []): boolean {
  const repoRelativePath = getRepoRelativePath(filePath);
  return [...HISTORICAL_OR_COMPATIBILITY_PATHS, ...extraPatterns].some((pattern) =>
    repoRelativePath.includes(pattern),
  );
}

function findLineNumber(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function extractCommandExamples(text: string): CommandExample[] {
  const matches: CommandExample[] = [];

  for (const match of text.matchAll(COMMAND_MATCH_PATTERN)) {
    const rawCommand = match[1] ?? match[2];

    if (!rawCommand) {
      continue;
    }

    const normalizedCommand = normalizeExampleCommand(rawCommand);
    const commandRoot = normalizedCommand.split(/[:]/, 1)[0];
    const isRecognizedFamily =
      ALL_PUBLIC_COMMANDS.has(rawCommand) ||
      ALL_PUBLIC_COMMANDS.has(normalizedCommand) ||
      COMMAND_ALIAS_MAP.has(rawCommand) ||
      (rawCommand.includes(':') && TARGETED_COMMAND_PREFIXES.has(commandRoot));

    if (!isRecognizedFamily) {
      continue;
    }

    matches.push({
      command: rawCommand,
      normalizedCommand,
      source: match[0],
      line: findLineNumber(text, match.index ?? 0),
    });
  }

  return matches;
}

function extractMcpToolExamples(text: string): MappedToolExample[] {
  const matches: MappedToolExample[] = [];

  for (const pattern of MCP_TOOL_MATCH_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const tool = match[1];

      if (!tool || !MCP_TOOL_PREFIX_PATTERN.test(tool)) {
        continue;
      }

      matches.push({
        tool,
        line: findLineNumber(text, match.index ?? 0),
      });
    }
  }

  return matches;
}

function parseExampleTag(line: string): ExampleTag | null {
  const trimmedLine = line.trim();

  if (!trimmedLine.startsWith('<!--') || !trimmedLine.includes(EXAMPLE_TAG_PREFIX)) {
    return null;
  }

  const tagValue = trimmedLine
    .slice(trimmedLine.indexOf(EXAMPLE_TAG_PREFIX) + EXAMPLE_TAG_PREFIX.length)
    .replace('-->', '')
    .trim()
    .toLowerCase();

  if (
    tagValue === 'strict' ||
    tagValue === 'illustrative' ||
    tagValue === 'historical' ||
    tagValue === 'legacy' ||
    tagValue === 'placeholder'
  ) {
    return tagValue;
  }

  return null;
}

function parseCodeBlocks(text: string, filePath: string): CodeBlock[] {
  const lines = text.split('\n');
  const blocks: CodeBlock[] = [];
  let pendingTag: ExampleTag | null = null;
  let activeBlock: {
    contentLines: string[];
    language: string;
    line: number;
    tag: ExampleTag;
  } | null = null;

  lines.forEach((line, index) => {
    const tag = parseExampleTag(line);
    if (tag) {
      pendingTag = tag;
      return;
    }

    const fenceMatch = line.match(/^```([a-zA-Z0-9_-]*)\s*$/);
    if (!fenceMatch) {
      if (activeBlock) {
        activeBlock.contentLines.push(line);
      }
      return;
    }

    if (!activeBlock) {
      activeBlock = {
        contentLines: [],
        language: fenceMatch[1].toLowerCase(),
        line: index + 1,
        tag: pendingTag ?? 'strict',
      };
      pendingTag = null;
      return;
    }

    blocks.push({
      content: activeBlock.contentLines.join('\n'),
      filePath,
      language: activeBlock.language,
      line: activeBlock.line,
      tag: activeBlock.tag,
    });
    activeBlock = null;
  });

  return blocks;
}

function isStrictWorkflowBlock(block: CodeBlock): boolean {
  const hasExecutableClaim =
    block.content.includes(WORKFLOW_STEP_CLAIM) &&
    !block.content.includes(`${WORKFLOW_STEP_CLAIM} --help`);

  return (
    COMMAND_BLOCK_LANGUAGES.has(block.language) &&
    block.tag === 'strict' &&
    hasExecutableClaim &&
    (block.content.includes(WORKFLOW_STEP_PREP) || block.content.includes(WORKFLOW_STEP_DONE))
  );
}

function validateWorkflowBlock(block: CodeBlock): string[] {
  const failures: string[] = [];
  const claimIndex = block.content.indexOf(WORKFLOW_STEP_CLAIM);
  const briefIndex = block.content.indexOf(WORKFLOW_STEP_BRIEF);
  const prepIndex = block.content.indexOf(WORKFLOW_STEP_PREP);
  const doneIndex = block.content.indexOf(WORKFLOW_STEP_DONE);
  const cleanupIndex = block.content.indexOf(WORKFLOW_STEP_CLEANUP);

  if (claimIndex !== -1 && (prepIndex !== -1 || doneIndex !== -1) && briefIndex === -1) {
    failures.push('missing required `pnpm wu:brief` step after `wu:claim`');
  }

  if (briefIndex !== -1 && prepIndex !== -1 && briefIndex > prepIndex) {
    failures.push('`pnpm wu:brief` must appear before `pnpm wu:prep`');
  }

  if (briefIndex !== -1 && doneIndex !== -1 && briefIndex > doneIndex) {
    failures.push('`pnpm wu:brief` must appear before `pnpm wu:done`');
  }

  if (prepIndex !== -1 && doneIndex !== -1 && prepIndex > doneIndex) {
    failures.push('`pnpm wu:prep` must appear before `pnpm wu:done`');
  }

  if (doneIndex !== -1 && cleanupIndex !== -1 && doneIndex > cleanupIndex) {
    failures.push('`pnpm wu:done` must appear before `pnpm wu:cleanup`');
  }

  return failures;
}

function collectDisallowedCommandUsages(text: string): string[] {
  return DISALLOWED_COMMAND_USAGE_PATTERNS.flatMap(({ pattern, message }) =>
    pattern.test(text) ? [message] : [],
  );
}

describe('public docs parity', () => {
  it('parses example tags and workflow validation rules', () => {
    const taggedBlocks = parseCodeBlocks(
      [
        '<!-- lumenflow-example: illustrative -->',
        '```bash',
        'pnpm wu:claim --id WU-100 --lane "Docs"',
        'pnpm wu:done --id WU-100',
        '```',
        '```bash',
        'pnpm wu:claim --id WU-100 --lane "Docs"',
        'pnpm wu:prep --id WU-100',
        'pnpm wu:done --id WU-100',
        '```',
      ].join('\n'),
      resolve(DOCS_CONTENT_ROOT, 'fixtures/example-tags.mdx'),
    );

    expect(taggedBlocks[0]?.tag).toBe('illustrative');
    expect(taggedBlocks[1]?.tag).toBe('strict');
    expect(validateWorkflowBlock(taggedBlocks[1]!)).toContain(
      'missing required `pnpm wu:brief` step after `wu:claim`',
    );
  });

  it('normalizes supported command aliases and detects stale command usage patterns', () => {
    expect(normalizeExampleCommand('lumenflow-doctor')).toBe('lumenflow:doctor');

    const usageProblems = collectDisallowedCommandUsages(
      [
        'pnpm exec initiative-create --id INIT-001',
        'pnpm wu:edit --id WU-001 --status blocked',
        'pnpm lane:unlock "Framework: Core"',
      ].join('\n'),
    );

    expect(usageProblems).toEqual(
      expect.arrayContaining([
        'Use `pnpm initiative:create` instead of `pnpm exec initiative-create`.',
        'Use dedicated WU lifecycle commands instead of `pnpm wu:edit --status`.',
        'Use `pnpm wu:unlock-lane` instead of `pnpm lane:unlock`.',
      ]),
    );
  });

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

  it('keeps command examples aligned with the current CLI manifest and workflow rules', () => {
    const docsFiles = [...listDocsFiles(DOCS_CONTENT_ROOT), ...listDocsFiles(INTERNAL_DOCS_ROOT)];
    const failures: string[] = [];

    for (const filePath of docsFiles) {
      const text = readText(filePath);
      const repoRelativePath = getRepoRelativePath(filePath);
      const skipStrictCommandExistence = isHistoricalOrCompatibilityFile(filePath);

      for (const usageProblem of collectDisallowedCommandUsages(text)) {
        failures.push(`${repoRelativePath}: ${usageProblem}`);
      }

      if (!skipStrictCommandExistence) {
        for (const commandExample of extractCommandExamples(text)) {
          if (!ALL_PUBLIC_COMMANDS.has(commandExample.normalizedCommand)) {
            failures.push(
              `${repoRelativePath}:${commandExample.line} references unknown CLI command \`${commandExample.command}\``,
            );
          }
        }
      }

      for (const block of parseCodeBlocks(text, filePath)) {
        if (!isStrictWorkflowBlock(block)) {
          continue;
        }

        for (const issue of validateWorkflowBlock(block)) {
          failures.push(`${repoRelativePath}:${block.line} ${issue}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('keeps MCP tool examples aligned with the registered MCP tool surface', () => {
    const docsFiles = [
      PUBLIC_MCP_REFERENCE_PATH,
      INTERNAL_MCP_REFERENCE_PATH,
      resolve(INTERNAL_DOCS_ROOT, 'mcp-concepts.md'),
    ];
    const failures: string[] = [];

    for (const filePath of docsFiles) {
      const text = readText(filePath);
      const repoRelativePath = getRepoRelativePath(filePath);
      const skipToolExistence = isHistoricalOrCompatibilityFile(
        filePath,
        MCP_HISTORICAL_COMPATIBILITY_PATHS,
      );

      if (skipToolExistence) {
        continue;
      }

      for (const toolExample of extractMcpToolExamples(text)) {
        if (!MCP_TOOL_NAMES.has(toolExample.tool)) {
          failures.push(
            `${repoRelativePath}:${toolExample.line} references unknown MCP tool \`${toolExample.tool}\``,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
