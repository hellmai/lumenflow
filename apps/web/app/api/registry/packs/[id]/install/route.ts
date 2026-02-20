/**
 * POST /api/registry/packs/:id/install
 *
 * Installs a pack from the registry into a connected workspace.
 * Accepts { workspaceRoot, version? } in the request body.
 * Resolves pack metadata from the registry, then delegates to
 * the CLI pack:install command via child_process.
 *
 * WU-1878
 * WU-1921: CWD validation (path traversal prevention) is enforced by
 * createInstallPackRoute in pack-registry-route-adapters.ts. The
 * workspaceRoot is validated before being used as cwd for execFile.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getRegistryStore } from '../../../../../../src/server/pack-registry-config';
import {
  createInstallPackRoute,
  type InstallPackResultView,
} from '../../../../../../src/server/pack-registry-route-adapters';
import type { RouteContext } from '../../../../../../src/server/api-route-paths';
import { resolveRouteParams } from '../../../../../../src/server/api-route-paths';

const execFileAsync = promisify(execFile);

/* ------------------------------------------------------------------
 * Concrete installFn using CLI subprocess
 * ------------------------------------------------------------------ */

const PACK_INSTALL_BIN = 'npx';
const PACK_INSTALL_ARGS_PREFIX = ['lumenflow', 'pack:install'];

async function installPackViaCli(options: {
  workspaceRoot: string;
  packId: string;
  version: string;
  registryUrl: string;
  integrity: string;
  fetchFn: typeof fetch;
}): Promise<InstallPackResultView> {
  try {
    const args = [
      ...PACK_INSTALL_ARGS_PREFIX,
      '--id',
      options.packId,
      '--source',
      'registry',
      '--version',
      options.version,
      '--registry-url',
      options.registryUrl,
      '--integrity',
      options.integrity,
    ];

    await execFileAsync(PACK_INSTALL_BIN, args, {
      cwd: options.workspaceRoot,
      timeout: 60_000,
    });

    return {
      success: true,
      integrity: options.integrity,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Install failed: ${message}`,
    };
  }
}

/* ------------------------------------------------------------------
 * Route handler
 * ------------------------------------------------------------------ */

const installPack = createInstallPackRoute({
  registryStore: getRegistryStore(),
  installFn: installPackViaCli,
});

interface PackIdParams {
  readonly id: string;
}

export async function POST(
  request: Request,
  context: RouteContext<PackIdParams>,
): Promise<Response> {
  const { id } = await resolveRouteParams(context);
  return installPack(request, id);
}
