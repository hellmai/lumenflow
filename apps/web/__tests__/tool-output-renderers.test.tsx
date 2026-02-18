// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ToolOutput } from '../src/lib/tool-output-types';
import { detectToolCategory, TOOL_CATEGORIES } from '../src/lib/tool-output-types';

/* ------------------------------------------------------------------
 * WU-1833: Build GenUI tool output renderers
 *
 * AC1: Default JSON tree viewer for unknown tool outputs
 * AC2: Git tool diff viewer renders correctly
 * AC3: Gate tool pass/fail badges display
 * AC4: Tool output type auto-detected from tool_name prefix
 * ------------------------------------------------------------------ */

// --- Fixtures ---

const UNKNOWN_TOOL_OUTPUT: ToolOutput = {
  toolName: 'custom.analyze',
  data: {
    result: 'success',
    details: {
      count: 42,
      items: ['alpha', 'beta'],
    },
    enabled: true,
  },
};

const GIT_DIFF_OUTPUT: ToolOutput = {
  toolName: 'git.diff',
  data: {
    filePath: 'src/lib/utils.ts',
    lines: [
      { type: 'header', content: '@@ -1,3 +1,4 @@' },
      { type: 'context', content: 'import { clsx } from "clsx";', lineNumber: 1 },
      { type: 'removed', content: 'import { twMerge } from "tailwind-merge";', lineNumber: 2 },
      { type: 'added', content: 'import { twMerge } from "tailwind-merge";', lineNumber: 2 },
      { type: 'added', content: 'import { cn } from "./cn";', lineNumber: 3 },
    ],
  },
};

const GATES_OUTPUT: ToolOutput = {
  toolName: 'gates.run',
  data: {
    gates: [
      { name: 'format', status: 'pass', durationMs: 1200 },
      { name: 'lint', status: 'pass', durationMs: 3400 },
      { name: 'typecheck', status: 'fail', message: '2 type errors found' },
      { name: 'test', status: 'skip', message: 'Skipped (no test files changed)' },
      { name: 'spec:linter', status: 'warn', message: '1 warning' },
    ],
    summary: '2 passed, 1 failed, 1 skipped, 1 warning',
  },
};

const SIMPLE_UNKNOWN_OUTPUT: ToolOutput = {
  toolName: 'unknown.tool',
  data: { message: 'hello world' },
};

// --- AC4: Tool output type auto-detected from tool_name prefix ---

describe('detectToolCategory', () => {
  it('detects git tools by prefix', () => {
    expect(detectToolCategory('git.diff')).toBe(TOOL_CATEGORIES.GIT);
    expect(detectToolCategory('git.commit')).toBe(TOOL_CATEGORIES.GIT);
    expect(detectToolCategory('git.status')).toBe(TOOL_CATEGORIES.GIT);
  });

  it('detects gate tools by prefix', () => {
    expect(detectToolCategory('gates.run')).toBe(TOOL_CATEGORIES.GATES);
    expect(detectToolCategory('gates.check')).toBe(TOOL_CATEGORIES.GATES);
  });

  it('detects file tools by fs. prefix', () => {
    expect(detectToolCategory('fs.read')).toBe(TOOL_CATEGORIES.FILE);
    expect(detectToolCategory('fs.write')).toBe(TOOL_CATEGORIES.FILE);
  });

  it('detects file tools by file. prefix', () => {
    expect(detectToolCategory('file.read')).toBe(TOOL_CATEGORIES.FILE);
    expect(detectToolCategory('file.write')).toBe(TOOL_CATEGORIES.FILE);
  });

  it('returns unknown for unrecognized prefixes', () => {
    expect(detectToolCategory('custom.analyze')).toBe(TOOL_CATEGORIES.UNKNOWN);
    expect(detectToolCategory('random.tool')).toBe(TOOL_CATEGORIES.UNKNOWN);
    expect(detectToolCategory('noprefix')).toBe(TOOL_CATEGORIES.UNKNOWN);
  });
});

// --- AC1: Default JSON tree viewer for unknown tool outputs ---

