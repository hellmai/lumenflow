// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

export interface HeartbeatHealth {
  busy?: boolean;
  stalled?: boolean;
  last_progress_at?: string;
}

export interface HeartbeatAssignment {
  wu_id: string;
  action: 'claim' | 'continue' | 'abort';
  hint?: string;
}

export interface AgentHeartbeatInput {
  workspace_id: string;
  session_id: string;
  agent_id?: string;
  wu_id?: string;
  health?: HeartbeatHealth;
}

export interface AgentHeartbeatResult {
  status: 'ok';
  server_time: string;
  next_heartbeat_ms?: number;
  assignment?: HeartbeatAssignment;
  budget_remaining_usd?: number;
  coalesced_signals?: number;
}

export interface AgentHeartbeatPort {
  heartbeat(input: AgentHeartbeatInput): Promise<AgentHeartbeatResult>;
}

export interface HeartbeatManagerOptions {
  maxAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  sleepFn?: (delayMs: number) => Promise<void>;
  logger?: Pick<Console, 'warn'>;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_BACKOFF_MS = 500;
const DEFAULT_MAX_BACKOFF_MS = 30_000;

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Enforces single-flight heartbeat execution and coalesces concurrent signals
 * into one follow-up heartbeat, with retry/backoff on transient failures.
 */
export class HeartbeatManager {
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly sleepFn: (delayMs: number) => Promise<void>;
  private readonly logger?: Pick<Console, 'warn'>;

  private inFlight: Promise<AgentHeartbeatResult> | null = null;
  private queuedInput: AgentHeartbeatInput | null = null;
  private queuedSignals = 0;
  private consecutiveFailures = 0;

  public constructor(
    private readonly port: AgentHeartbeatPort,
    options: HeartbeatManagerOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.baseBackoffMs = options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
    this.maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    this.sleepFn = options.sleepFn ?? defaultSleep;
    this.logger = options.logger;
  }

  public async heartbeat(input: AgentHeartbeatInput): Promise<AgentHeartbeatResult> {
    if (this.inFlight) {
      this.queuedInput = input;
      this.queuedSignals += 1;
      return this.inFlight;
    }

    const request = this.drainQueue(input);
    this.inFlight = request;
    try {
      return await request;
    } finally {
      this.inFlight = null;
    }
  }

  public getState(): {
    inFlight: boolean;
    queuedSignals: number;
    consecutiveFailures: number;
  } {
    return {
      inFlight: this.inFlight !== null,
      queuedSignals: this.queuedSignals,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  private async drainQueue(initialInput: AgentHeartbeatInput): Promise<AgentHeartbeatResult> {
    let currentInput = initialInput;
    let localCoalescedSignals = 0;

    while (true) {
      const result = await this.sendWithRetry(currentInput);
      const queuedInput = this.queuedInput;
      localCoalescedSignals += this.queuedSignals;
      this.queuedInput = null;
      this.queuedSignals = 0;

      if (!queuedInput) {
        const mergedCoalesced = (result.coalesced_signals ?? 0) + localCoalescedSignals;
        if (mergedCoalesced > 0) {
          return {
            ...result,
            coalesced_signals: mergedCoalesced,
          };
        }
        return result;
      }

      currentInput = queuedInput;
    }
  }

  private async sendWithRetry(input: AgentHeartbeatInput): Promise<AgentHeartbeatResult> {
    let attempt = 0;

    while (true) {
      try {
        const result = await this.port.heartbeat(input);
        this.consecutiveFailures = 0;
        return result;
      } catch (error) {
        this.consecutiveFailures += 1;
        attempt += 1;

        if (attempt >= this.maxAttempts) {
          throw error;
        }

        const delayMs = this.getBackoffDelayMs();
        this.logger?.warn?.(
          `[agent:heartbeat] attempt ${attempt} failed; retrying in ${delayMs}ms`,
        );
        await this.sleepFn(delayMs);
      }
    }
  }

  private getBackoffDelayMs(): number {
    const exponent = Math.max(0, this.consecutiveFailures - 1);
    return Math.min(this.baseBackoffMs * 2 ** exponent, this.maxBackoffMs);
  }
}
