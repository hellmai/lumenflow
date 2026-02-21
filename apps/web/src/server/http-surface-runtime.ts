import {
  initializeKernelRuntime,
  type Disposable,
  type KernelEvent,
  type KernelRuntime,
  type ReplayFilter,
} from '@lumenflow/kernel';
import {
  createHttpSurface,
  type HttpSurface,
} from '../../../../packages/@lumenflow/surfaces/http/server';

const ENVIRONMENT_KEY = {
  ENABLE_RUNTIME: 'LUMENFLOW_WEB_ENABLE_KERNEL_RUNTIME',
  RUNTIME_WORKSPACE_ROOT: 'LUMENFLOW_WEB_RUNTIME_WORKSPACE_ROOT',
  WORKSPACE_ROOT: 'LUMENFLOW_WEB_WORKSPACE_ROOT',
} as const;

const ENVIRONMENT_VALUE = {
  TRUE: '1',
} as const;

const ERROR_MESSAGE = {
  RUNTIME_UNAVAILABLE:
    'Kernel runtime unavailable in web app preview mode. Set LUMENFLOW_WEB_ENABLE_KERNEL_RUNTIME=1 and LUMENFLOW_WEB_RUNTIME_WORKSPACE_ROOT=/absolute/workspace/path (or fallback LUMENFLOW_WEB_WORKSPACE_ROOT=/absolute/path) in .env.local, then restart the web server.',
  RUNTIME_INIT_UNKNOWN: 'Unknown runtime initialization error.',
} as const;

const NOOP_DISPOSABLE: Disposable = {
  dispose: () => {
    // noop
  },
};

type KernelRuntimeWithEventSubscription = KernelRuntime & {
  subscribeEvents?: (
    filter: ReplayFilter,
    callback: (event: KernelEvent) => void | Promise<void>,
  ) => Disposable;
};

type PreviewRuntimeTagged = {
  readonly __lumenflowPreviewRuntime: true;
};

export interface KernelRuntimeHealth {
  readonly mode: 'runtime' | 'preview';
  readonly enabled: boolean;
  readonly available: boolean;
  readonly workspaceRoot: string;
  readonly message?: string;
  readonly initializationError?: string;
}

let runtimePromise: Promise<KernelRuntimeWithEventSubscription> | null = null;
let httpSurfacePromise: Promise<HttpSurface> | null = null;
let runtimeInitializationError: string | null = null;

function createRuntimeUnavailableError(): Error {
  return new Error(ERROR_MESSAGE.RUNTIME_UNAVAILABLE);
}

function createPreviewRuntime(): KernelRuntimeWithEventSubscription {
  return {
    __lumenflowPreviewRuntime: true,
    createTask: async () => {
      throw createRuntimeUnavailableError();
    },
    claimTask: async () => {
      throw createRuntimeUnavailableError();
    },
    blockTask: async () => {
      throw createRuntimeUnavailableError();
    },
    unblockTask: async () => {
      throw createRuntimeUnavailableError();
    },
    completeTask: async () => {
      throw createRuntimeUnavailableError();
    },
    inspectTask: async () => {
      throw createRuntimeUnavailableError();
    },
    executeTool: async () => {
      throw createRuntimeUnavailableError();
    },
    resolveApproval: async () => {
      throw createRuntimeUnavailableError();
    },
    getToolHost: () => {
      throw createRuntimeUnavailableError();
    },
    getPolicyEngine: () => {
      throw createRuntimeUnavailableError();
    },
    subscribeEvents: () => NOOP_DISPOSABLE,
  } as KernelRuntimeWithEventSubscription & PreviewRuntimeTagged;
}

function isRuntimeInitializationEnabled(environment: NodeJS.ProcessEnv): boolean {
  return environment[ENVIRONMENT_KEY.ENABLE_RUNTIME] === ENVIRONMENT_VALUE.TRUE;
}

function resolveRuntimeWorkspaceRoot(environment: NodeJS.ProcessEnv): string {
  return (
    environment[ENVIRONMENT_KEY.RUNTIME_WORKSPACE_ROOT] ??
    environment[ENVIRONMENT_KEY.WORKSPACE_ROOT] ??
    process.cwd()
  );
}

function resolveRuntimeInitializationError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return ERROR_MESSAGE.RUNTIME_INIT_UNKNOWN;
}

async function createRuntimeForWeb(): Promise<KernelRuntimeWithEventSubscription> {
  if (!isRuntimeInitializationEnabled(process.env)) {
    runtimeInitializationError = null;
    return createPreviewRuntime();
  }

  try {
    const runtime = await initializeKernelRuntime({
      workspaceRoot: resolveRuntimeWorkspaceRoot(process.env),
    });
    runtimeInitializationError = null;
    return runtime as KernelRuntimeWithEventSubscription;
  } catch (error) {
    runtimeInitializationError = resolveRuntimeInitializationError(error);
    return createPreviewRuntime();
  }
}

export async function getKernelRuntimeForWeb(): Promise<KernelRuntimeWithEventSubscription> {
  if (!runtimePromise) {
    runtimePromise = createRuntimeForWeb();
  }
  return runtimePromise;
}

function isPreviewRuntime(runtime: KernelRuntimeWithEventSubscription): boolean {
  const runtimeWithMarker = runtime as Partial<PreviewRuntimeTagged>;
  return runtimeWithMarker.__lumenflowPreviewRuntime === true;
}

export async function getKernelRuntimeHealth(): Promise<KernelRuntimeHealth> {
  const enabled = isRuntimeInitializationEnabled(process.env);
  const workspaceRoot = resolveRuntimeWorkspaceRoot(process.env);
  const runtime = await getKernelRuntimeForWeb();
  const previewMode = isPreviewRuntime(runtime);
  const includeInitializationError =
    enabled && previewMode && runtimeInitializationError !== null
      ? { initializationError: runtimeInitializationError }
      : {};

  return {
    mode: previewMode ? 'preview' : 'runtime',
    enabled,
    available: !previewMode,
    workspaceRoot,
    ...(previewMode ? { message: ERROR_MESSAGE.RUNTIME_UNAVAILABLE } : {}),
    ...includeInitializationError,
  };
}

async function createWebHttpSurface(): Promise<HttpSurface> {
  const runtime = await getKernelRuntimeForWeb();
  return createHttpSurface(runtime);
}

export async function getHttpSurfaceForWeb(): Promise<HttpSurface> {
  if (!httpSurfacePromise) {
    httpSurfacePromise = createWebHttpSurface();
  }
  return httpSurfacePromise;
}
