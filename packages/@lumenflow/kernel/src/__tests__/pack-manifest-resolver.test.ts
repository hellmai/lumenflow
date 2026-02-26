// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: Apache-2.0

/**
 * @file pack-manifest-resolver.test.ts
 * WU-2191: Tests for shared pack manifest resolution
 *
 * TDD RED phase: These tests define the resolver behavior before implementation.
 * The resolver must handle local, registry, and git pack source types
 * and return manifest file paths that can be read for config_key discovery.
 */

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import YAML from 'yaml';
import {
  resolvePackManifestPaths,
  type PackManifestResolverInput,
} from '../pack/pack-manifest-resolver.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let testDir: string;

/** Create a manifest file at the given directory */
async function createManifest(
  dir: string,
  manifest: Record<string, unknown>,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'manifest.yaml'), YAML.stringify(manifest), 'utf8');
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'pack-manifest-resolver-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// resolvePackManifestPaths
// ---------------------------------------------------------------------------

describe('resolvePackManifestPaths', () => {
  it('returns empty map when packs array is empty', () => {
    const result = resolvePackManifestPaths({
      projectRoot: testDir,
      packs: [],
    });
    expect(result).toEqual(new Map());
  });

  it('returns empty map when packs is undefined', () => {
    const result = resolvePackManifestPaths({
      projectRoot: testDir,
      packs: undefined as unknown as PackManifestResolverInput['packs'],
    });
    expect(result).toEqual(new Map());
  });

  // -------------------------------------------------------------------------
  // Local source resolution
  // -------------------------------------------------------------------------

  describe('source: local', () => {
    it('resolves manifest from monorepo layout (packages/@lumenflow/packs/<id>)', async () => {
      const packDir = join(testDir, 'packages', '@lumenflow', 'packs', 'software-delivery');
      await createManifest(packDir, {
        id: 'software-delivery',
        version: '3.0.0',
        config_key: 'software_delivery',
      });

      const result = resolvePackManifestPaths({
        projectRoot: testDir,
        packs: [
          { id: 'software-delivery', version: '3.0.0', integrity: 'dev', source: 'local' },
        ],
      });

      expect(result.get('software_delivery')).toBe('software-delivery');
    });

    it('resolves manifest from explicit path field when provided', async () => {
      const customDir = join(testDir, 'my-packs', 'custom-pack');
      await createManifest(customDir, {
        id: 'custom-pack',
        version: '1.0.0',
        config_key: 'custom',
      });

      const result = resolvePackManifestPaths({
        projectRoot: testDir,
        packs: [
          {
            id: 'custom-pack',
            version: '1.0.0',
            integrity: 'dev',
            source: 'local',
            path: 'my-packs/custom-pack',
          },
        ],
      });

      expect(result.get('custom')).toBe('custom-pack');
    });

    it('skips local pack when manifest does not exist', () => {
      const result = resolvePackManifestPaths({
        projectRoot: testDir,
        packs: [
          { id: 'nonexistent', version: '1.0.0', integrity: 'dev', source: 'local' },
        ],
      });

      expect(result.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Registry source resolution
  // -------------------------------------------------------------------------

  describe('source: registry', () => {
    it('resolves manifest from node_modules/@lumenflow/packs/<id>', async () => {
      const nmDir = join(testDir, 'node_modules', '@lumenflow', 'packs', 'software-delivery');
      await createManifest(nmDir, {
        id: 'software-delivery',
        version: '3.0.0',
        config_key: 'software_delivery',
      });

      const result = resolvePackManifestPaths({
        projectRoot: testDir,
        packs: [
          { id: 'software-delivery', version: '3.0.0', integrity: 'dev', source: 'registry' },
        ],
      });

      expect(result.get('software_delivery')).toBe('software-delivery');
    });

    it('skips registry pack when manifest does not exist in node_modules', () => {
      const result = resolvePackManifestPaths({
        projectRoot: testDir,
        packs: [
          { id: 'nonexistent', version: '1.0.0', integrity: 'dev', source: 'registry' },
        ],
      });

      expect(result.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Git source resolution
  // -------------------------------------------------------------------------

  describe('source: git', () => {
    it('resolves manifest from pack cache directory', async () => {
      const cacheDir = join(testDir, '.lumenflow', 'pack-cache', 'my-pack@2.0.0');
      await createManifest(cacheDir, {
        id: 'my-pack',
        version: '2.0.0',
        config_key: 'my_pack',
      });

      const result = resolvePackManifestPaths({
        projectRoot: testDir,
        packs: [
          {
            id: 'my-pack',
            version: '2.0.0',
            integrity: 'dev',
            source: 'git',
            url: 'https://github.com/org/my-pack.git',
          },
        ],
        packCacheDir: join(testDir, '.lumenflow', 'pack-cache'),
      });

      expect(result.get('my_pack')).toBe('my-pack');
    });

    it('skips git pack when manifest does not exist in cache', () => {
      const result = resolvePackManifestPaths({
        projectRoot: testDir,
        packs: [
          {
            id: 'uncached',
            version: '1.0.0',
            integrity: 'dev',
            source: 'git',
            url: 'https://github.com/org/uncached.git',
          },
        ],
        packCacheDir: join(testDir, '.lumenflow', 'pack-cache'),
      });

      expect(result.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Backward compatibility (no source field)
  // -------------------------------------------------------------------------

  describe('backward compatibility (no source field)', () => {
    it('falls back to monorepo layout when source is missing', async () => {
      const packDir = join(testDir, 'packages', '@lumenflow', 'packs', 'software-delivery');
      await createManifest(packDir, {
        id: 'software-delivery',
        version: '3.0.0',
        config_key: 'software_delivery',
      });

      const result = resolvePackManifestPaths({
        projectRoot: testDir,
        packs: [
          // No 'source' field - backward compat with old workspace.yaml
          { id: 'software-delivery', version: '3.0.0', integrity: 'dev' } as PackManifestResolverInput['packs'][number],
        ],
      });

      expect(result.get('software_delivery')).toBe('software-delivery');
    });
  });

  // -------------------------------------------------------------------------
  // Manifest without config_key
  // -------------------------------------------------------------------------

  describe('manifests without config_key', () => {
    it('skips packs whose manifest has no config_key', async () => {
      const packDir = join(testDir, 'packages', '@lumenflow', 'packs', 'no-config');
      await createManifest(packDir, {
        id: 'no-config',
        version: '1.0.0',
        // no config_key
      });

      const result = resolvePackManifestPaths({
        projectRoot: testDir,
        packs: [
          { id: 'no-config', version: '1.0.0', integrity: 'dev', source: 'local' },
        ],
      });

      expect(result.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Multiple packs
  // -------------------------------------------------------------------------

  describe('multiple packs', () => {
    it('resolves config keys from mixed source types', async () => {
      // Local pack
      const localDir = join(testDir, 'packages', '@lumenflow', 'packs', 'software-delivery');
      await createManifest(localDir, {
        id: 'software-delivery',
        version: '3.0.0',
        config_key: 'software_delivery',
      });

      // Registry pack
      const registryDir = join(
        testDir,
        'node_modules',
        '@lumenflow',
        'packs',
        'customer-support',
      );
      await createManifest(registryDir, {
        id: 'customer-support',
        version: '1.0.0',
        config_key: 'customer_support',
      });

      const result = resolvePackManifestPaths({
        projectRoot: testDir,
        packs: [
          { id: 'software-delivery', version: '3.0.0', integrity: 'dev', source: 'local' },
          { id: 'customer-support', version: '1.0.0', integrity: 'dev', source: 'registry' },
        ],
      });

      expect(result.size).toBe(2);
      expect(result.get('software_delivery')).toBe('software-delivery');
      expect(result.get('customer_support')).toBe('customer-support');
    });
  });

  // -------------------------------------------------------------------------
  // Malformed entries
  // -------------------------------------------------------------------------

  describe('malformed pack entries', () => {
    it('skips entries without an id', () => {
      const result = resolvePackManifestPaths({
        projectRoot: testDir,
        packs: [
          { version: '1.0.0', integrity: 'dev', source: 'local' } as unknown as PackManifestResolverInput['packs'][number],
        ],
      });

      expect(result.size).toBe(0);
    });

    it('skips entries that are null or not objects', () => {
      const result = resolvePackManifestPaths({
        projectRoot: testDir,
        packs: [null, 'invalid', 42] as unknown as PackManifestResolverInput['packs'],
      });

      expect(result.size).toBe(0);
    });
  });
});
