// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { randomUUID } from 'crypto';
import { readFile, writeFile, mkdir, unlink, access } from 'node:fs/promises';
import { join } from 'path';
import { simpleGit } from 'simple-git';
import { appendIncident } from './agent-incidents.js';
import { PATTERNS, INCIDENT_SEVERITY, LUMENFLOW_PATHS } from '@lumenflow/core/wu-constants';
import { createError, ErrorCodes } from '@lumenflow/core/error-handler';

const SESSION_DIR = LUMENFLOW_PATHS.SESSIONS;
const SESSION_FILE = join(SESSION_DIR, 'current.json');
const DEFAULT_AGENT_VERSION = 'unknown';
const DEFAULT_HOST_ID = 'unknown';
const DEFAULT_AGENT_CAPABILITIES = ['session_lifecycle', 'incident_logging'] as const;
const AGENT_CAPABILITIES_ENV = 'LUMENFLOW_AGENT_CAPABILITIES';
const AGENT_VERSION_ENV = 'LUMENFLOW_AGENT_VERSION';

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseCapabilities(rawValue: string | undefined): string[] {
  if (!rawValue) {
    return [...DEFAULT_AGENT_CAPABILITIES];
  }

  const parsed = rawValue
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return parsed.length > 0 ? parsed : [...DEFAULT_AGENT_CAPABILITIES];
}

/**
 * Session data structure
 */
interface SessionData {
  session_id: string;
  wu_id: string;
  lane: string;
  started: string;
  completed?: string;
  agent_type: string;
  client_type: string;
  capabilities: string[];
  agent_version: string;
  host_id: string;
  context_tier: number;
  incidents_logged: number;
  incidents_major: number;
}

function normalizeSessionData(session: SessionData): SessionData {
  return {
    ...session,
    client_type: session.client_type ?? session.agent_type,
    capabilities: Array.isArray(session.capabilities)
      ? session.capabilities.filter((entry): entry is string => typeof entry === 'string')
      : [...DEFAULT_AGENT_CAPABILITIES],
    agent_version: session.agent_version ?? DEFAULT_AGENT_VERSION,
    host_id: session.host_id ?? DEFAULT_HOST_ID,
  };
}

/**
 * Start a new agent session
 * @param wuId - WU ID (e.g., "WU-1234")
 * @param tier - Context tier from bootloader
 * @param agentType - Agent type (default: "claude-code")
 * @returns session_id
 * @throws {Error} if session already active or WU format invalid
 */
