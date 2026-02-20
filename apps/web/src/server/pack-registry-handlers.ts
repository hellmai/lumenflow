/**
 * Pack registry API handlers (WU-1836, WU-1920).
 *
 * Pure functions for pack listing, detail, publishing, and authentication.
 * Decoupled from Next.js route infrastructure and storage backends
 * via port interfaces (PackRegistryStore, PackBlobStore, AuthProvider).
 *
 * WU-1920 security hardening:
 * - S-OWN: Pack ownership validation (publisher = owner)
 * - S-IMMUT: Version immutability (duplicate version returns 409)
 * - S-TARVAL: Tarball validation (size limit)
 * - S-RACE: Optimistic concurrency retry on ConcurrentModificationError
 * - S-RATE: Per-publisher rate limiting on publish
 */

import { gunzipSync } from 'node:zlib';
import { DomainPackManifestSchema } from '@lumenflow/kernel';
import YAML from 'yaml';
import type {
  PackRegistryStore,
  PackBlobStore,
  PackRegistryEntry,
  PackVersion,
  PackListResponse,
  PackRegistryErrorResponse,
  PublisherIdentity,
  AuthProvider,
  PackManifestSummary,
  PackManifestToolSummary,
  PackManifestPolicySummary,
} from '../lib/pack-registry-types';
import { ConcurrentModificationError } from './pack-registry-store-vercel-blob';

/* ------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------ */

const ERROR_PACK_NOT_FOUND = 'Pack not found';
const ERROR_AUTHORIZATION_REQUIRED = 'Authorization header is required';
const ERROR_BEARER_FORMAT_REQUIRED = 'Authorization header must use Bearer scheme';
const ERROR_INVALID_TOKEN = 'Invalid or expired token';
const ERROR_PUBLISH_PREFIX = 'Failed to publish version';
const ERROR_OWNERSHIP_VIOLATION = 'Pack ownership violation: publisher is not the pack owner';
const ERROR_VERSION_EXISTS = 'Version already exists';
const ERROR_TARBALL_TOO_LARGE = 'Tarball exceeds maximum size';
const ERROR_CONCURRENT_MODIFICATION = 'Failed to publish due to concurrent modification';
const ERROR_RATE_LIMITED = 'Publish rate limit exceeded';
const MANIFEST_FILE_NAME = 'manifest.yaml';
const TAR_HEADER_BLOCK_SIZE = 512;
const TAR_NAME_OFFSET = 0;
const TAR_NAME_LENGTH = 100;
const TAR_SIZE_OFFSET = 124;
const TAR_SIZE_LENGTH = 12;
const TAR_TYPE_OFFSET = 156;
const TAR_PREFIX_OFFSET = 345;
const TAR_PREFIX_LENGTH = 155;
const TAR_FILE_TYPE_NORMAL = '0';
const GZIP_MAGIC_FIRST = 0x1f;
const GZIP_MAGIC_SECOND = 0x8b;
const OCTAL_RADIX = 8;
const EMPTY_STRING = '';
const SLASH = '/';
const CURRENT_DIR_PREFIX = './';
const NULL_CHARACTER = '\0';

const BEARER_PREFIX = 'Bearer ';

/** Maximum tarball size in bytes (50 MB). */
export const TARBALL_MAX_SIZE = 50 * 1024 * 1024;

/** Maximum retries for optimistic concurrency conflicts. */
export const CONCURRENCY_MAX_RETRIES = 3;

/** Maximum publish requests per publisher within the rate limit window. */
export const RATE_LIMIT_MAX_REQUESTS = 10;

/** Rate limit window duration in milliseconds (1 minute). */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

/* ------------------------------------------------------------------
 * S-RATE: Per-publisher rate limiter (WU-1920)
 * ------------------------------------------------------------------ */

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitEntry>();

type PackPermission = 'read' | 'write' | 'admin';

interface ManifestEnvelope {
  readonly categories?: unknown;
  readonly tools?: unknown;
}

interface ManifestToolEnvelope {
  readonly description?: unknown;
}

