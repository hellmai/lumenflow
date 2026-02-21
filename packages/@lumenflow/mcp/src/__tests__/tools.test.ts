// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @file tools.test.ts
 * @description Tests for MCP tool implementations
 *
 * WU-1412: MCP tools available: context_get, wu_list, wu_status, wu_create, wu_claim, wu_done, gates_run
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cloudConnectTool,
  contextGetTool,
  lumenflowOnboardTool,
  onboardTool,
  registeredTools,
  taskBlockTool,
  taskClaimTool,
  taskCompleteTool,
  taskCreateTool,
  taskInspectTool,
  taskToolExecuteTool,
  taskUnblockTool,
  wuListTool,
  wuStatusTool,
  wuCreateTool,
  wuClaimTool,
  wuDoneTool,
  gatesRunTool,
  workspaceInitTool,
} from '../tools.js';
import {
  RuntimeTaskToolDescriptions,
  RuntimeTaskToolNames,
} from '../tools/runtime-task-constants.js';
import { CliCommands } from '../mcp-constants.js';
import * as cliRunner from '../cli-runner.js';
import * as core from '@lumenflow/core';
import * as toolsShared from '../tools-shared.js';

// Mock cli-runner for write operations
vi.mock('../cli-runner.js', () => ({
  runCliCommand: vi.fn(),
}));

// Mock @lumenflow/core for read operations
vi.mock('@lumenflow/core', async () => {
  const actual = await vi.importActual('@lumenflow/core');
  return {
    ...actual,
    computeWuContext: vi.fn(),
    parseAllWUYamls: vi.fn(),
    parseWUYaml: vi.fn(),
    generateBacklogMarkdown: vi.fn(),
  };
});

