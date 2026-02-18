import { createTasksPath } from '../../../src/server/api-route-paths';
import { forwardToHttpSurface } from '../../../src/server/http-surface-route-adapter';
import { getHttpSurfaceForWeb } from '../../../src/server/http-surface-runtime';

async function delegateTaskCollectionRequest(request: Request): Promise<Response> {
  const surface = await getHttpSurfaceForWeb();
  return forwardToHttpSurface({
    request,
    surface,
    pathName: createTasksPath(),
  });
}

export async function GET(request: Request): Promise<Response> {
  return delegateTaskCollectionRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return delegateTaskCollectionRequest(request);
}