function createFallbackManifestSummary(): PackManifestSummary {
  return {
    tools: [],
    policies: [],
    categories: [],
    taskTypes: [],
    trust: {
      integrityVerified: true,
      manifestParsed: false,
      publisherVerified: true,
      permissionScopes: [],
    },
  };
}

function isLikelyGzip(payload: Uint8Array): boolean {
  return (
    payload.byteLength >= 2 && payload[0] === GZIP_MAGIC_FIRST && payload[1] === GZIP_MAGIC_SECOND
  );
}

function decodeTarPayload(payload: Uint8Array): Uint8Array {
  if (!isLikelyGzip(payload)) {
    return payload;
  }

  try {
    return new Uint8Array(gunzipSync(Buffer.from(payload)));
  } catch {
    return payload;
  }
}

function isTarZeroBlock(block: Uint8Array): boolean {
  return block.every((byte) => byte === 0);
}

function readTarHeaderField(block: Uint8Array, offset: number, length: number): string {
  const raw = Buffer.from(block.subarray(offset, offset + length)).toString('utf8');
  const nullIndex = raw.indexOf(NULL_CHARACTER);
  const sliced = nullIndex >= 0 ? raw.slice(0, nullIndex) : raw;
  return sliced.trim();
}

function parseTarSizeOctal(rawSize: string): number {
  const normalized = rawSize.replaceAll(NULL_CHARACTER, EMPTY_STRING).trim();
  if (normalized.length === 0) {
    return 0;
  }
  const parsed = Number.parseInt(normalized, OCTAL_RADIX);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function normalizeArchivePath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, SLASH);
  return normalized.startsWith(CURRENT_DIR_PREFIX)
    ? normalized.slice(CURRENT_DIR_PREFIX.length)
    : normalized;
}

function isManifestPath(pathValue: string): boolean {
  const normalized = normalizeArchivePath(pathValue);
  return normalized === MANIFEST_FILE_NAME || normalized.endsWith(`${SLASH}${MANIFEST_FILE_NAME}`);
}

