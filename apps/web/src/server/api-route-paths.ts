const PATH_SEPARATOR = '/';

const SURFACE_ROOT_SEGMENT = {
  EVENTS: 'events',
  TASKS: 'tasks',
} as const;

export interface RouteContext<T> {
  readonly params: Promise<T>;
}

export async function resolveRouteParams<T>(context: RouteContext<T>): Promise<T> {
  return context.params;
}

function normalizeSegment(segment: string): string {
  return encodeURIComponent(segment);
}

function createPath(rootSegment: string, segments: readonly string[]): string {
  const normalizedSegments = [rootSegment, ...segments]
    .filter((segment) => segment.length > 0)
    .map((segment) => normalizeSegment(segment));

  return `${PATH_SEPARATOR}${normalizedSegments.join(PATH_SEPARATOR)}`;
}

export function createEventsPath(taskId: string): string {
  return createPath(SURFACE_ROOT_SEGMENT.EVENTS, [taskId]);
}

export function createTasksPath(segments: readonly string[] = []): string {
  return createPath(SURFACE_ROOT_SEGMENT.TASKS, segments);
}