describe('MCP tools', () => {
  const CLI_FLAGS = {
    ENDPOINT: '--endpoint',
    ORG_ID: '--org-id',
    PROJECT_ID: '--project-id',
    TOKEN_ENV: '--token-env',
    POLICY_MODE: '--policy-mode',
    SYNC_INTERVAL: '--sync-interval',
    OUTPUT: '--output',
    FORCE: '--force',
    YES: '--yes',
    DOMAIN: '--domain',
    PROJECT_NAME: '--project-name',
    SKIP_PACK_INSTALL: '--skip-pack-install',
    SKIP_DASHBOARD: '--skip-dashboard',
  } as const;
  const CLOUD_CONNECT_INPUT = {
    endpoint: 'https://control-plane.example.com',
    org_id: 'org-example',
    project_id: 'project-example',
    token_env: 'LUMENFLOW_CONTROL_PLANE_TOKEN',
    policy_mode: 'tighten-only',
    sync_interval: 60,
    output: '/tmp/workspace',
    force: true,
  } as const;
  const ONBOARD_INPUT = {
    yes: true,
    domain: 'software-delivery',
    project_name: 'demo-app',
    output: '/tmp/workspace',
    force: true,
    skip_pack_install: true,
    skip_dashboard: true,
  } as const;
  const WORKSPACE_INIT_INPUT = {
    yes: true,
    output: '/tmp/workspace',
    force: true,
  } as const;

  const mockRunCliCommand = vi.mocked(cliRunner.runCliCommand);
  const mockComputeWuContext = vi.mocked(core.computeWuContext);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // WU-1803: context_get and wu_list now route through executeViaPack
  describe('context_get', () => {
    it('should return current WU context via runtime pack execution', async () => {
      const mockContext = {
        location: { type: 'worktree', cwd: '/path/to/worktree' },
        git: { branch: 'lane/framework-cli/wu-1412', isDirty: false },
        wu: { id: 'WU-1412', status: 'in_progress' },
      };
      const spy = vi.spyOn(toolsShared, 'executeViaPack').mockResolvedValue({
        success: true,
        data: mockContext,
      });

      const result = await contextGetTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject(mockContext);
      expect(spy).toHaveBeenCalledWith(
        'context:get',
        expect.anything(),
        expect.objectContaining({
          fallback: expect.objectContaining({ command: 'context:get' }),
        }),
      );
      spy.mockRestore();
    });

    it('should handle errors gracefully', async () => {
      const spy = vi.spyOn(toolsShared, 'executeViaPack').mockResolvedValue({
        success: false,
        error: { message: 'Git not found', code: 'CONTEXT_ERROR' },
      });

      const result = await contextGetTool.execute({});

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Git not found');
      spy.mockRestore();
    });
  });

  describe('wu_list', () => {
    it('should list WUs via runtime pack execution', async () => {
      const mockWus = [
        { id: 'WU-1412', title: 'MCP server', status: 'in_progress' },
        { id: 'WU-1413', title: 'MCP init', status: 'ready' },
      ];
      const spy = vi.spyOn(toolsShared, 'executeViaPack').mockResolvedValue({
        success: true,
        data: mockWus,
      });

      const result = await wuListTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockWus);
      spy.mockRestore();
    });

    it('should filter by status when provided', async () => {
      const mockWus = [{ id: 'WU-1412', title: 'MCP server', status: 'in_progress' }];
      const spy = vi.spyOn(toolsShared, 'executeViaPack').mockResolvedValue({
        success: true,
        data: mockWus,
      });

      const result = await wuListTool.execute({ status: 'in_progress' });

      expect(result.success).toBe(true);
      expect((result.data as Array<{ status: string }>).length).toBe(1);
      spy.mockRestore();
    });
  });

  describe('bootstrap/cloud parity tools', () => {
    it('should validate required fields for cloud_connect', async () => {
      const missingEndpointResult = await cloudConnectTool.execute({
        org_id: CLOUD_CONNECT_INPUT.org_id,
        project_id: CLOUD_CONNECT_INPUT.project_id,
      });
      expect(missingEndpointResult.success).toBe(false);
      expect(missingEndpointResult.error?.message).toContain('endpoint');

      const missingOrgResult = await cloudConnectTool.execute({
        endpoint: CLOUD_CONNECT_INPUT.endpoint,
        project_id: CLOUD_CONNECT_INPUT.project_id,
      });
      expect(missingOrgResult.success).toBe(false);
      expect(missingOrgResult.error?.message).toContain('org_id');

      const missingProjectResult = await cloudConnectTool.execute({
        endpoint: CLOUD_CONNECT_INPUT.endpoint,
        org_id: CLOUD_CONNECT_INPUT.org_id,
      });
      expect(missingProjectResult.success).toBe(false);
      expect(missingProjectResult.error?.message).toContain('project_id');
    });

    it('should route cloud_connect through executeViaPack with CLI-compatible flags', async () => {
      const spy = vi.spyOn(toolsShared, 'executeViaPack').mockResolvedValue({
        success: true,
        data: { message: 'cloud connected' },
      });

      const result = await cloudConnectTool.execute({ ...CLOUD_CONNECT_INPUT });

      expect(result.success).toBe(true);
      expect(spy).toHaveBeenCalledWith(
        CliCommands.CLOUD_CONNECT,
        expect.objectContaining({
          endpoint: CLOUD_CONNECT_INPUT.endpoint,
          org_id: CLOUD_CONNECT_INPUT.org_id,
          project_id: CLOUD_CONNECT_INPUT.project_id,
        }),
        expect.objectContaining({
          fallback: expect.objectContaining({
            command: CliCommands.CLOUD_CONNECT,
            args: expect.arrayContaining([
              CLI_FLAGS.ENDPOINT,
              CLOUD_CONNECT_INPUT.endpoint,
              CLI_FLAGS.ORG_ID,
              CLOUD_CONNECT_INPUT.org_id,
              CLI_FLAGS.PROJECT_ID,
              CLOUD_CONNECT_INPUT.project_id,
              CLI_FLAGS.TOKEN_ENV,
              CLOUD_CONNECT_INPUT.token_env,
              CLI_FLAGS.POLICY_MODE,
              CLOUD_CONNECT_INPUT.policy_mode,
              CLI_FLAGS.SYNC_INTERVAL,
              String(CLOUD_CONNECT_INPUT.sync_interval),
              CLI_FLAGS.OUTPUT,
              CLOUD_CONNECT_INPUT.output,
              CLI_FLAGS.FORCE,
            ]),
          }),
        }),
      );
      expect(mockRunCliCommand).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should route onboard through executeViaPack with CLI-compatible flags', async () => {
      const onboardSpy = vi.spyOn(toolsShared, 'executeViaPack').mockResolvedValue({
        success: true,
        data: { message: 'onboard complete' },
      });

      const onboardResult = await onboardTool.execute({ ...ONBOARD_INPUT });

      expect(onboardResult.success).toBe(true);
      expect(onboardSpy).toHaveBeenCalledWith(
        CliCommands.ONBOARD,
        expect.objectContaining({
          domain: ONBOARD_INPUT.domain,
          project_name: ONBOARD_INPUT.project_name,
        }),
        expect.objectContaining({
          fallback: expect.objectContaining({
            command: CliCommands.ONBOARD,
            args: expect.arrayContaining([
              CLI_FLAGS.YES,
              CLI_FLAGS.DOMAIN,
              ONBOARD_INPUT.domain,
              CLI_FLAGS.PROJECT_NAME,
              ONBOARD_INPUT.project_name,
              CLI_FLAGS.OUTPUT,
              ONBOARD_INPUT.output,
              CLI_FLAGS.FORCE,
              CLI_FLAGS.SKIP_PACK_INSTALL,
              CLI_FLAGS.SKIP_DASHBOARD,
            ]),
          }),
        }),
      );
      expect(mockRunCliCommand).not.toHaveBeenCalled();
      onboardSpy.mockRestore();
    });

    it('should route lumenflow_onboard through executeViaPack alias command', async () => {
      const aliasSpy = vi.spyOn(toolsShared, 'executeViaPack').mockResolvedValue({
        success: true,
        data: { message: 'alias onboard complete' },
      });

      const result = await lumenflowOnboardTool.execute({ ...ONBOARD_INPUT });

      expect(result.success).toBe(true);
      expect(aliasSpy).toHaveBeenCalledWith(
        CliCommands.LUMENFLOW_ONBOARD,
        expect.objectContaining({
          domain: ONBOARD_INPUT.domain,
        }),
        expect.objectContaining({
          fallback: expect.objectContaining({
            command: CliCommands.LUMENFLOW_ONBOARD,
          }),
        }),
      );
      expect(mockRunCliCommand).not.toHaveBeenCalled();
      aliasSpy.mockRestore();
    });

    it('should route workspace_init through executeViaPack with CLI-compatible flags', async () => {
      const spy = vi.spyOn(toolsShared, 'executeViaPack').mockResolvedValue({
        success: true,
        data: { message: 'workspace initialized' },
      });

      const result = await workspaceInitTool.execute({ ...WORKSPACE_INIT_INPUT });

      expect(result.success).toBe(true);
      expect(spy).toHaveBeenCalledWith(
        CliCommands.WORKSPACE_INIT,
        expect.objectContaining({
          yes: WORKSPACE_INIT_INPUT.yes,
          output: WORKSPACE_INIT_INPUT.output,
          force: WORKSPACE_INIT_INPUT.force,
        }),
        expect.objectContaining({
          fallback: expect.objectContaining({
            command: CliCommands.WORKSPACE_INIT,
            args: expect.arrayContaining([
              CLI_FLAGS.YES,
              CLI_FLAGS.OUTPUT,
              WORKSPACE_INIT_INPUT.output,
              CLI_FLAGS.FORCE,
            ]),
          }),
        }),
      );
      expect(mockRunCliCommand).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should include bootstrap/cloud parity tools in the production MCP registry', () => {
      const registryToolNames = registeredTools.map((tool) => tool.name);
      expect(registryToolNames).toContain('cloud_connect');
      expect(registryToolNames).toContain('onboard');
      expect(registryToolNames).toContain('lumenflow_onboard');
      expect(registryToolNames).toContain('workspace_init');
    });
  });

  describe('wu_status', () => {
    it('should return WU status via executeViaPack', async () => {
      const mockWu = {
        id: 'WU-1412',
        title: 'MCP server',
        status: 'in_progress',
        lane: 'Framework: CLI',
      };
      const spy = vi.spyOn(toolsShared, 'executeViaPack').mockResolvedValue({
        success: true,
        data: mockWu,
      });

      const result = await wuStatusTool.execute({ id: 'WU-1412' });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ id: 'WU-1412' });
      expect(spy).toHaveBeenCalledWith(
        'wu:status',
        expect.objectContaining({ id: 'WU-1412' }),
        expect.objectContaining({
          fallback: expect.objectContaining({
            command: 'wu:status',
            args: expect.arrayContaining(['--id', 'WU-1412', '--json']),
          }),
        }),
      );
      spy.mockRestore();
    });

    it('should require id parameter', async () => {
      const result = await wuStatusTool.execute({});

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('id');
    });
  });

  describe('wu_create', () => {
    it('should create WU via executeViaPack', async () => {
      const spy = vi.spyOn(toolsShared, 'executeViaPack').mockResolvedValue({
        success: true,
        data: { message: 'Created WU-1414' },
      });

      const result = await wuCreateTool.execute({
        lane: 'Framework: CLI',
        title: 'New feature',
        description: 'Context: ... Problem: ... Solution: ...',
        acceptance: ['Criterion 1'],
        code_paths: ['packages/@lumenflow/mcp/**'],
        exposure: 'backend-only',
      });

      expect(result.success).toBe(true);
      expect(spy).toHaveBeenCalledWith(
        'wu:create',
        expect.objectContaining({
          lane: 'Framework: CLI',
          title: 'New feature',
        }),
        expect.objectContaining({
          fallback: expect.objectContaining({
            command: 'wu:create',
            args: expect.arrayContaining(['--lane', 'Framework: CLI', '--title', 'New feature']),
          }),
        }),
      );
      expect(mockRunCliCommand).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should require lane parameter', async () => {
      const result = await wuCreateTool.execute({
        title: 'Missing lane',
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('lane');
    });
  });

  describe('wu_claim', () => {
    it('should claim WU via executeViaPack', async () => {
      const spy = vi.spyOn(toolsShared, 'executeViaPack').mockResolvedValue({
        success: true,
        data: { message: 'Worktree created' },
      });

      const result = await wuClaimTool.execute({ id: 'WU-1412', lane: 'Framework: CLI' });

      expect(result.success).toBe(true);
      expect(spy).toHaveBeenCalledWith(
        'wu:claim',
        expect.objectContaining({ id: 'WU-1412', lane: 'Framework: CLI' }),
        expect.objectContaining({
          fallback: expect.objectContaining({
            command: 'wu:claim',
            args: expect.arrayContaining(['--id', 'WU-1412', '--lane', 'Framework: CLI']),
          }),
        }),
      );
      expect(mockRunCliCommand).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should require id and lane parameters', async () => {
      const result = await wuClaimTool.execute({ id: 'WU-1412' });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('lane');
    });
  });

  describe('runtime tracer-bullet registry wiring', () => {
    it(`should export ${RuntimeTaskToolNames.TASK_CLAIM} runtime tool definition`, () => {
      expect(taskClaimTool.name).toBe(RuntimeTaskToolNames.TASK_CLAIM);
      expect(taskClaimTool.description).toBe(RuntimeTaskToolDescriptions.TASK_CLAIM);
    });

    it(`should export ${RuntimeTaskToolNames.TASK_CREATE} runtime tool definition`, () => {
      expect(taskCreateTool.name).toBe(RuntimeTaskToolNames.TASK_CREATE);
      expect(taskCreateTool.description).toBe(RuntimeTaskToolDescriptions.TASK_CREATE);
    });

    it(`should export ${RuntimeTaskToolNames.TASK_COMPLETE} runtime tool definition`, () => {
      expect(taskCompleteTool.name).toBe(RuntimeTaskToolNames.TASK_COMPLETE);
      expect(taskCompleteTool.description).toBe(RuntimeTaskToolDescriptions.TASK_COMPLETE);
    });

    it(`should export ${RuntimeTaskToolNames.TASK_BLOCK} runtime tool definition`, () => {
      expect(taskBlockTool.name).toBe(RuntimeTaskToolNames.TASK_BLOCK);
      expect(taskBlockTool.description).toBe(RuntimeTaskToolDescriptions.TASK_BLOCK);
    });

    it(`should export ${RuntimeTaskToolNames.TASK_UNBLOCK} runtime tool definition`, () => {
      expect(taskUnblockTool.name).toBe(RuntimeTaskToolNames.TASK_UNBLOCK);
      expect(taskUnblockTool.description).toBe(RuntimeTaskToolDescriptions.TASK_UNBLOCK);
    });

    it(`should export ${RuntimeTaskToolNames.TASK_INSPECT} runtime tool definition`, () => {
      expect(taskInspectTool.name).toBe(RuntimeTaskToolNames.TASK_INSPECT);
      expect(taskInspectTool.description).toBe(RuntimeTaskToolDescriptions.TASK_INSPECT);
    });

    it(`should export ${RuntimeTaskToolNames.TOOL_EXECUTE} runtime tool definition`, () => {
      expect(taskToolExecuteTool.name).toBe(RuntimeTaskToolNames.TOOL_EXECUTE);
      expect(taskToolExecuteTool.description).toBe(RuntimeTaskToolDescriptions.TOOL_EXECUTE);
    });

    it(`should include ${RuntimeTaskToolNames.TASK_CLAIM} in the production MCP registry aggregate`, () => {
      expect(registeredTools.some((tool) => tool.name === RuntimeTaskToolNames.TASK_CLAIM)).toBe(
        true,
      );
    });

    it(`should include ${RuntimeTaskToolNames.TASK_CREATE} in the production MCP registry aggregate`, () => {
      expect(registeredTools.some((tool) => tool.name === RuntimeTaskToolNames.TASK_CREATE)).toBe(
        true,
      );
    });

    it(`should include ${RuntimeTaskToolNames.TASK_COMPLETE} in the production MCP registry aggregate`, () => {
      expect(registeredTools.some((tool) => tool.name === RuntimeTaskToolNames.TASK_COMPLETE)).toBe(
        true,
      );
    });

    it(`should include ${RuntimeTaskToolNames.TASK_BLOCK} in the production MCP registry aggregate`, () => {
      expect(registeredTools.some((tool) => tool.name === RuntimeTaskToolNames.TASK_BLOCK)).toBe(
        true,
      );
    });

    it(`should include ${RuntimeTaskToolNames.TASK_UNBLOCK} in the production MCP registry aggregate`, () => {
      expect(registeredTools.some((tool) => tool.name === RuntimeTaskToolNames.TASK_UNBLOCK)).toBe(
        true,
      );
    });

    it(`should include ${RuntimeTaskToolNames.TASK_INSPECT} in the production MCP registry aggregate`, () => {
      expect(registeredTools.some((tool) => tool.name === RuntimeTaskToolNames.TASK_INSPECT)).toBe(
        true,
      );
    });

    it(`should include ${RuntimeTaskToolNames.TOOL_EXECUTE} in the production MCP registry aggregate`, () => {
      expect(registeredTools.some((tool) => tool.name === RuntimeTaskToolNames.TOOL_EXECUTE)).toBe(
        true,
      );
    });
  });

  describe('wu_done', () => {
    it('should complete WU via executeViaPack', async () => {
      const spy = vi.spyOn(toolsShared, 'executeViaPack').mockResolvedValue({
        success: true,
        data: { message: 'WU completed' },
      });

      const result = await wuDoneTool.execute({ id: 'WU-1412' });

      expect(result.success).toBe(true);
      expect(spy).toHaveBeenCalledWith(
        'wu:done',
        expect.objectContaining({ id: 'WU-1412' }),
        expect.objectContaining({
          fallback: expect.objectContaining({
            command: 'wu:done',
            args: expect.arrayContaining(['--id', 'WU-1412']),
          }),
        }),
      );
      expect(mockRunCliCommand).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should fail fast if not on main checkout', async () => {
      const mockContext = {
        location: { type: 'worktree', cwd: '/path/to/worktree' },
        git: { branch: 'lane/framework-cli/wu-1412' },
      };
      mockComputeWuContext.mockResolvedValue(
        mockContext as unknown as Awaited<ReturnType<typeof core.computeWuContext>>,
      );

      const result = await wuDoneTool.execute({ id: 'WU-1412' });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('main checkout');
      expect(mockRunCliCommand).not.toHaveBeenCalled();
    });

    it('should require id parameter', async () => {
      const result = await wuDoneTool.execute({});

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('id');
    });
  });

  describe('gates_run', () => {
    it('should run gates via executeViaPack', async () => {
      const spy = vi.spyOn(toolsShared, 'executeViaPack').mockResolvedValue({
        success: true,
        data: { message: 'All gates passed' },
      });

      const result = await gatesRunTool.execute({});

      expect(result.success).toBe(true);
      expect(spy).toHaveBeenCalledWith(
        'gates',
        expect.objectContaining({}),
        expect.objectContaining({
          fallback: expect.objectContaining({
            command: 'gates',
          }),
        }),
      );
      expect(mockRunCliCommand).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should support --docs-only flag', async () => {
      const spy = vi.spyOn(toolsShared, 'executeViaPack').mockResolvedValue({
        success: true,
        data: { message: 'Docs gates passed' },
      });

      const result = await gatesRunTool.execute({ docs_only: true });

      expect(result.success).toBe(true);
      expect(spy).toHaveBeenCalledWith(
        'gates',
        expect.objectContaining({ docs_only: true }),
        expect.objectContaining({
          fallback: expect.objectContaining({
            command: 'gates',
            args: expect.arrayContaining(['--docs-only']),
          }),
        }),
      );
      expect(mockRunCliCommand).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should report gate failures', async () => {
      const spy = vi.spyOn(toolsShared, 'executeViaPack').mockResolvedValue({
        success: false,
        error: {
          message: 'lint failed',
        },
      });

      const result = await gatesRunTool.execute({});

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('lint failed');
      expect(mockRunCliCommand).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