function readManifestFromTarball(payload: Uint8Array): string | null {
  const tarPayload = decodeTarPayload(payload);
  let cursor = 0;

  while (cursor + TAR_HEADER_BLOCK_SIZE <= tarPayload.byteLength) {
    const header = tarPayload.subarray(cursor, cursor + TAR_HEADER_BLOCK_SIZE);
    if (isTarZeroBlock(header)) {
      return null;
    }

    const name = readTarHeaderField(header, TAR_NAME_OFFSET, TAR_NAME_LENGTH);
    const prefix = readTarHeaderField(header, TAR_PREFIX_OFFSET, TAR_PREFIX_LENGTH);
    const type = readTarHeaderField(header, TAR_TYPE_OFFSET, 1);
    const sizeRaw = readTarHeaderField(header, TAR_SIZE_OFFSET, TAR_SIZE_LENGTH);
    const size = parseTarSizeOctal(sizeRaw);
    const entryPath = prefix.length > 0 ? `${prefix}${SLASH}${name}` : name;
    const contentStart = cursor + TAR_HEADER_BLOCK_SIZE;
    const contentEnd = contentStart + size;

    if (contentEnd > tarPayload.byteLength) {
      return null;
    }

    const isRegularFile = type === EMPTY_STRING || type === TAR_FILE_TYPE_NORMAL;
    if (isRegularFile && isManifestPath(entryPath)) {
      return Buffer.from(tarPayload.subarray(contentStart, contentEnd)).toString('utf8');
    }

    const paddedSize = Math.ceil(size / TAR_HEADER_BLOCK_SIZE) * TAR_HEADER_BLOCK_SIZE;
    cursor = contentStart + paddedSize;
  }

  return null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function uniquePermissions(values: readonly PackPermission[]): PackPermission[] {
  function permissionOrder(permission: PackPermission): number {
    if (permission === 'read') {
      return 0;
    }
    if (permission === 'write') {
      return 1;
    }
    return 2;
  }

  return [...new Set(values)].sort((a, b) => permissionOrder(a) - permissionOrder(b));
}

function readToolDescription(rawTools: unknown, index: number): string | undefined {
  if (!Array.isArray(rawTools)) {
    return undefined;
  }
  const rawEntry = rawTools.at(index);
  if (typeof rawEntry !== 'object' || rawEntry === null) {
    return undefined;
  }

  const description = (rawEntry as ManifestToolEnvelope).description;
  return typeof description === 'string' && description.trim().length > 0
    ? description.trim()
    : undefined;
}

function deriveManifestSummaryFromTarball(payload: Uint8Array): PackManifestSummary {
  const fallback = createFallbackManifestSummary();
  const manifestRaw = readManifestFromTarball(payload);
  if (manifestRaw === null) {
    return fallback;
  }

  try {
    const parsedYaml = YAML.parse(manifestRaw) as unknown;
    if (typeof parsedYaml !== 'object' || parsedYaml === null) {
      return fallback;
    }

    const manifestObject = parsedYaml as Record<string, unknown> & ManifestEnvelope;
    const manifest = DomainPackManifestSchema.parse(manifestObject);
    const rawCategories = toStringArray(manifestObject.categories);

    const categories =
      rawCategories.length > 0 ? uniqueStrings(rawCategories) : uniqueStrings(manifest.task_types);
    const taskTypes = uniqueStrings(manifest.task_types);
    const tools: PackManifestToolSummary[] = manifest.tools.map((tool, index) => {
      const description = readToolDescription(manifestObject.tools, index);
      return description
        ? {
            name: tool.name,
            permission: tool.permission,
            description,
          }
        : {
            name: tool.name,
            permission: tool.permission,
          };
    });
    const policies: PackManifestPolicySummary[] = manifest.policies.map((policy) => ({
      id: policy.id,
      trigger: policy.trigger,
      decision: policy.decision,
      reason: policy.reason,
    }));
    const permissionScopes = uniquePermissions(manifest.tools.map((tool) => tool.permission));

    return {
      tools,
      policies,
      categories,
      taskTypes,
      trust: {
        integrityVerified: true,
        manifestParsed: true,
        publisherVerified: true,
        permissionScopes,
      },
    };
  } catch {
    return fallback;
  }
}

/**
 * Check whether a publisher has exceeded the publish rate limit.
 * Returns true if the request is allowed, false if rate-limited.
 */
function checkRateLimit(publisherUsername: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  let entry = rateLimitStore.get(publisherUsername);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(publisherUsername, entry);
  }

  // Prune timestamps outside the window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (entry.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.timestamps.push(now);
  return true;
}

/** Reset rate limiter state (for testing). */
export function resetRateLimiter(): void {
  rateLimitStore.clear();
}

/* ------------------------------------------------------------------
 * AC1: List packs with search
 * ------------------------------------------------------------------ */

interface ListPacksInput {
  readonly registryStore: PackRegistryStore;
  readonly query?: string;
}

export async function handleListPacks(input: ListPacksInput): Promise<PackListResponse> {
  const packs = await input.registryStore.listPacks(input.query);
  return {
    packs,
    total: packs.length,
  };
}

/* ------------------------------------------------------------------
 * AC2: Get pack by ID
 * ------------------------------------------------------------------ */

interface GetPackInput {
  readonly registryStore: PackRegistryStore;
  readonly packId: string;
}

type GetPackResult =
  | { readonly success: true; readonly pack: PackRegistryEntry }
  | PackRegistryErrorResponse;

export async function handleGetPack(input: GetPackInput): Promise<GetPackResult> {
  const pack = await input.registryStore.getPackById(input.packId);

  if (pack === null) {
    return { success: false, error: `${ERROR_PACK_NOT_FOUND}: ${input.packId}` };
  }

  return { success: true, pack };
}

/* ------------------------------------------------------------------
 * AC3: Publish pack version (with WU-1920 security hardening)
 * ------------------------------------------------------------------ */

