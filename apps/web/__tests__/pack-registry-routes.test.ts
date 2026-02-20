import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type {
  PackRegistryStore,
  PackBlobStore,
  AuthProvider,
  PackRegistryEntry,
  PackVersion,
} from '../src/lib/pack-registry-types';

/* ------------------------------------------------------------------
 * Route-level tests for the pack registry API.
 *
 * These test the route adapter functions that wrap handlers into
 * Next.js-compatible GET/POST exports.
 * ------------------------------------------------------------------ */

// --- Fixtures ---

const FIXTURE_VERSION: PackVersion = {
  version: '1.0.0',
  integrity: 'sha256:abc123',
  publishedAt: '2026-02-18T00:00:00Z',
  publishedBy: 'testuser',
  blobUrl: 'https://blob.vercel-storage.com/packs/software-delivery/1.0.0.tgz',
};

const FIXTURE_PACK: PackRegistryEntry = {
  id: 'software-delivery',
  description: 'Git tools, worktree isolation, quality gates',
  owner: 'testuser',
  latestVersion: '1.0.0',
  versions: [FIXTURE_VERSION],
  createdAt: '2026-02-18T00:00:00Z',
  updatedAt: '2026-02-18T00:00:00Z',
};

const ALLOWED_ORIGIN = 'http://localhost:3000';
const TAR_BLOCK_SIZE = 512;
const TAR_SIZE_FIELD_OFFSET = 124;
const TAR_SIZE_FIELD_LENGTH = 12;
const TAR_MAGIC_OFFSET = 257;
const TAR_MAGIC_VALUE = 'ustar';
const MANIFEST_PATH = 'manifest.yaml';

// --- Mock factories ---

function createMockRegistryStore(overrides: Partial<PackRegistryStore> = {}): PackRegistryStore {
  return {
    listPacks: vi.fn().mockResolvedValue([FIXTURE_PACK]),
    getPackById: vi.fn().mockResolvedValue(FIXTURE_PACK),
    upsertPackVersion: vi.fn().mockResolvedValue(FIXTURE_PACK),
    ...overrides,
  };
}

function createMockBlobStore(overrides: Partial<PackBlobStore> = {}): PackBlobStore {
  return {
    upload: vi.fn().mockResolvedValue({
      url: 'https://blob.vercel-storage.com/packs/test/1.0.0.tgz',
      integrity: 'sha256:test',
    }),
    ...overrides,
  };
}

function createMockAuthProvider(overrides: Partial<AuthProvider> = {}): AuthProvider {
  return {
    authenticate: vi.fn().mockResolvedValue({ username: 'testuser' }),
    ...overrides,
  };
}

function encodeTarSize(size: number): string {
  return size.toString(8).padStart(TAR_SIZE_FIELD_LENGTH - 1, '0');
}

function createTarHeader(path: string, size: number): Buffer {
  const header = Buffer.alloc(TAR_BLOCK_SIZE, 0);
  header.write(path, 0, 100, 'utf8');
  header.write('0000777', 100, 7, 'ascii');
  header.write('0000000', 108, 7, 'ascii');
  header.write('0000000', 116, 7, 'ascii');
  header.write(encodeTarSize(size), TAR_SIZE_FIELD_OFFSET, TAR_SIZE_FIELD_LENGTH - 1, 'ascii');
  header.write('00000000000', 136, 11, 'ascii');
  header.write('0', 156, 1, 'ascii');
  header.write(TAR_MAGIC_VALUE, TAR_MAGIC_OFFSET, TAR_MAGIC_VALUE.length, 'ascii');
  header.fill(32, 148, 156);

  let checksum = 0;
  for (const byte of header.values()) {
    checksum += byte;
  }

  const checksumValue = checksum.toString(8).padStart(6, '0');
  header.write(checksumValue, 148, 6, 'ascii');
  header.write('\0 ', 154, 2, 'ascii');

  return header;
}

