// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type {
  Disposable,
  KernelEvent,
  KernelRuntime,
  ReplayFilter,
  TaskSpec,
} from '@lumenflow/kernel';
import type { ControlPlaneSyncPort, PushKernelEventsInput } from '@lumenflow/control-plane-sdk';
import { describe, expect, it, vi } from 'vitest';
import { createHttpSurface, type HttpSurfaceOptions } from '../http/server.js';

// --- Constants ---

const HTTP_METHOD = {
  GET: 'GET',
  POST: 'POST',
} as const;

const HTTP_STATUS = {
  OK: 200,
} as const;

const HTTP_HEADERS = {
  CONTENT_TYPE: 'content-type',
} as const;

const CONTENT_TYPE = {
  JSON: 'application/json; charset=utf-8',
  EVENT_STREAM: 'text/event-stream; charset=utf-8',
} as const;

const TASK = {
  ID: 'WU-1841-cp',
  WORKSPACE_ID: 'workspace-cp-test',
} as const;

const SAMPLE_TIMESTAMP = '2026-02-18T12:00:00.000Z';

// --- Helpers ---

interface RequestOptions {
  method: (typeof HTTP_METHOD)[keyof typeof HTTP_METHOD];
  url: string;
  body?: unknown;
}

class MockResponse extends EventEmitter {
  statusCode = HTTP_STATUS.OK;
  body = '';
  readonly headers = new Map<string, string>();

  setHeader(name: string, value: string | number | readonly string[]): this {
    this.headers.set(name.toLowerCase(), String(value));
    return this;
  }

  writeHead(statusCode: number, headers?: Record<string, string>): this {
    this.statusCode = statusCode;
    if (headers) {
      for (const [name, value] of Object.entries(headers)) {
        this.setHeader(name, value);
      }
    }
    return this;
  }

  write(chunk: string | Buffer): boolean {
    this.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
    return true;
  }

  end(chunk?: string | Buffer): this {
    if (chunk !== undefined) {
      this.write(chunk);
    }
    this.emit('finish');
    return this;
  }
}

