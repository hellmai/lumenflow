import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as cliRunner from '../cli-runner.js';
import { resetRuntimeTaskToolCache, taskClaimTool } from '../tools/runtime-task-tools.js';
import * as kernel from '@lumenflow/kernel';
import { ErrorCodes } from '../tools-shared.js';
import { RuntimeTaskToolNames } from '../tools/runtime-task-constants.js';

vi.mock('@lumenflow/kernel', () => ({
  initializeKernelRuntime: vi.fn(),
}));

vi.mock('../cli-runner.js', () => ({
  runCliCommand: vi.fn(),
}));

describe('runtime task MCP tools', () => {
  const mockInitializeKernelRuntime = vi.mocked(kernel.initializeKernelRuntime);
  const mockRunCliCommand = vi.mocked(cliRunner.runCliCommand);

  beforeEach(() => {
    vi.clearAllMocks();
    resetRuntimeTaskToolCache();
  });

  it(`routes ${RuntimeTaskToolNames.TASK_CLAIM} through KernelRuntime without CLI shell-out`, async () => {
    const claimResult = {
      task_id: 'WU-1771',
      run: {
        run_id: 'run-WU-1771-1',
        task_id: 'WU-1771',
        status: 'executing',
      },
    };
    const claimTask = vi.fn().mockResolvedValue(claimResult);
    mockInitializeKernelRuntime.mockResolvedValue({ claimTask } as unknown as Awaited<
      ReturnType<typeof kernel.initializeKernelRuntime>
    >);

    const result = await taskClaimTool.execute(
      {
        task_id: 'WU-1771',
        by: 'tom@hellm.ai',
        session_id: 'session-1771',
      },
      { projectRoot: '/tmp/lumenflow-mcp-runtime' },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(claimResult);
    expect(mockInitializeKernelRuntime).toHaveBeenCalledWith({
      workspaceRoot: path.resolve('/tmp/lumenflow-mcp-runtime'),
    });
    expect(claimTask).toHaveBeenCalledWith({
      task_id: 'WU-1771',
      by: 'tom@hellm.ai',
      session_id: 'session-1771',
    });
    expect(mockRunCliCommand).not.toHaveBeenCalled();
  });

  it('validates input before runtime initialization', async () => {
    const result = await taskClaimTool.execute(
      {
        by: 'tom@hellm.ai',
        session_id: 'session-1771',
      },
      { projectRoot: '/tmp/lumenflow-mcp-runtime' },
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCodes.TASK_CLAIM_ERROR);
    expect(mockInitializeKernelRuntime).not.toHaveBeenCalled();
  });

  it('returns error when KernelRuntime initialization fails', async () => {
    mockInitializeKernelRuntime.mockRejectedValue(new Error('runtime init failed'));

    const result = await taskClaimTool.execute(
      {
        task_id: 'WU-1771',
        by: 'tom@hellm.ai',
        session_id: 'session-1771',
      },
      { projectRoot: '/tmp/lumenflow-mcp-runtime' },
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCodes.TASK_CLAIM_ERROR);
    expect(result.error?.message).toContain('runtime init failed');
    expect(mockRunCliCommand).not.toHaveBeenCalled();
  });

  it(`reuses initialized runtime for repeated ${RuntimeTaskToolNames.TASK_CLAIM} calls in the same workspace`, async () => {
    const claimTask = vi.fn().mockResolvedValue({
      task_id: 'WU-1771',
    });
    mockInitializeKernelRuntime.mockResolvedValue({ claimTask } as unknown as Awaited<
      ReturnType<typeof kernel.initializeKernelRuntime>
    >);

    await taskClaimTool.execute(
      {
        task_id: 'WU-1771',
        by: 'tom@hellm.ai',
        session_id: 'session-1771-a',
      },
      { projectRoot: '/tmp/lumenflow-mcp-runtime' },
    );
    await taskClaimTool.execute(
      {
        task_id: 'WU-1771',
        by: 'tom@hellm.ai',
        session_id: 'session-1771-b',
      },
      { projectRoot: '/tmp/lumenflow-mcp-runtime' },
    );

    expect(mockInitializeKernelRuntime).toHaveBeenCalledTimes(1);
    expect(claimTask).toHaveBeenCalledTimes(2);
  });
});
