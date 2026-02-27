// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';
import type { SandboxBindMount, SandboxProfile } from './profile.js';

export interface SandboxInvocation {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface BuildBwrapInvocationInput {
  profile: SandboxProfile;
  command: string[];
  sandboxBinary?: string;
}

const SYSTEM_READONLY_ALLOWLIST = ['/usr', '/bin', '/sbin', '/lib', '/lib64', '/etc'] as const;

function assertCommand(command: string[]): void {
  if (command.length === 0) {
    throw new Error('Sandbox command is required');
  }
}

function dedupeMounts(mounts: SandboxBindMount[]): SandboxBindMount[] {
  const unique = new Map<string, SandboxBindMount>();
  for (const mount of mounts) {
    const key = `${mount.source}=>${mount.target}`;
    if (!unique.has(key)) {
      unique.set(key, mount);
    }
  }
  return [...unique.values()];
}

function normalizePrefix(prefix: string): string {
  const resolved = path.resolve(prefix);
  if (resolved === path.sep) {
    return resolved;
  }
  return resolved.replace(/[/\\]+$/, '');
}

function isWithinPrefix(candidate: string, prefix: string): boolean {
  const normalizedCandidate = normalizePrefix(candidate);
  const normalizedPrefix = normalizePrefix(prefix);
  if (normalizedPrefix === path.sep) {
    return true;
  }
  return (
    normalizedCandidate === normalizedPrefix ||
    normalizedCandidate.startsWith(`${normalizedPrefix}${path.sep}`)
  );
}

function collectCommandMountPrefixes(profile: SandboxProfile): string[] {
  const prefixes = [
    ...profile.readonly_bind_mounts.map((mount) => mount.target),
    ...profile.writable_bind_mounts.map((mount) => mount.target),
  ];
  return [...new Set(prefixes.map(normalizePrefix))];
}

function collectCommandReadonlyMounts(
  profile: SandboxProfile,
  command: string[],
): SandboxBindMount[] {
  const mountPrefixes = collectCommandMountPrefixes(profile);
  const mounts: SandboxBindMount[] = [];

  for (const segment of command) {
    if (!path.isAbsolute(segment)) {
      continue;
    }

    const absolute = path.resolve(segment);
    const parent = path.dirname(absolute);
    const grandparent = path.dirname(parent);

    if (parent !== '/' && mountPrefixes.some((prefix) => isWithinPrefix(parent, prefix))) {
      mounts.push({ source: parent, target: parent });
    }
    if (
      grandparent !== '/' &&
      mountPrefixes.some((prefix) => isWithinPrefix(grandparent, prefix))
    ) {
      mounts.push({ source: grandparent, target: grandparent });
    }
  }

  return dedupeMounts(mounts);
}

function collectReadonlyAllowlistMounts(
  profile: SandboxProfile,
  command: string[],
): SandboxBindMount[] {
  const writableTargets = new Set(profile.writable_bind_mounts.map((mount) => mount.target));
  const readonlyMounts = [
    ...SYSTEM_READONLY_ALLOWLIST.map((mountPath) => ({
      source: mountPath,
      target: mountPath,
    })),
    ...collectCommandReadonlyMounts(profile, command),
    ...profile.readonly_bind_mounts,
  ];

  return dedupeMounts(readonlyMounts).filter((mount) => !writableTargets.has(mount.target));
}

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function parseHostPort(entry: string): { host: string; port: string | null } {
  // CIDR entries (e.g., "10.0.0.0/24") have no port
  if (entry.includes('/')) {
    return { host: entry, port: null };
  }
  // host:port entries (e.g., "registry.npmjs.org:443")
  const lastColon = entry.lastIndexOf(':');
  if (lastColon > 0) {
    return {
      host: entry.slice(0, lastColon),
      port: entry.slice(lastColon + 1),
    };
  }
  return { host: entry, port: null };
}

export function buildIptablesAllowlistScript(allowlist: string[], command: string[]): string {
  const lines: string[] = [];

  // Allow loopback traffic unconditionally
  lines.push('iptables -A OUTPUT -o lo -j ACCEPT');

  // Allow established/related connections (for return traffic)
  lines.push('iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT');

  // Add ACCEPT rules for each allowlisted entry
  for (const entry of allowlist) {
    const { host, port } = parseHostPort(entry);
    if (port) {
      lines.push(`iptables -A OUTPUT -d ${host} -p tcp --dport ${port} -j ACCEPT`);
    } else {
      lines.push(`iptables -A OUTPUT -d ${host} -j ACCEPT`);
    }
  }

  // Default REJECT policy for OUTPUT (produces ECONNREFUSED)
  lines.push('iptables -A OUTPUT -j REJECT --reject-with icmp-port-unreachable');

  // Exec the original command
  const escapedCommand = command.map(escapeShellArg).join(' ');
  lines.push(`exec ${escapedCommand}`);

  return lines.join(' && ');
}

export function buildBwrapInvocation(input: BuildBwrapInvocationInput): SandboxInvocation {
  assertCommand(input.command);

  const args: string[] = ['--die-with-parent', '--new-session', '--tmpfs', '/'];

  for (const mount of collectReadonlyAllowlistMounts(input.profile, input.command)) {
    args.push('--ro-bind', mount.source, mount.target);
  }

  for (const mount of input.profile.writable_bind_mounts) {
    args.push('--bind', mount.source, mount.target);
  }

  for (const overlay of input.profile.deny_overlays) {
    if (overlay.kind === 'file') {
      args.push('--bind', '/dev/null', overlay.path);
    } else {
      args.push('--tmpfs', overlay.path);
    }
  }

  if (input.profile.network_posture === 'off') {
    args.push('--unshare-net');
  } else if (input.profile.network_posture === 'allowlist') {
    args.push('--unshare-net');
  }

  for (const [key, value] of Object.entries(input.profile.env)) {
    args.push('--setenv', key, value);
  }

  args.push('--proc', '/proc', '--dev', '/dev');

  if (input.profile.network_posture === 'allowlist' && input.profile.network_allowlist.length > 0) {
    const iptablesScript = buildIptablesAllowlistScript(
      input.profile.network_allowlist,
      input.command,
    );
    args.push('--', 'sh', '-c', iptablesScript);
  } else {
    args.push('--', ...input.command);
  }

  return {
    command: input.sandboxBinary || 'bwrap',
    args,
    env: input.profile.env,
  };
}