function createManifestTarball(manifestContent: string): Uint8Array {
  const manifestBuffer = Buffer.from(manifestContent, 'utf8');
  const header = createTarHeader(MANIFEST_PATH, manifestBuffer.length);
  const padding = Buffer.alloc(
    (TAR_BLOCK_SIZE - (manifestBuffer.length % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE,
    0,
  );
  const end = Buffer.alloc(TAR_BLOCK_SIZE * 2, 0);
  const tarArchive = Buffer.concat([header, manifestBuffer, padding, end]);
  return new Uint8Array(gzipSync(tarArchive));
}

describe('Pack Registry Route Adapters', () => {
  let registryStore: PackRegistryStore;
  let blobStore: PackBlobStore;
  let authProvider: AuthProvider;

  beforeEach(() => {
    registryStore = createMockRegistryStore();
    blobStore = createMockBlobStore();
    authProvider = createMockAuthProvider();
  });

  describe('createListPacksRoute', () => {
    it('returns 200 with pack list as JSON', async () => {
      const { createListPacksRoute } = await import('../src/server/pack-registry-route-adapters');

      const handler = createListPacksRoute({ registryStore });
      const request = new Request('http://localhost/api/registry/packs');
      const response = await handler(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.packs).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it('passes search query from URL parameter', async () => {
      const { createListPacksRoute } = await import('../src/server/pack-registry-route-adapters');

      const handler = createListPacksRoute({ registryStore });
      const request = new Request('http://localhost/api/registry/packs?q=delivery');
      await handler(request);

      expect(registryStore.listPacks).toHaveBeenCalledWith('delivery');
    });

    it('returns 500 on internal error', async () => {
      const failingStore = createMockRegistryStore({
        listPacks: vi.fn().mockRejectedValue(new Error('DB down')),
      });

      const { createListPacksRoute } = await import('../src/server/pack-registry-route-adapters');

      const handler = createListPacksRoute({ registryStore: failingStore });
      const request = new Request('http://localhost/api/registry/packs');
      const response = await handler(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.success).toBe(false);
    });
  });

  describe('createGetPackRoute', () => {
    it('returns 200 with pack metadata', async () => {
      const { createGetPackRoute } = await import('../src/server/pack-registry-route-adapters');

      const handler = createGetPackRoute({ registryStore });
      const response = await handler('software-delivery');

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.pack.id).toBe('software-delivery');
    });

    it('returns 404 when pack not found', async () => {
      const notFoundStore = createMockRegistryStore({
        getPackById: vi.fn().mockResolvedValue(null),
      });

      const { createGetPackRoute } = await import('../src/server/pack-registry-route-adapters');

      const handler = createGetPackRoute({ registryStore: notFoundStore });
      const response = await handler('nonexistent');

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.success).toBe(false);
    });
  });

  describe('createPublishVersionRoute', () => {
    it('returns 201 on successful publish', async () => {
      const { createPublishVersionRoute } =
        await import('../src/server/pack-registry-route-adapters');

      const handler = createPublishVersionRoute({
        registryStore,
        blobStore,
        authProvider,
      });

      const formData = new FormData();
      formData.append('description', 'Test pack');
      formData.append('tarball', new Blob([new Uint8Array([1, 2, 3])]), 'pack.tgz');

      const request = new Request('http://localhost/api/registry/packs/test/versions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ghp_validtoken', Origin: ALLOWED_ORIGIN },
        body: formData,
      });

      const response = await handler(request, 'software-delivery', '2.0.0');

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it('returns 401 when not authenticated', async () => {
      const { createPublishVersionRoute } =
        await import('../src/server/pack-registry-route-adapters');

      const handler = createPublishVersionRoute({
        registryStore,
        blobStore,
        authProvider,
      });

      const formData = new FormData();
      formData.append('description', 'Test');
      formData.append('tarball', new Blob([new Uint8Array([1])]), 'pack.tgz');

      const request = new Request('http://localhost/api/registry/packs/test/versions', {
        method: 'POST',
        headers: { Origin: ALLOWED_ORIGIN },
        body: formData,
      });

      const response = await handler(request, 'software-delivery', '2.0.0');

      expect(response.status).toBe(401);
    });

    it('returns 400 when tarball is missing', async () => {
      const { createPublishVersionRoute } =
        await import('../src/server/pack-registry-route-adapters');

      const handler = createPublishVersionRoute({
        registryStore,
        blobStore,
        authProvider,
      });

      const formData = new FormData();
      formData.append('description', 'Test');

      const request = new Request('http://localhost/api/registry/packs/test/versions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ghp_validtoken', Origin: ALLOWED_ORIGIN },
        body: formData,
      });

      const response = await handler(request, 'software-delivery', '2.0.0');

      expect(response.status).toBe(400);
    });

    it('ignores client manifest_summary fields and persists server-derived summary', async () => {
      const { createPublishVersionRoute } =
        await import('../src/server/pack-registry-route-adapters');

      const upsertPackVersion = vi.fn().mockResolvedValue(FIXTURE_PACK);
      const freshStore = createMockRegistryStore({
        getPackById: vi.fn().mockResolvedValue(null),
        upsertPackVersion,
      });

      const handler = createPublishVersionRoute({
        registryStore: freshStore,
        blobStore,
        authProvider,
      });

      const formData = new FormData();
      formData.append('description', 'Test pack');
      formData.append(
        'manifest_summary',
        JSON.stringify({
          tools: [{ name: 'spoofed:admin', permission: 'admin' }],
          policies: [{ id: 'spoofed.policy', trigger: 'on_tool_request', decision: 'allow' }],
          categories: ['spoofed'],
        }),
      );
      formData.append(
        'tarball',
        new Blob([
          createManifestTarball(`id: software-delivery
version: 2.0.0
task_types:
  - development
tools:
  - name: file:read
    entry: tool-impl/file.ts#readTool
    permission: read
    required_scopes:
      - type: path
        pattern: src/**
        access: read
policies:
  - id: software-delivery.allow-read
    trigger: on_tool_request
    decision: allow
evidence_types: []
state_aliases: {}
lane_templates: []
categories:
  - development
`),
        ]),
        'pack.tgz',
      );

      const request = new Request('http://localhost/api/registry/packs/test/versions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ghp_validtoken', Origin: ALLOWED_ORIGIN },
        body: formData,
      });

      const response = await handler(request, 'software-delivery', '2.0.0');

      expect(response.status).toBe(201);
      const call = upsertPackVersion.mock.calls[0];
      const version = call?.[2] as PackVersion;
      expect(version.manifest_summary).toBeDefined();
      expect(version.manifest_summary?.tools[0]?.name).toBe('file:read');
      expect(version.manifest_summary?.tools[0]?.name).not.toBe('spoofed:admin');
      expect(version.manifest_summary?.categories).toContain('development');
      expect(version.manifest_summary?.categories).not.toContain('spoofed');
    });
  });
});
