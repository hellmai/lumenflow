import {
  createTasksPath,
  resolveRouteParams,
  type RouteContext,
} from '../../../../src/server/api-route-paths';
import { forwardToHttpSurface } from '../../../../src/server/http-surface-route-adapter';
import { getHttpSurfaceForWeb } from '../../../../src/server/http-surface-runtime';
import { validateCsrfOrigin, validateBodySize } from '../../../../src/server/input-validation';

const HTTP_STATUS = {
  FORBIDDEN: 403,
  PAYLOAD_TOO_LARGE: 413,
} as const;

const JSON_CONTENT_TYPE = { 'Content-Type': 'application/json' } as const;
const ALLOWED_ORIGINS = [process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'];
const MAX_POST_BODY_SIZE = 1024 * 1024;

interface TasksRouteParams {
  readonly slug?: string[];
}

type TasksRouteContext = RouteContext<TasksRouteParams>;

async function delegateTaskRequest(
  request: Request,
  context: TasksRouteContext,
): Promise<Response> {
  const params = await resolveRouteParams(context);
  const surface = await getHttpSurfaceForWeb();

  return forwardToHttpSurface({
    request,
    surface,
    pathName: createTasksPath(params.slug ?? []),
  });
}

export async function GET(request: Request, context: TasksRouteContext): Promise<Response> {
  return delegateTaskRequest(request, context);
}

export async function POST(request: Request, context: TasksRouteContext): Promise<Response> {
  const csrfResult = validateCsrfOrigin(request, ALLOWED_ORIGINS);
  if (!csrfResult.valid) {
    return new Response(
      JSON.stringify({ success: false, code: csrfResult.code, error: csrfResult.message }),
      { status: HTTP_STATUS.FORBIDDEN, headers: JSON_CONTENT_TYPE },
    );
  }

  const bodySizeResult = validateBodySize(request, MAX_POST_BODY_SIZE);
  if (!bodySizeResult.valid) {
    return new Response(
      JSON.stringify({ success: false, code: bodySizeResult.code, error: bodySizeResult.message }),
      { status: HTTP_STATUS.PAYLOAD_TOO_LARGE, headers: JSON_CONTENT_TYPE },
    );
  }

  return delegateTaskRequest(request, context);
}
