// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: Apache-2.0

import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ToolScope } from '../kernel.schemas.js';
import { buildSandboxProfileFromScopes, type SandboxNetworkPosture } from '../sandbox/profile.js';

describe('SandboxProfile with allowlist network posture', () => {
  const workspaceRoot = resolve('repo', 'root');
  const homeDir = resolve('home', 'agent');

  it('accepts allowlist as a valid SandboxNetworkPosture value', () => {
    // AC1: SandboxNetworkPosture includes allowlist variant
    const posture: SandboxNetworkPosture = 'allowlist';
    expect(posture).toBe('allowlist');
  });

  it('populates network_posture as allowlist when enforced scopes contain allowlist entries', () => {
    // AC3: SandboxProfile populated with allowlist from scope intersection
    const scopeEnforced: ToolScope[] = [
      {
        type: 'network',
        posture: 'allowlist',
        allowlist_entries: ['registry.npmjs.org:443', 'api.github.com:443'],
      },
    ];

    const profile = buildSandboxProfileFromScopes(scopeEnforced, {
      workspaceRoot,
      homeDir,
    });

    expect(profile.network_posture).toBe('allowlist');
    expect(profile.network_allowlist).toEqual(['api.github.com:443', 'registry.npmjs.org:443']);
  });

  it('populates empty network_allowlist when posture is off', () => {
    const scopeEnforced: ToolScope[] = [{ type: 'network', posture: 'off' }];

    const profile = buildSandboxProfileFromScopes(scopeEnforced, {
      workspaceRoot,
      homeDir,
    });

    expect(profile.network_posture).toBe('off');
    expect(profile.network_allowlist).toEqual([]);
  });

  it('populates empty network_allowlist when posture is full', () => {
    const scopeEnforced: ToolScope[] = [{ type: 'network', posture: 'full' }];

    const profile = buildSandboxProfileFromScopes(scopeEnforced, {
      workspaceRoot,
      homeDir,
    });

    expect(profile.network_posture).toBe('full');
    expect(profile.network_allowlist).toEqual([]);
  });

  it('merges allowlist entries from multiple network scopes', () => {
    const scopeEnforced: ToolScope[] = [
      {
        type: 'network',
        posture: 'allowlist',
        allowlist_entries: ['registry.npmjs.org:443'],
      },
      {
        type: 'network',
        posture: 'allowlist',
        allowlist_entries: ['api.github.com:443'],
      },
    ];

    const profile = buildSandboxProfileFromScopes(scopeEnforced, {
      workspaceRoot,
      homeDir,
    });

    expect(profile.network_posture).toBe('allowlist');
    expect(profile.network_allowlist).toContain('registry.npmjs.org:443');
    expect(profile.network_allowlist).toContain('api.github.com:443');
  });

  it('full posture wins over allowlist when both present in enforced scopes', () => {
    const scopeEnforced: ToolScope[] = [
      {
        type: 'network',
        posture: 'allowlist',
        allowlist_entries: ['registry.npmjs.org:443'],
      },
      { type: 'network', posture: 'full' },
    ];

    const profile = buildSandboxProfileFromScopes(scopeEnforced, {
      workspaceRoot,
      homeDir,
    });

    expect(profile.network_posture).toBe('full');
    expect(profile.network_allowlist).toEqual([]);
  });
});
