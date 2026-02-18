import {
  createEventsPath,
  resolveRouteParams,
  type RouteContext,
} from '../../../../src/server/api-route-paths';
import { forwardToHttpSurface } from '../../../../src/server/http-surface-route-adapter';
import { getHttpSurfaceForWeb } from '../../../../src/server/http-surface-runtime';

interface EventsRouteParams {
  readonly taskId: string;
}

type EventsRouteContext = RouteContext<EventsRouteParams>;

export async function GET(request: Request, context: EventsRouteContext): Promise<Response> {
  const params = await resolveRouteParams(context);
  const surface = await getHttpSurfaceForWeb();

  return forwardToHttpSurface({
    request,
    surface,
    pathName: createEventsPath(params.taskId),
  });
}
