import { execFileSync } from 'node:child_process';
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
const INTERNAL_DOCS_ROOT = resolve(DOCS_APP_ROOT, '../../docs/operations');
const ASTRO_CONFIG_PATH = resolve(DOCS_APP_ROOT, 'astro.config.mjs');
const CLI_REFERENCE_PATH = resolve(DOCS_CONTENT_ROOT, 'reference/cli.mdx');
const PUBLIC_MCP_REFERENCE_PATH = resolve(DOCS_CONTENT_ROOT, 'reference/mcp.mdx');
const INTERNAL_MCP_REFERENCE_PATH = resolve(
  DOCS_APP_ROOT,
  '../../docs/operations/_frameworks/lumenflow/mcp-server.md',
);
const INTERNAL_MCP_CONCEPTS_PATH = resolve(
  DOCS_APP_ROOT,
  '../../docs/operations/_frameworks/lumenflow/mcp-concepts.md',
);
const QUICK_REF_COMMANDS_PATH = resolve(
  DOCS_APP_ROOT,
  '../../docs/operations/_frameworks/lumenflow/agent/onboarding/quick-ref-commands.md',
);
const LEGACY_PACK_OVERVIEW_PATH = resolve(DOCS_CONTENT_ROOT, 'pack/overview.mdx');
const ALL_PUBLIC_COMMANDS = new Set(PUBLIC_MANIFEST.map((command) => command.name));
const PUBLIC_COMMAND_MAP = new Map(PUBLIC_MANIFEST.map((command) => [command.name, command]));
const PRIMARY_COMMANDS = new Set(
  PUBLIC_MANIFEST.filter((command) => (command.surface ?? 'primary') === 'primary').map(
    (command) => command.name,
  ),
);
const MCP_TOOL_NAMES = new Set(registeredTools.map((tool) => tool.name));
const MCP_TOOL_MAP = new Map(registeredTools.map((tool) => [tool.name, tool]));
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
  'docs/operations/tasks/',
  'docs/operations/plans/',
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
  {
    pattern: /\bpnpm\s+exec\s+lumenflow-doctor\b/i,
    message: 'Use `pnpm lumenflow:doctor` instead of `pnpm exec lumenflow-doctor`.',
  },
  {
    pattern: /\bpnpm\s+exec\s+lumenflow-integrate\b/i,
    message: 'Use `pnpm lumenflow:integrate` instead of `pnpm exec lumenflow-integrate`.',
  },
  {
    pattern: /\bpnpm\s+exec\s+lumenflow(?:\s|$)/i,
    message:
      'Use `pnpm lumenflow ...` for repo-local examples or `npx lumenflow ...` for external-project setup, not `pnpm exec lumenflow ...`.',
  },
  {
    pattern: /\bpnpm\s+lumenflow\s+init\b/i,
    message:
      'Use `pnpm lumenflow ...` or `npx lumenflow ...` directly; `pnpm lumenflow init ...` is a stale form.',
  },
  {
    pattern: /\bpnpm\s+lumenflow\s+doctor\b/i,
    message: 'Use `pnpm lumenflow:doctor` instead of `pnpm lumenflow doctor`.',
  },
  {
    pattern: /\bpnpm\s+exec\s+lumenflow\s+validate\b/i,
    message: 'Use `pnpm validate` instead of `pnpm exec lumenflow validate`.',
  },
  {
    pattern: /\bpnpm\s+exec\s+lumenflow\s+docs:sync\b/i,
    message: 'Use `pnpm lumenflow:docs-sync` instead of `pnpm exec lumenflow docs:sync`.',
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

type CliInvocation = {
  command: string;
  normalizedCommand: string;
  tokens: string[];
  line: number;
};

type CliOptionSpec = {
  flag: string;
  expectsValue: boolean;
};

type McpPayloadExample = {
  name: string;
  arguments: Record<string, unknown>;
  line: number;
  tag: ExampleTag;
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

function isAutoGeneratedDoc(text: string): boolean {
  return text.includes('AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY');
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

function extractMcpPayloadExamples(_blocks: CodeBlock[]): McpPayloadExample[] {
  const examples: McpPayloadExample[] = [];

  for (const block of _blocks) {
    if (block.language !== 'json') {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(block.content);
    } catch {
      continue;
    }

    if (!parsed || typeof parsed !== 'object') {
      continue;
    }

    const candidate = parsed as { name?: unknown; arguments?: unknown };
    if (typeof candidate.name !== 'string') {
      continue;
    }

    const args =
      candidate.arguments &&
      typeof candidate.arguments === 'object' &&
      !Array.isArray(candidate.arguments)
        ? (candidate.arguments as Record<string, unknown>)
        : {};

    examples.push({
      name: candidate.name,
      arguments: args,
      line: block.line,
      tag: block.tag,
    });
  }

  return examples;
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
        tag: pendingTag ?? 'illustrative',
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

function splitShellTokens(commandText: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of commandText) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function extractExecutableSegment(line: string): string | null {
  const match = line.match(/\b(?:pnpm|npx|lumenflow)\b.*$/);
  return match?.[0] ?? null;
}

function extractCliInvocations(block: CodeBlock): CliInvocation[] {
  if (!COMMAND_BLOCK_LANGUAGES.has(block.language)) {
    return [];
  }

  const invocations: CliInvocation[] = [];
  const lines = block.content.split('\n');
  let buffer = '';
  let bufferLine = block.line;

  const flush = () => {
    const segment = extractExecutableSegment(buffer.trim());
    buffer = '';
    if (!segment) {
      return;
    }

    const tokens = splitShellTokens(segment);
    if (tokens.length === 0) {
      return;
    }

    let commandToken: string | undefined;
    let offset = 0;

    if (tokens[0] === 'pnpm') {
      commandToken = tokens[1];
      offset = 2;
    } else if (tokens[0] === 'npx' && tokens[1] === 'lumenflow') {
      commandToken = 'lumenflow';
      offset = 2;
    } else if (tokens[0] === 'lumenflow') {
      commandToken = 'lumenflow';
      offset = 1;
    }

    if (!commandToken) {
      return;
    }

    const normalizedCommand = normalizeExampleCommand(commandToken);
    invocations.push({
      command: commandToken,
      normalizedCommand,
      tokens: tokens.slice(offset),
      line: bufferLine,
    });
  };

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return;
    }

    if (!buffer) {
      bufferLine = block.line + index;
    }

    const continuation = trimmedLine.endsWith('\\');
    buffer += `${trimmedLine.replace(/\\$/, '').trim()} `;

    if (!continuation) {
      flush();
    }
  });

  if (buffer.trim()) {
    flush();
  }

  return invocations;
}

function parseCliOptionsFromHelp(helpText: string): Map<string, CliOptionSpec> {
  const optionMap = new Map<string, CliOptionSpec>();
  const usageLine = helpText.split('\n').find((line) => line.startsWith('Usage: '));
  if (usageLine) {
    const usageTokens = splitShellTokens(usageLine.replace(/^Usage:\s+/, ''));
    for (let index = 0; index < usageTokens.length; index += 1) {
      const token = usageTokens[index];
      if (!token.startsWith('-')) {
        continue;
      }

      const nextToken = usageTokens[index + 1];
      optionMap.set(token, {
        flag: token,
        expectsValue: Boolean(
          nextToken && !nextToken.startsWith('-') && !nextToken.startsWith('['),
        ),
      });
    }
  }

  const optionsSection = helpText.split(/\nOptions:\n/, 2)[1];

  if (!optionsSection) {
    return optionMap;
  }

  for (const line of optionsSection.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine.startsWith('-')) {
      continue;
    }

    const flagsSegment = trimmedLine.split(/\s{2,}/, 1)[0] ?? trimmedLine;
    for (const flagMatch of flagsSegment.matchAll(
      /(?<flag>--[a-z0-9-]+|-[a-z0-9])(?:(?:[ =])(?<value><[^>]+>|\[[^\]]+\]))?/gi,
    )) {
      const flag = flagMatch.groups?.flag;
      if (!flag) {
        continue;
      }

      optionMap.set(flag, {
        flag,
        expectsValue: Boolean(flagMatch.groups?.value),
      });
    }
  }

  return optionMap;
}

