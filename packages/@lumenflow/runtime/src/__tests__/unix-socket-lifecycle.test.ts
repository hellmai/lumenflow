// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Tests for UnixSocketServer lifecycle and protocol handling.
 *
 * Covers:
 * - Start/stop/restart lifecycle
 * - isRunning state transitions
 * - JSON-RPC request validation
 * - Invalid JSON handling
 * - Schema validation errors
 * - Concurrent connection handling
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createConnection } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  UnixSocketServer,
  type DaemonRequest,
  type DaemonResponse,
} from '../transport/unix-socket-server.js';

describe('UnixSocketServer lifecycle', () => {
  let tempDir: string;
  let server: UnixSocketServer;

  afterEach(async () => {
    if (server?.isRunning()) {
      await server.stop();
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  async function createServer(
    handler?: (req: DaemonRequest) => Promise<DaemonResponse>,
  ): Promise<UnixSocketServer> {
    tempDir = await mkdtemp(join(tmpdir(), 'lf-socket-'));
    const socketPath = join(tempDir, 'test.sock');
    server = new UnixSocketServer({
      socketPath,
      handler: handler ?? (async (req) => ({ id: req.id, ok: true, result: 'echo' })),
    });
    return server;
  }

  function sendRequest(socketPath: string, payload: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = createConnection(socketPath);
      let buffer = '';
      socket.on('connect', () => {
        socket.write(payload + '\n');
      });
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const idx = buffer.indexOf('\n');
        if (idx >= 0) {
          socket.end();
          resolve(buffer.slice(0, idx));
        }
      });
      socket.on('error', reject);
      setTimeout(() => {
        socket.destroy();
        reject(new Error('Timed out'));
      }, 3000);
    });
  }

  it('starts and stops cleanly', async () => {
    const srv = await createServer();
    expect(srv.isRunning()).toBe(false);
    await srv.start();
    expect(srv.isRunning()).toBe(true);
    await srv.stop();
    expect(srv.isRunning()).toBe(false);
  });

  it('can restart after stop', async () => {
    const srv = await createServer();
    await srv.start();
    await srv.stop();
    expect(srv.isRunning()).toBe(false);
    await srv.start();
    expect(srv.isRunning()).toBe(true);
  });

  it('stop is idempotent when already stopped', async () => {
    const srv = await createServer();
    await srv.start();
    await srv.stop();
    await srv.stop();
    expect(srv.isRunning()).toBe(false);
  });

  it('handles a valid JSON-RPC request and returns response', async () => {
    const srv = await createServer(async (req) => ({
      id: req.id,
      ok: true,
      result: { method: req.method },
    }));
    await srv.start();

    const socketPath = join(tempDir, 'test.sock');
    const request = JSON.stringify({ id: 'req-1', method: 'ping', params: {} });
    const raw = await sendRequest(socketPath, request);
    const response = JSON.parse(raw) as DaemonResponse;
    expect(response.ok).toBe(true);
    expect(response.id).toBe('req-1');
  });

  it('returns error for invalid JSON payload', async () => {
    const srv = await createServer();
    await srv.start();

    const socketPath = join(tempDir, 'test.sock');
    const raw = await sendRequest(socketPath, 'not-json');
    const response = JSON.parse(raw) as DaemonResponse;
    expect(response.ok).toBe(false);
    expect(response.error).toContain('Invalid JSON');
  });

  it('returns error for request missing required fields', async () => {
    const srv = await createServer();
    await srv.start();

    const socketPath = join(tempDir, 'test.sock');
    const request = JSON.stringify({ id: 'req-1' });
    const raw = await sendRequest(socketPath, request);
    const response = JSON.parse(raw) as DaemonResponse;
    expect(response.ok).toBe(false);
    expect(response.id).toBe('req-1');
    expect(response.error).toContain('Invalid daemon request');
  });

  it('returns error for request with empty id', async () => {
    const srv = await createServer();
    await srv.start();

    const socketPath = join(tempDir, 'test.sock');
    const request = JSON.stringify({ id: '', method: 'test', params: {} });
    const raw = await sendRequest(socketPath, request);
    const response = JSON.parse(raw) as DaemonResponse;
    expect(response.ok).toBe(false);
  });

  it('handles multiple sequential requests on same connection', async () => {
    let callCount = 0;
    const srv = await createServer(async (req) => {
      callCount++;
      return { id: req.id, ok: true, result: callCount };
    });
    await srv.start();

    const socketPath = join(tempDir, 'test.sock');
    const responses: DaemonResponse[] = [];

    await new Promise<void>((resolve, reject) => {
      const socket = createConnection(socketPath);
      let buffer = '';
      socket.on('connect', () => {
        socket.write(JSON.stringify({ id: '1', method: 'test', params: {} }) + '\n');
        socket.write(JSON.stringify({ id: '2', method: 'test', params: {} }) + '\n');
      });
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) {
            responses.push(JSON.parse(line) as DaemonResponse);
          }
        }
        if (responses.length >= 2) {
          socket.end();
          resolve();
        }
      });
      socket.on('error', reject);
      setTimeout(() => {
        socket.destroy();
        reject(new Error('Timed out'));
      }, 3000);
    });

    expect(responses).toHaveLength(2);
    expect(responses[0]?.ok).toBe(true);
    expect(responses[1]?.ok).toBe(true);
  });
});