export async function startSession(
  wuId: string,
  tier: 1 | 2 | 3,
  agentType: string = 'claude-code',
): Promise<string> {
  // Check for existing session
  const sessionExists = await access(SESSION_FILE)
    .then(() => true)
    .catch(() => false);
  if (sessionExists) {
    const content = await readFile(SESSION_FILE, { encoding: 'utf-8' });
    const existing = JSON.parse(content) as SessionData;
    throw createError(
      ErrorCodes.SESSION_ERROR,
      `Session ${existing.session_id} already active for ${existing.wu_id}. ` +
        `Run 'pnpm agent:session:end' first.`,
    );
  }

  // Validate WU ID format
  if (!PATTERNS.WU_ID.test(wuId)) {
    throw createError(
      ErrorCodes.INVALID_WU_ID,
      `Invalid WU ID format: ${wuId}. Must match WU-XXX.`,
    );
  }

  // Validate tier
  if (![1, 2, 3].includes(tier)) {
    throw createError(
      ErrorCodes.VALIDATION_ERROR,
      `Invalid context tier: ${tier}. Must be 1, 2, or 3.`,
    );
  }

  // Auto-detect lane from git branch if possible
  const git = simpleGit();
  let lane = 'Unknown';
  try {
    const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
    // Parse lane from branch name: lane/<lane>/wu-xxx → <lane>
    const match = branch.match(/^lane\/([^/]+)\//);
    if (match && match[1]) {
      lane = match[1]
        .split('-')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(': ');
    }
  } catch {
    // Fallback: lane stays "Unknown"
  }

  const sessionId = randomUUID();
  const capabilities = parseCapabilities(asNonEmptyString(process.env[AGENT_CAPABILITIES_ENV]));
  const agentVersion = asNonEmptyString(process.env[AGENT_VERSION_ENV]) ?? DEFAULT_AGENT_VERSION;
  const hostId =
    asNonEmptyString(process.env.HOSTNAME) ??
    asNonEmptyString(process.env.COMPUTERNAME) ??
    DEFAULT_HOST_ID;
  const session: SessionData = {
    session_id: sessionId,
    wu_id: wuId,
    lane,
    started: new Date().toISOString(),
    agent_type: agentType,
    client_type: agentType,
    capabilities,
    agent_version: agentVersion,
    host_id: hostId,
    context_tier: tier,
    incidents_logged: 0,
    incidents_major: 0,
  };

  // Ensure directory exists
  const dirExists = await access(SESSION_DIR)
    .then(() => true)
    .catch(() => false);
  if (!dirExists) {
    await mkdir(SESSION_DIR, { recursive: true });
  }

  await writeFile(SESSION_FILE, JSON.stringify(session, null, 2));
  return sessionId;
}

/**
 * Get the current active session
 * @returns Session state or null if no active session
 */
export async function getCurrentSession(): Promise<SessionData | null> {
  const sessionExists = await access(SESSION_FILE)
    .then(() => true)
    .catch(() => false);
  if (!sessionExists) return null;
  const content = await readFile(SESSION_FILE, { encoding: 'utf-8' });
  return normalizeSessionData(JSON.parse(content) as SessionData);
}

/**
 * Incident data input type
 */
interface IncidentDataInput {
  category: string;
  severity: string;
  title: string;
  description: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Log an incident and update session counters
 * @param incidentData - Incident data (category, severity, title, description, etc.)
 * @throws {Error} if no active session
 */
export async function logIncident(incidentData: IncidentDataInput): Promise<void> {
  const session = await getCurrentSession();
  if (!session) {
    throw createError(
      ErrorCodes.SESSION_ERROR,
      'No active session. Run: pnpm agent:session start --wu WU-XXX --tier N',
    );
  }

  // Get current git context
  const git = simpleGit();
  let gitBranch = 'unknown';
  try {
    gitBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
  } catch {
    // Ignore git errors
  }

  // Build full incident record
  const incident = {
    timestamp: new Date().toISOString(),
    session_id: session.session_id,
    wu_id: session.wu_id,
    lane: session.lane,
    ...incidentData,
    context: {
      git_branch: gitBranch,
      ...(incidentData.context ?? {}),
    },
  };

  // Append to NDJSON (will validate)
  appendIncident(incident);

  // Update session counters
  session.incidents_logged++;
  if (
    incident.severity === INCIDENT_SEVERITY.MAJOR ||
    incident.severity === INCIDENT_SEVERITY.BLOCKER
  ) {
    session.incidents_major++;
  }
  await writeFile(SESSION_FILE, JSON.stringify(session, null, 2));
}

/**
 * Session summary returned after ending a session
 */
interface SessionSummary {
  wu_id: string;
  lane: string;
  session_id: string;
  started: string;
  completed: string;
  agent_type: string;
  client_type: string;
  capabilities: string[];
  agent_version: string;
  host_id: string;
  context_tier: number;
  incidents_logged: number;
  incidents_major: number;
}

/**
 * End the current session and return summary
 * @returns Session summary for appending to WU YAML
 * @throws {Error} if no active session
 */
export async function endSession(): Promise<SessionSummary> {
  const session = await getCurrentSession();
  if (!session) {
    throw createError(ErrorCodes.SESSION_ERROR, 'No active session to end.');
  }

  // Finalize session
  session.completed = new Date().toISOString();

  // Clean up session file
  await unlink(SESSION_FILE);

  // Return session object for WU YAML
  return {
    wu_id: session.wu_id,
    lane: session.lane,
    session_id: session.session_id,
    started: session.started,
    completed: session.completed,
    agent_type: session.agent_type,
    client_type: session.client_type,
    capabilities: [...session.capabilities],
    agent_version: session.agent_version,
    host_id: session.host_id,
    context_tier: session.context_tier,
    incidents_logged: session.incidents_logged,
    incidents_major: session.incidents_major,
    // artifacts can be added manually later
  };
}