const CLI_HELP_CACHE = new Map<string, Map<string, CliOptionSpec>>();

function getCliOptionSpecs(command: string): Map<string, CliOptionSpec> {
  const cached = CLI_HELP_CACHE.get(command);
  if (cached) {
    return cached;
  }

  const manifestEntry = PUBLIC_COMMAND_MAP.get(command);
  if (!manifestEntry) {
    return new Map();
  }

  const cliEntryPath = resolve(
    DOCS_APP_ROOT,
    '../../packages/@lumenflow/cli',
    manifestEntry.binPath,
  );
  const helpOutput = execFileSync('node', [cliEntryPath, '--help'], {
    cwd: resolve(DOCS_APP_ROOT, '../..'),
    encoding: 'utf8',
  });
  const optionSpecs = parseCliOptionsFromHelp(helpOutput);
  CLI_HELP_CACHE.set(command, optionSpecs);
  return optionSpecs;
}

function validateCliInvocationFlags(
  invocation: CliInvocation,
  optionSpecs: Map<string, CliOptionSpec>,
): string[] {
  const failures: string[] = [];
  const tokens = invocation.tokens;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--') {
      break;
    }

    if (!token.startsWith('-')) {
      continue;
    }

    const [flag, assignedValue] = token.split('=', 2);
    const spec = optionSpecs.get(flag);

    if (!spec) {
      failures.push(`uses unknown flag \`${flag}\` for \`${invocation.normalizedCommand}\``);
      continue;
    }

    if (!spec.expectsValue && assignedValue !== undefined) {
      failures.push(
        `uses invalid value form for \`${flag}\` on \`${invocation.normalizedCommand}\`: flag does not accept a value`,
      );
      continue;
    }

    if (!spec.expectsValue) {
      continue;
    }

    if (assignedValue !== undefined) {
      continue;
    }

    const nextToken = tokens[index + 1];
    if (!nextToken || nextToken.startsWith('-')) {
      failures.push(
        `uses invalid value form for \`${flag}\` on \`${invocation.normalizedCommand}\`: missing required value`,
      );
      continue;
    }

    index += 1;
  }

  return failures;
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
        '<!-- lumenflow-example: strict -->',
        '```bash',
        'pnpm wu:claim --id WU-100 --lane "Docs"',
        'pnpm wu:prep --id WU-100',
        'pnpm wu:done --id WU-100',
        '```',
      ].join('\n'),
      resolve(DOCS_CONTENT_ROOT, 'fixtures/example-tags.mdx'),
    );

    expect(taggedBlocks[0]?.tag).toBe('illustrative');
    expect(taggedBlocks[1]?.tag).toBe('illustrative');
    expect(taggedBlocks[2]?.tag).toBe('strict');
    expect(validateWorkflowBlock(taggedBlocks[2]!)).toContain(
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
        'pnpm exec lumenflow-doctor',
        'pnpm exec lumenflow validate',
      ].join('\n'),
    );

    expect(usageProblems).toEqual(
      expect.arrayContaining([
        'Use `pnpm initiative:create` instead of `pnpm exec initiative-create`.',
        'Use dedicated WU lifecycle commands instead of `pnpm wu:edit --status`.',
        'Use `pnpm wu:unlock-lane` instead of `pnpm lane:unlock`.',
        'Use `pnpm lumenflow:doctor` instead of `pnpm exec lumenflow-doctor`.',
        'Use `pnpm validate` instead of `pnpm exec lumenflow validate`.',
      ]),
    );
  });

  it('parses CLI invocations and validates flags against live option specs', () => {
    const block = parseCodeBlocks(
      [
        '<!-- lumenflow-example: strict -->',
        '```bash',
        'pnpm wu:create --lane "Framework: Core" --title "Add thing" --bogus',
        'pnpm wu:claim --id WU-100 --lane "Framework: Core"',
        'pnpm wu:brief --id WU-100 --client codex-cli',
        'pnpm wu:prep --id WU-100',
        'cd <project-root> && pnpm wu:done --id WU-100',
        '```',
      ].join('\n'),
      resolve(DOCS_CONTENT_ROOT, 'fixtures/cli-flags.mdx'),
    )[0]!;

    const invocations = extractCliInvocations(block);

    expect(invocations.map((invocation) => invocation.normalizedCommand)).toEqual([
      'wu:create',
      'wu:claim',
      'wu:brief',
      'wu:prep',
      'wu:done',
    ]);

    const failures = validateCliInvocationFlags(invocations[0]!, getCliOptionSpecs('wu:create'));
    expect(failures).toContain('uses unknown flag `--bogus` for `wu:create`');
  });

  it('parses flags that only appear in command usage lines', () => {
    const optionSpecs = parseCliOptionsFromHelp(
      [
        'Usage: pnpm wu:done --id WU-334 [OPTIONS]',
        '',
        'Options:',
        '  --docs-only         Run docs-only gates',
        '  --help, -h          Show this help',
      ].join('\n'),
    );

    expect(optionSpecs.get('--id')).toEqual({
      flag: '--id',
      expectsValue: true,
    });
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

  it('scans the broader docs/operations tree while keeping archival docs allowlisted', () => {
    const internalDocsFiles = listDocsFiles(INTERNAL_DOCS_ROOT);

    expect(
      internalDocsFiles.some((filePath) =>
        getRepoRelativePath(filePath).includes(
          'docs/operations/_frameworks/lumenflow/agent/onboarding/first-15-mins.md',
        ),
      ),
    ).toBe(true);
    expect(
      isHistoricalOrCompatibilityFile(resolve(INTERNAL_DOCS_ROOT, 'plans/INIT-023-plan.md')),
    ).toBe(true);
    expect(
      isHistoricalOrCompatibilityFile(
        resolve(INTERNAL_DOCS_ROOT, 'tasks/wu/WU-1524-haven-retest-report.md'),
      ),
    ).toBe(true);
  });

  it('documents the current MCP registry counts in public and internal docs', () => {
    const publicMcpReference = readText(PUBLIC_MCP_REFERENCE_PATH);
    const internalMcpReference = readText(INTERNAL_MCP_REFERENCE_PATH);

    const registeredToolCount = registeredTools.length;
    const coreToolCount = allTools.length;
    const runtimeToolCount = runtimeTaskTools.length;

    expect(publicMcpReference).toContain('{/* AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY */}');
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
      const skipStaleUsageChecks = isAutoGeneratedDoc(text);

      if (!skipStaleUsageChecks) {
        for (const usageProblem of collectDisallowedCommandUsages(text)) {
          failures.push(`${repoRelativePath}: ${usageProblem}`);
        }
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
        if (block.tag === 'strict' && COMMAND_BLOCK_LANGUAGES.has(block.language)) {
          for (const invocation of extractCliInvocations(block)) {
            if (!ALL_PUBLIC_COMMANDS.has(invocation.normalizedCommand)) {
              continue;
            }

            const optionSpecs = getCliOptionSpecs(invocation.normalizedCommand);
            for (const issue of validateCliInvocationFlags(invocation, optionSpecs)) {
              failures.push(`${repoRelativePath}:${invocation.line} ${issue}`);
            }
          }
        }

        if (!isStrictWorkflowBlock(block)) {
          continue;
        }

        for (const issue of validateWorkflowBlock(block)) {
          failures.push(`${repoRelativePath}:${block.line} ${issue}`);
        }
      }
    }

    expect(failures).toEqual([]);
  }, 20_000);

  it('keeps MCP tool examples aligned with the registered MCP tool surface', () => {
    const docsFiles = [
      PUBLIC_MCP_REFERENCE_PATH,
      INTERNAL_MCP_REFERENCE_PATH,
      INTERNAL_MCP_CONCEPTS_PATH,
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

  it('keeps strict MCP payload examples aligned with live tool schemas', () => {
    const docsFiles = [
      PUBLIC_MCP_REFERENCE_PATH,
      INTERNAL_MCP_REFERENCE_PATH,
      INTERNAL_MCP_CONCEPTS_PATH,
    ];
    const failures: string[] = [];

    for (const filePath of docsFiles) {
      const text = readText(filePath);
      const repoRelativePath = getRepoRelativePath(filePath);

      for (const example of extractMcpPayloadExamples(parseCodeBlocks(text, filePath))) {
        if (example.tag !== 'strict') {
          continue;
        }

        const tool = MCP_TOOL_MAP.get(example.name);
        if (!tool) {
          failures.push(
            `${repoRelativePath}:${example.line} references unknown MCP tool \`${example.name}\``,
          );
          continue;
        }

        const validation = tool.inputSchema.safeParse(example.arguments);
        if (!validation.success) {
          const issue = validation.error.issues[0];
          const issuePath = issue?.path?.length ? issue.path.join('.') : '(root)';
          failures.push(
            `${repoRelativePath}:${example.line} invalid strict MCP payload for \`${example.name}\` at \`${issuePath}\`: ${issue?.message ?? 'schema validation failed'}`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('parses strict MCP payload examples for schema validation', () => {
    const filePath = resolve(DOCS_CONTENT_ROOT, 'fixtures/mcp-payload-example.mdx');
    const blocks = parseCodeBlocks(
      [
        '<!-- lumenflow-example: strict -->',
        '```json',
        '{',
        '  "name": "wu_status",',
        '  "arguments": {',
        '    "id": "WU-1234"',
        '  }',
        '}',
        '```',
        '<!-- lumenflow-example: illustrative -->',
        '```json',
        '{',
        '  "name": "wu_claim",',
        '  "arguments": {}',
        '}',
        '```',
      ].join('\n'),
      filePath,
    );

    expect(extractMcpPayloadExamples(blocks)).toEqual([
      {
        name: 'wu_status',
        arguments: { id: 'WU-1234' },
        line: 2,
        tag: 'strict',
      },
      {
        name: 'wu_claim',
        arguments: {},
        line: 11,
        tag: 'illustrative',
      },
    ]);
  });
});
