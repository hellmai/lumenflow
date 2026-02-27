// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: Apache-2.0

import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ToolScope } from '../kernel.schemas.js';
import {
  buildBwrapInvocation,
  type BuildBwrapInvocationInput,
} from '../sandbox/bwrap-invocation.js';
import { buildSandboxProfileFromScopes, type SandboxProfile } from '../sandbox/profile.js';
import {
  SandboxSubprocessDispatcher,
  type SubprocessTransport,
} from '../sandbox/subprocess-dispatcher.js';

function makeAllowlistProfile(allowlist: string[]): SandboxProfile {
  return {
    readonly_bind_mounts: [],
    writable_bind_mounts: [],
    network_posture: 'allowlist',
    network_allowlist: allowlist,
    deny_overlays: [],
    env: {},
  };
}

function collectArgs(args: string[]): string {
  return args.join(' ');
}

describe('buildBwrapInvocation with network allowlist', () => {
  it('emits --unshare-net when network_posture is allowlist', () => {
    const profile = makeAllowlistProfile(['registry.npmjs.org:443']);
    const invocation = buildBwrapInvocation({
      profile,
      command: ['node', '/tmp/worker.js'],
    });

    expect(invocation.args).toContain('--unshare-net');
  });

  it('emits iptables OUTPUT ACCEPT rules for each allowlisted host', () => {
    const profile = makeAllowlistProfile(['registry.npmjs.org:443', 'api.github.com:443']);
    const invocation = buildBwrapInvocation({
      profile,
      command: ['node', '/tmp/worker.js'],
    });

    // The command should be wrapped in a shell that sets up iptables rules
    const allArgs = collectArgs(invocation.args);
    expect(allArgs).toContain('iptables');
    expect(allArgs).toContain('registry.npmjs.org');
    expect(allArgs).toContain('api.github.com');
    expect(allArgs).toContain('443');
    expect(allArgs).toContain('OUTPUT');
    expect(allArgs).toContain('ACCEPT');
  });

  it('emits iptables default REJECT rule so blocked hosts get ECONNREFUSED', () => {
    const profile = makeAllowlistProfile(['registry.npmjs.org:443']);
    const invocation = buildBwrapInvocation({
      profile,
      command: ['node', '/tmp/worker.js'],
    });

    const allArgs = collectArgs(invocation.args);
    // REJECT with --reject-with tcp-reset produces ECONNREFUSED
    expect(allArgs).toContain('REJECT');
  });

  it('wraps original command in shell exec after iptables setup', () => {
    const profile = makeAllowlistProfile(['10.0.0.0/24']);
    const invocation = buildBwrapInvocation({
      profile,
      command: ['node', '/tmp/worker.js'],
    });

    const allArgs = collectArgs(invocation.args);
    // Original command should be exec'd after iptables setup
    expect(allArgs).toContain('exec');
    expect(allArgs).toContain('node');
    expect(allArgs).toContain('/tmp/worker.js');
  });

  it('handles CIDR notation in allowlist entries', () => {
    const profile = makeAllowlistProfile(['10.0.0.0/24', '192.168.1.0/16']);
    const invocation = buildBwrapInvocation({
      profile,
      command: ['echo', 'test'],
    });

    const allArgs = collectArgs(invocation.args);
    expect(allArgs).toContain('10.0.0.0/24');
    expect(allArgs).toContain('192.168.1.0/16');
  });

  it('allows loopback traffic in iptables rules', () => {
    const profile = makeAllowlistProfile(['registry.npmjs.org:443']);
    const invocation = buildBwrapInvocation({
      profile,
      command: ['node', '/tmp/worker.js'],
    });

    const allArgs = collectArgs(invocation.args);
    // Loopback should always be allowed
    expect(allArgs).toContain('lo');
    expect(allArgs).toContain('ACCEPT');
  });

  it('does not emit iptables rules when posture is off', () => {
    const profile: SandboxProfile = {
      readonly_bind_mounts: [],
      writable_bind_mounts: [],
      network_posture: 'off',
      network_allowlist: [],
      deny_overlays: [],
      env: {},
    };
    const invocation = buildBwrapInvocation({
      profile,
      command: ['node', '/tmp/worker.js'],
    });

    const allArgs = collectArgs(invocation.args);
    expect(invocation.args).toContain('--unshare-net');
    expect(allArgs).not.toContain('iptables');
  });

  it('does not emit iptables rules when posture is full', () => {
    const profile: SandboxProfile = {
      readonly_bind_mounts: [],
      writable_bind_mounts: [],
      network_posture: 'full',
      network_allowlist: [],
      deny_overlays: [],
      env: {},
    };
    const invocation = buildBwrapInvocation({
      profile,
      command: ['node', '/tmp/worker.js'],
    });

    const allArgs = collectArgs(invocation.args);
    expect(invocation.args).not.toContain('--unshare-net');
    expect(allArgs).not.toContain('iptables');
  });
});

describe('SandboxSubprocessDispatcher threads allowlist', () => {
  it('passes allowlist from scopes through to bwrap invocation', async () => {
    let capturedArgs: string[] = [];
    const transport: SubprocessTransport = {
      async execute(request) {
        capturedArgs = request.args;
        return {
          code: 0,
          stdout: JSON.stringify({
            output: { success: true, data: {} },
          }),
          stderr: '',
        };
      },
    };

    const dispatcher = new SandboxSubprocessDispatcher({
      transport,
      commandExists: () => true,
      workspaceRoot: '/tmp/workspace',
      homeDir: '/tmp/home',
    });

    await dispatcher.dispatch({
      capability: {
        name: 'net:fetch',
        domain: 'network',
        version: '1.0.0',
        input_schema: {} as never,
        output_schema: {} as never,
        permission: 'admin',
        required_scopes: [],
        handler: {
          kind: 'subprocess',
          entry: '/tmp/adapter.mjs',
        },
        description: 'Fetch URL',
      },
      input: { url: 'https://registry.npmjs.org' },
      context: {
        run_id: 'run-2252',
        task_id: 'WU-2252',
        session_id: 'session-2252',
        allowed_scopes: [
          {
            type: 'network',
            posture: 'allowlist',
            allowlist_entries: ['registry.npmjs.org:443'],
          },
        ],
        metadata: {
          workspace_allowed_scopes: [],
          lane_allowed_scopes: [],
          task_declared_scopes: [],
          workspace_config_hash: 'a'.repeat(64),
          runtime_version: '3.6.6',
        },
      },
      scopeEnforced: [
        {
          type: 'network',
          posture: 'allowlist',
          allowlist_entries: ['registry.npmjs.org:443'],
        },
      ],
    });

    const allArgs = collectArgs(capturedArgs);
    expect(allArgs).toContain('iptables');
    expect(allArgs).toContain('registry.npmjs.org');
    expect(allArgs).toContain('--unshare-net');
  });
});