function createRequest(options: RequestOptions): IncomingMessage {
  const request = new PassThrough() as unknown as IncomingMessage & {
    method: string;
    url: string;
    headers: IncomingHttpHeaders;
  };

  request.method = options.method;
  request.url = options.url;
  request.headers = {
    [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPE.JSON,
  };

  const payload = options.body === undefined ? '' : JSON.stringify(options.body);
  (request as unknown as PassThrough).end(payload);
  return request;
}

function createRuntimeStub(): KernelRuntime {
  return {
    createTask: vi.fn(async (taskSpec: TaskSpec) => ({
      task: taskSpec,
      task_spec_path: '/tmp/WU-1841-cp.yaml',
      event: {
        schema_version: 1,
        kind: 'task_created',
        task_id: taskSpec.id,
        timestamp: SAMPLE_TIMESTAMP,
        spec_hash: 'spec-hash',
      },
    })),
    claimTask: vi.fn(async (input) => ({ task_id: input.task_id })),
    completeTask: vi.fn(async (input) => ({ task_id: input.task_id })),
    inspectTask: vi.fn(async (taskId: string) => ({ task_id: taskId })),
    blockTask: vi.fn(),
    unblockTask: vi.fn(),
    executeTool: vi.fn(),
    getToolHost: vi.fn(),
    getPolicyEngine: vi.fn(),
  } as unknown as KernelRuntime;
}

function createMockControlPlaneSyncPort(): ControlPlaneSyncPort & {
  pushKernelEvents: ReturnType<typeof vi.fn>;
} {
  return {
    pullPolicies: vi.fn(),
    pullConfig: vi.fn(),
    pushTelemetry: vi.fn(),
    pushEvidence: vi.fn(),
    pushKernelEvents: vi.fn(async (input: PushKernelEventsInput) => ({
      accepted: input.events.length,
    })),
    authenticate: vi.fn(),
    heartbeat: vi.fn(),
  } as unknown as ControlPlaneSyncPort & {
    pushKernelEvents: ReturnType<typeof vi.fn>;
  };
}

function createSampleKernelEvent(): KernelEvent {
  return {
    schema_version: 1,
    kind: 'task_claimed',
    task_id: TASK.ID,
    timestamp: SAMPLE_TIMESTAMP,
    by: 'agent-1',
    session_id: 'session-cp-1',
  } as unknown as KernelEvent;
}

// --- Tests ---

describe('surfaces/http control plane forwarding (WU-1841)', () => {
  describe('AC1: HTTP surface pushes events to ControlPlaneSyncPort', () => {
    it('forwards subscribed events to control plane when controlPlaneSyncPort is provided', async () => {
      const runtime = createRuntimeStub();
      const controlPlane = createMockControlPlaneSyncPort();
      const dispose = vi.fn();
      let capturedCallback: ((event: KernelEvent) => void | Promise<void>) | null = null;

      const eventSubscriber = {
        subscribe: vi.fn((_filter: ReplayFilter, callback: (event: KernelEvent) => void) => {
          capturedCallback = callback;
          return { dispose } satisfies Disposable;
        }),
      };

      const options: HttpSurfaceOptions = {
        eventSubscriber,
        controlPlaneSyncPort: controlPlane,
        workspaceId: TASK.WORKSPACE_ID,
      };

      const surface = createHttpSurface(runtime, options);
      const request = createRequest({
        method: HTTP_METHOD.GET,
        url: `/events/${TASK.ID}?kind=task_claimed`,
      });
      const response = new MockResponse();

      await surface.handleRequest(
        request as IncomingMessage,
        response as unknown as ServerResponse<IncomingMessage>,
      );

      expect(capturedCallback).not.toBeNull();

      const sampleEvent = createSampleKernelEvent();
      await capturedCallback?.(sampleEvent);

      expect(controlPlane.pushKernelEvents).toHaveBeenCalledTimes(1);
      expect(controlPlane.pushKernelEvents).toHaveBeenCalledWith({
        workspace_id: TASK.WORKSPACE_ID,
        events: [sampleEvent],
      });
    });

    it('does not push events when controlPlaneSyncPort is not provided', async () => {
      const runtime = createRuntimeStub();
      let capturedCallback: ((event: KernelEvent) => void | Promise<void>) | null = null;
      const dispose = vi.fn();

      const eventSubscriber = {
        subscribe: vi.fn((_filter: ReplayFilter, callback: (event: KernelEvent) => void) => {
          capturedCallback = callback;
          return { dispose } satisfies Disposable;
        }),
      };

      const surface = createHttpSurface(runtime, { eventSubscriber });
      const request = createRequest({
        method: HTTP_METHOD.GET,
        url: `/events/${TASK.ID}?kind=task_claimed`,
      });
      const response = new MockResponse();

      await surface.handleRequest(
        request as IncomingMessage,
        response as unknown as ServerResponse<IncomingMessage>,
      );

      expect(capturedCallback).not.toBeNull();

      const sampleEvent = createSampleKernelEvent();
      await capturedCallback?.(sampleEvent);

      // No control plane interaction at all - just normal event streaming
      expect(response.body.includes(JSON.stringify(sampleEvent))).toBe(true);
    });
  });

  describe('AC2: pushKernelEvents called with correct event format', () => {
    it('sends workspace_id and event array in the correct PushKernelEventsInput format', async () => {
      const runtime = createRuntimeStub();
      const controlPlane = createMockControlPlaneSyncPort();
      let capturedCallback: ((event: KernelEvent) => void | Promise<void>) | null = null;
      const dispose = vi.fn();

      const eventSubscriber = {
        subscribe: vi.fn((_filter: ReplayFilter, callback: (event: KernelEvent) => void) => {
          capturedCallback = callback;
          return { dispose } satisfies Disposable;
        }),
      };

      const surface = createHttpSurface(runtime, {
        eventSubscriber,
        controlPlaneSyncPort: controlPlane,
        workspaceId: TASK.WORKSPACE_ID,
      });
      const request = createRequest({
        method: HTTP_METHOD.GET,
        url: `/events/${TASK.ID}`,
      });
      const response = new MockResponse();

      await surface.handleRequest(
        request as IncomingMessage,
        response as unknown as ServerResponse<IncomingMessage>,
      );

      const event = createSampleKernelEvent();
      await capturedCallback?.(event);

      const callArgs = controlPlane.pushKernelEvents.mock.calls[0]?.[0] as PushKernelEventsInput;

      expect(callArgs).toBeDefined();
      expect(callArgs.workspace_id).toBe(TASK.WORKSPACE_ID);
      expect(callArgs.events).toHaveLength(1);
      expect(callArgs.events[0]).toEqual(event);
    });

    it('preserves the original kernel event structure without mutation', async () => {
      const runtime = createRuntimeStub();
      const controlPlane = createMockControlPlaneSyncPort();
      let capturedCallback: ((event: KernelEvent) => void | Promise<void>) | null = null;
      const dispose = vi.fn();

      const eventSubscriber = {
        subscribe: vi.fn((_filter: ReplayFilter, callback: (event: KernelEvent) => void) => {
          capturedCallback = callback;
          return { dispose } satisfies Disposable;
        }),
      };

      const surface = createHttpSurface(runtime, {
        eventSubscriber,
        controlPlaneSyncPort: controlPlane,
        workspaceId: TASK.WORKSPACE_ID,
      });
      const request = createRequest({
        method: HTTP_METHOD.GET,
        url: `/events/${TASK.ID}`,
      });
      const response = new MockResponse();

      await surface.handleRequest(
        request as IncomingMessage,
        response as unknown as ServerResponse<IncomingMessage>,
      );

      const originalEvent = createSampleKernelEvent();
      const eventCopy = JSON.parse(JSON.stringify(originalEvent)) as KernelEvent;

      await capturedCallback?.(originalEvent);

      // Event was not mutated
      expect(originalEvent).toEqual(eventCopy);

      // Event was forwarded as-is
      const pushed = controlPlane.pushKernelEvents.mock.calls[0]?.[0] as PushKernelEventsInput;
      expect(pushed.events[0]).toEqual(eventCopy);
    });

    it('does not block the SSE stream when pushKernelEvents fails', async () => {
      const runtime = createRuntimeStub();
      const controlPlane = createMockControlPlaneSyncPort();
      controlPlane.pushKernelEvents.mockRejectedValueOnce(new Error('Control plane unavailable'));

      let capturedCallback: ((event: KernelEvent) => void | Promise<void>) | null = null;
      const dispose = vi.fn();

      const eventSubscriber = {
        subscribe: vi.fn((_filter: ReplayFilter, callback: (event: KernelEvent) => void) => {
          capturedCallback = callback;
          return { dispose } satisfies Disposable;
        }),
      };

      const surface = createHttpSurface(runtime, {
        eventSubscriber,
        controlPlaneSyncPort: controlPlane,
        workspaceId: TASK.WORKSPACE_ID,
      });
      const request = createRequest({
        method: HTTP_METHOD.GET,
        url: `/events/${TASK.ID}`,
      });
      const response = new MockResponse();

      await surface.handleRequest(
        request as IncomingMessage,
        response as unknown as ServerResponse<IncomingMessage>,
      );

      const event = createSampleKernelEvent();

      // Should not throw even when control plane fails
      await expect(capturedCallback?.(event)).resolves.not.toThrow();

      // SSE stream still received the event
      expect(response.body.includes(JSON.stringify(event))).toBe(true);
    });
  });

  describe('AC3: Dashboard can optionally read from control plane', () => {
    it('exports createControlPlaneEventSubscriber for dashboard use', async () => {
      const { createControlPlaneEventSubscriber } =
        await import('../http/control-plane-event-subscriber.js');
      expect(typeof createControlPlaneEventSubscriber).toBe('function');
    });

    it('createControlPlaneEventSubscriber returns an EventSubscriber compatible interface', async () => {
      const { createControlPlaneEventSubscriber } =
        await import('../http/control-plane-event-subscriber.js');

      const controlPlane = createMockControlPlaneSyncPort();
      const subscriber = createControlPlaneEventSubscriber({
        controlPlaneSyncPort: controlPlane,
        workspaceId: TASK.WORKSPACE_ID,
        pollIntervalMs: 1000,
      });

      expect(subscriber).toBeDefined();
      expect(typeof subscriber.subscribe).toBe('function');
    });
  });
});