describe('JsonTreeViewer component', () => {
  it('renders a tree structure from arbitrary JSON data', async () => {
    const { JsonTreeViewer } = await import('../src/components/tool-output/json-tree-viewer');

    render(<JsonTreeViewer data={UNKNOWN_TOOL_OUTPUT.data} />);

    const container = screen.getByTestId('json-tree-viewer');
    expect(container).toBeDefined();

    // Should display object keys
    expect(screen.getByText('result')).toBeDefined();
    expect(screen.getByText('details')).toBeDefined();
    expect(screen.getByText('enabled')).toBeDefined();
  });

  it('renders primitive values directly', async () => {
    const { JsonTreeViewer } = await import('../src/components/tool-output/json-tree-viewer');

    render(<JsonTreeViewer data="hello" />);

    const container = screen.getByTestId('json-tree-viewer');
    expect(container).toBeDefined();
    expect(screen.getByText('"hello"')).toBeDefined();
  });

  it('renders nested objects with indentation', async () => {
    const { JsonTreeViewer } = await import('../src/components/tool-output/json-tree-viewer');

    render(<JsonTreeViewer data={{ nested: { deep: 'value' } }} />);

    expect(screen.getByText('nested')).toBeDefined();
    expect(screen.getByText('deep')).toBeDefined();
    expect(screen.getByText('"value"')).toBeDefined();
  });

  it('renders arrays with index markers', async () => {
    const { JsonTreeViewer } = await import('../src/components/tool-output/json-tree-viewer');

    render(<JsonTreeViewer data={['first', 'second']} />);

    expect(screen.getByText('[0]')).toBeDefined();
    expect(screen.getByText('[1]')).toBeDefined();
    expect(screen.getByText('"first"')).toBeDefined();
    expect(screen.getByText('"second"')).toBeDefined();
  });

  it('renders null and boolean values', async () => {
    const { JsonTreeViewer } = await import('../src/components/tool-output/json-tree-viewer');

    render(<JsonTreeViewer data={{ isNull: null, isTrue: true, isFalse: false }} />);

    expect(screen.getByText('null')).toBeDefined();
    expect(screen.getByText('true')).toBeDefined();
    expect(screen.getByText('false')).toBeDefined();
  });
});

// --- AC2: Git tool diff viewer renders correctly ---

describe('GitDiffViewer component', () => {
  it('renders diff lines with correct styling indicators', async () => {
    const { GitDiffViewer } = await import('../src/components/tool-output/git-diff-viewer');

    const diffData = GIT_DIFF_OUTPUT.data as {
      filePath: string;
      lines: Array<{ type: string; content: string; lineNumber?: number }>;
    };

    render(<GitDiffViewer filePath={diffData.filePath} lines={diffData.lines} />);

    const container = screen.getByTestId('git-diff-viewer');
    expect(container).toBeDefined();

    // File path should be displayed
    expect(screen.getByText('src/lib/utils.ts')).toBeDefined();
  });

  it('marks added lines with data-diff-type="added"', async () => {
    const { GitDiffViewer } = await import('../src/components/tool-output/git-diff-viewer');

    const diffData = GIT_DIFF_OUTPUT.data as {
      filePath: string;
      lines: Array<{ type: string; content: string; lineNumber?: number }>;
    };

    render(<GitDiffViewer filePath={diffData.filePath} lines={diffData.lines} />);

    const addedLines = screen.getAllByTestId(/^diff-line-/);
    const addedTyped = addedLines.filter((el) => el.getAttribute('data-diff-type') === 'added');
    expect(addedTyped.length).toBeGreaterThan(0);
  });

  it('marks removed lines with data-diff-type="removed"', async () => {
    const { GitDiffViewer } = await import('../src/components/tool-output/git-diff-viewer');

    const diffData = GIT_DIFF_OUTPUT.data as {
      filePath: string;
      lines: Array<{ type: string; content: string; lineNumber?: number }>;
    };

    render(<GitDiffViewer filePath={diffData.filePath} lines={diffData.lines} />);

    const allLines = screen.getAllByTestId(/^diff-line-/);
    const removedTyped = allLines.filter((el) => el.getAttribute('data-diff-type') === 'removed');
    expect(removedTyped.length).toBeGreaterThan(0);
  });

  it('displays header lines', async () => {
    const { GitDiffViewer } = await import('../src/components/tool-output/git-diff-viewer');

    const diffData = GIT_DIFF_OUTPUT.data as {
      filePath: string;
      lines: Array<{ type: string; content: string; lineNumber?: number }>;
    };

    render(<GitDiffViewer filePath={diffData.filePath} lines={diffData.lines} />);

    expect(screen.getByText(/@@ -1,3 \+1,4 @@/)).toBeDefined();
  });
});

// --- AC3: Gate tool pass/fail badges display ---