interface PublishVersionInput {
  readonly registryStore: PackRegistryStore;
  readonly blobStore: PackBlobStore;
  readonly packId: string;
  readonly version: string;
  readonly description: string;
  readonly tarball: Uint8Array;
  readonly publisher: PublisherIdentity;
}

type PublishResult =
  | { readonly success: true; readonly version: PackVersion }
  | PackRegistryErrorResponse;

export async function handlePublishVersion(input: PublishVersionInput): Promise<PublishResult> {
  // S-RATE: Check per-publisher rate limit
  if (!checkRateLimit(input.publisher.username)) {
    return {
      success: false,
      error: ERROR_RATE_LIMITED,
      statusCode: 429,
    };
  }

  // S-TARVAL: Validate tarball size
  if (input.tarball.byteLength > TARBALL_MAX_SIZE) {
    return {
      success: false,
      error: `${ERROR_TARBALL_TOO_LARGE}: ${input.tarball.byteLength} bytes exceeds limit of ${TARBALL_MAX_SIZE} bytes`,
    };
  }

  // Look up existing pack for ownership and version immutability checks
  const existingPack = await input.registryStore.getPackById(input.packId);
  const manifestSummary = deriveManifestSummaryFromTarball(input.tarball);

  if (existingPack) {
    // S-OWN: Validate pack ownership
    if (existingPack.owner !== input.publisher.username) {
      return {
        success: false,
        error: ERROR_OWNERSHIP_VIOLATION,
        statusCode: 403,
      };
    }

    // S-IMMUT: Check version immutability
    const versionExists = existingPack.versions.some((v) => v.version === input.version);
    if (versionExists) {
      return {
        success: false,
        error: `${ERROR_VERSION_EXISTS}: ${input.packId}@${input.version}`,
        statusCode: 409,
      };
    }
  }

  try {
    const blob = await input.blobStore.upload(input.packId, input.version, input.tarball);

    const now = new Date().toISOString();

    const newVersion: PackVersion = {
      version: input.version,
      integrity: blob.integrity,
      publishedAt: now,
      publishedBy: input.publisher.username,
      blobUrl: blob.url,
      manifest_summary: manifestSummary,
    };

    // S-RACE: Retry on optimistic concurrency conflicts
    let lastError: unknown;
    for (let attempt = 0; attempt < CONCURRENCY_MAX_RETRIES; attempt++) {
      try {
        await input.registryStore.upsertPackVersion(
          input.packId,
          input.description,
          newVersion,
          input.publisher.username,
        );
        return { success: true, version: newVersion };
      } catch (error) {
        if (error instanceof ConcurrentModificationError) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    // All retries exhausted
    const message =
      lastError instanceof Error
        ? `${ERROR_CONCURRENT_MODIFICATION}: ${lastError.message}`
        : ERROR_CONCURRENT_MODIFICATION;
    return { success: false, error: message, statusCode: 409 };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `${ERROR_PUBLISH_PREFIX}: unknown error`;
    return { success: false, error: message };
  }
}

/* ------------------------------------------------------------------
 * AC4: Authentication
 * ------------------------------------------------------------------ */

interface AuthenticateInput {
  readonly authProvider: AuthProvider;
  readonly authorizationHeader: string | undefined;
}

type AuthResult =
  | { readonly success: true; readonly publisher: PublisherIdentity }
  | PackRegistryErrorResponse;

export async function authenticatePublisher(input: AuthenticateInput): Promise<AuthResult> {
  if (!input.authorizationHeader) {
    return { success: false, error: ERROR_AUTHORIZATION_REQUIRED };
  }

  if (!input.authorizationHeader.startsWith(BEARER_PREFIX)) {
    return { success: false, error: ERROR_BEARER_FORMAT_REQUIRED };
  }

  const token = input.authorizationHeader.slice(BEARER_PREFIX.length);

  const publisher = await input.authProvider.authenticate(token);

  if (publisher === null) {
    return { success: false, error: ERROR_INVALID_TOKEN };
  }

  return { success: true, publisher };
}