describe('GateBadgeGrid component', () => {
  it('renders a badge for each gate result', async () => {
    const { GateBadgeGrid } = await import('../src/components/tool-output/gate-badge-grid');

    const gatesData = GATES_OUTPUT.data as {
      gates: Array<{ name: string; status: string; message?: string; durationMs?: number }>;
      summary?: string;
    };

    render(<GateBadgeGrid gates={gatesData.gates} summary={gatesData.summary} />);

    const container = screen.getByTestId('gate-badge-grid');
    expect(container).toBeDefined();

    // All gate names should be visible
    expect(screen.getByText('format')).toBeDefined();
    expect(screen.getByText('lint')).toBeDefined();
    expect(screen.getByText('typecheck')).toBeDefined();
    expect(screen.getByText('test')).toBeDefined();
    expect(screen.getByText('spec:linter')).toBeDefined();
  });

  it('applies correct data-status attribute for pass/fail/skip/warn', async () => {
    const { GateBadgeGrid } = await import('../src/components/tool-output/gate-badge-grid');

    const gatesData = GATES_OUTPUT.data as {
      gates: Array<{ name: string; status: string; message?: string; durationMs?: number }>;
      summary?: string;
    };

    render(<GateBadgeGrid gates={gatesData.gates} summary={gatesData.summary} />);

    const formatBadge = screen.getByTestId('gate-badge-format');
    expect(formatBadge.getAttribute('data-status')).toBe('pass');

    const typecheckBadge = screen.getByTestId('gate-badge-typecheck');
    expect(typecheckBadge.getAttribute('data-status')).toBe('fail');

    const testBadge = screen.getByTestId('gate-badge-test');
    expect(testBadge.getAttribute('data-status')).toBe('skip');

    const specBadge = screen.getByTestId('gate-badge-spec:linter');
    expect(specBadge.getAttribute('data-status')).toBe('warn');
  });

  it('displays failure messages', async () => {
    const { GateBadgeGrid } = await import('../src/components/tool-output/gate-badge-grid');

    const gatesData = GATES_OUTPUT.data as {
      gates: Array<{ name: string; status: string; message?: string; durationMs?: number }>;
      summary?: string;
    };

    render(<GateBadgeGrid gates={gatesData.gates} summary={gatesData.summary} />);

    expect(screen.getByText('2 type errors found')).toBeDefined();
  });

  it('displays summary when provided', async () => {
    const { GateBadgeGrid } = await import('../src/components/tool-output/gate-badge-grid');

    const gatesData = GATES_OUTPUT.data as {
      gates: Array<{ name: string; status: string; message?: string; durationMs?: number }>;
      summary?: string;
    };

    render(<GateBadgeGrid gates={gatesData.gates} summary={gatesData.summary} />);

    expect(screen.getByTestId('gate-summary')).toBeDefined();
    expect(screen.getByText(/2 passed, 1 failed/)).toBeDefined();
  });
});

// --- AC4 + Integration: ToolOutputRenderer selects correct renderer ---

describe('ToolOutputRenderer component', () => {
  it('renders JsonTreeViewer for unknown tool outputs', async () => {
    const { ToolOutputRenderer } =
      await import('../src/components/tool-output/tool-output-renderer');

    render(<ToolOutputRenderer output={UNKNOWN_TOOL_OUTPUT} />);

    expect(screen.getByTestId('json-tree-viewer')).toBeDefined();
  });

  it('renders GitDiffViewer for git.diff tool output', async () => {
    const { ToolOutputRenderer } =
      await import('../src/components/tool-output/tool-output-renderer');

    render(<ToolOutputRenderer output={GIT_DIFF_OUTPUT} />);

    expect(screen.getByTestId('git-diff-viewer')).toBeDefined();
  });

  it('renders GateBadgeGrid for gates.run tool output', async () => {
    const { ToolOutputRenderer } =
      await import('../src/components/tool-output/tool-output-renderer');

    render(<ToolOutputRenderer output={GATES_OUTPUT} />);

    expect(screen.getByTestId('gate-badge-grid')).toBeDefined();
  });

  it('falls back to JsonTreeViewer for git tools without diff data shape', async () => {
    const { ToolOutputRenderer } =
      await import('../src/components/tool-output/tool-output-renderer');

    const gitStatusOutput: ToolOutput = {
      toolName: 'git.status',
      data: { branch: 'main', clean: true },
    };

    render(<ToolOutputRenderer output={gitStatusOutput} />);

    // git.status does not have diff data shape, so falls back to JSON tree
    expect(screen.getByTestId('json-tree-viewer')).toBeDefined();
  });

  it('falls back to JsonTreeViewer for gates tools without gates array', async () => {
    const { ToolOutputRenderer } =
      await import('../src/components/tool-output/tool-output-renderer');

    const gatesInfoOutput: ToolOutput = {
      toolName: 'gates.info',
      data: { version: '1.0.0' },
    };

    render(<ToolOutputRenderer output={gatesInfoOutput} />);

    // gates.info does not have gates array, so falls back to JSON tree
    expect(screen.getByTestId('json-tree-viewer')).toBeDefined();
  });

  it('displays the tool name header', async () => {
    const { ToolOutputRenderer } =
      await import('../src/components/tool-output/tool-output-renderer');

    render(<ToolOutputRenderer output={UNKNOWN_TOOL_OUTPUT} />);

    expect(screen.getByTestId('tool-output-header')).toBeDefined();
    expect(screen.getByText('custom.analyze')).toBeDefined();
  });

  it('displays tool category badge', async () => {
    const { ToolOutputRenderer } =
      await import('../src/components/tool-output/tool-output-renderer');

    render(<ToolOutputRenderer output={GIT_DIFF_OUTPUT} />);

    const badge = screen.getByTestId('tool-category-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe('git');
  });
});
