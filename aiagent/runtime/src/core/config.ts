/**
 * Phase 2H — minimal deterministic configuration for MCP servers and hooks.
 *
 * Sources (workspace extends global, per top-level key):
 *   <cwd>/.aiagent.json          (workspace — wins)
 *   $AIAGENT_HOME/aiagent.json   (global)
 *
 * Shape (all optional):
 *   {
 *     "mcp": { "servers": {
 *       "<id>": { "transport": "stdio", // only stdio is implemented
 *                 "command": "npx", "args": ["..."], "env": {"K": "${REF}"},
 *                 "enabled": true,
 *                 "tools": { "allow": ["x"], "deny": ["y"] } }
 *     } },
 *     "hooks": { "session_start": [ { "name": "h", "command": "bash", "args": [...],
 *                 "env": {...}, "timeout_ms": 5000, "blocking": false,
 *                 "enabled": true } ] }
 *   }
 *
 * Security rules (enforced here, not in prompts):
 *  - `env` values are either literals from the user's own config file or
 *    `${VAR}` references expanded from the process environment at spawn
 *    time. References are preferred for secrets: the config file then never
 *    contains the secret value itself.
 *  - env values are NEVER copied into events, logs, or error messages by
 *    this module or its consumers (they are passed only to child spawns).
 *  - A malformed config never crashes the runtime: the affected server /
 *    hook is marked unavailable with a structured failure.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  /** Only `stdio` is implemented (the minimal client); anything else is a config problem. */
  transport?: 'stdio';
  tools?: { allow?: string[]; deny?: string[] };
}
export interface McpConfig {
  servers: Record<string, McpServerConfig>;
}
export interface HookSpec {
  name?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeout_ms?: number;
  /** Config-decided (never runtime-decided): a failing blocking hook stops the run. */
  blocking?: boolean;
  /** Disabled hooks are skipped deterministically (no events). */
  enabled?: boolean;
}
export type HookEvent = 'session_start' | 'before_tool' | 'after_tool' | 'before_completion' | 'session_end';
export interface HooksConfig {
  session_start?: HookSpec[];
  before_tool?: HookSpec[];
  after_tool?: HookSpec[];
  before_completion?: HookSpec[];
  session_end?: HookSpec[];
}
export interface AgentConfig {
  mcp: McpConfig;
  hooks: HooksConfig;
}

const HOOK_EVENTS: HookEvent[] = ['session_start', 'before_tool', 'after_tool', 'before_completion', 'session_end'];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Expand `${VAR}` references from the process environment. Unknown refs expand to ''. */
export function expandEnv(refs: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!refs) return out;
  for (const [k, v] of Object.entries(refs)) {
    if (typeof v !== 'string') continue;
    out[k] = v.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => process.env[name] ?? '');
  }
  return out;
}

function parseMcpServers(raw: unknown, problems: string[]): Record<string, McpServerConfig> {
  const servers: Record<string, McpServerConfig> = {};
  if (!isPlainObject(raw)) {
    if (raw !== undefined) problems.push('mcp.servers must be an object');
    return servers;
  }
  for (const [id, sc] of Object.entries(raw)) {
    // safe identifier: leading letter, then [A-Za-z0-9_-]; becomes part of the
    // provider-safe tool name `mcp.<id>.<tool>`
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id)) {
      problems.push(`mcp server id ${JSON.stringify(id)} is not a safe identifier (skipped)`);
      continue;
    }
    if (!isPlainObject(sc) || typeof sc.command !== 'string' || !sc.command.trim()) {
      problems.push(`mcp server ${id}: missing "command" (skipped)`);
      continue;
    }
    if (sc.transport !== undefined && sc.transport !== 'stdio') {
      // the minimal client implements stdio only; be explicit, don't guess
      problems.push(`mcp server ${id}: unsupported transport ${JSON.stringify(String(sc.transport))} — only "stdio" (skipped)`);
      continue;
    }
    const tools = isPlainObject(sc.tools)
      ? {
          ...(Array.isArray(sc.tools.allow) ? { allow: (sc.tools.allow as unknown[]).filter((x) => typeof x === 'string') as string[] } : {}),
          ...(Array.isArray(sc.tools.deny) ? { deny: (sc.tools.deny as unknown[]).filter((x) => typeof x === 'string') as string[] } : {}),
        }
      : undefined;
    servers[id] = {
      command: sc.command,
      ...(Array.isArray(sc.args) ? { args: (sc.args as unknown[]).filter((x) => typeof x === 'string') as string[] } : {}),
      ...(isPlainObject(sc.env) ? { env: Object.fromEntries(Object.entries(sc.env).filter(([, v]) => typeof v === 'string')) as Record<string, string> } : {}),
      ...(typeof sc.enabled === 'boolean' ? { enabled: sc.enabled } : {}),
      ...(sc.transport === 'stdio' ? { transport: 'stdio' as const } : {}),
      ...(tools && (tools.allow?.length || tools.deny?.length) ? { tools } : {}),
    };
  }
  return servers;
}

function parseHookList(raw: unknown, problems: string[]): HookSpec[] {
  if (!Array.isArray(raw)) {
    if (raw !== undefined) problems.push('hooks must be arrays of hook specs');
    return [];
  }
  const out: HookSpec[] = [];
  raw.forEach((h, i) => {
    if (!isPlainObject(h) || typeof h.command !== 'string' || !h.command.trim()) {
      problems.push(`hook[${i}]: missing "command" (skipped)`);
      return;
    }
    out.push({
      ...(typeof h.name === 'string' && h.name ? { name: h.name.slice(0, 64) } : {}),
      command: h.command,
      ...(Array.isArray(h.args) ? { args: (h.args as unknown[]).filter((x) => typeof x === 'string') as string[] } : {}),
      ...(isPlainObject(h.env) ? { env: Object.fromEntries(Object.entries(h.env).filter(([, v]) => typeof v === 'string')) as Record<string, string> } : {}),
      ...(typeof h.timeout_ms === 'number' && Number.isFinite(h.timeout_ms) && h.timeout_ms > 0 ? { timeout_ms: Math.floor(h.timeout_ms) } : {}),
      ...(typeof h.blocking === 'boolean' ? { blocking: h.blocking } : {}),
      ...(typeof h.enabled === 'boolean' ? { enabled: h.enabled } : {}),
    });
  });
  return out;
}

/** Parse + validate one config document. Never throws; problems are returned. */
export function parseAgentConfig(doc: unknown, problems: string[]): AgentConfig {
  const mcp: McpConfig = { servers: {} };
  const hooks: HooksConfig = {};
  if (doc !== undefined && !isPlainObject(doc)) {
    problems.push('config root must be an object');
    return { mcp, hooks };
  }
  if (doc) {
    if (doc.mcp !== undefined) {
      const m = isPlainObject(doc.mcp) ? doc.mcp.servers : undefined;
      Object.assign(mcp.servers, parseMcpServers(m, problems));
    }
    if (doc.hooks !== undefined) {
      if (!isPlainObject(doc.hooks)) {
        problems.push('hooks must be an object');
      } else {
        for (const ev of HOOK_EVENTS) {
          if (doc.hooks[ev] !== undefined) hooks[ev] = parseHookList(doc.hooks[ev], problems);
        }
      }
    }
  }
  return { mcp, hooks };
}

function readJson(file: string, problems: string[]): unknown {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    // a missing config file is the NORMAL case (no MCP, no hooks) — silent
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    problems.push(`config ${path.basename(file)}: unreadable (${String((e as NodeJS.ErrnoException).code ?? 'io error')})`);
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    problems.push(`config ${path.basename(file)}: invalid JSON (ignored)`);
    return undefined;
  }
}

/**
 * Load the merged config: global ($AIAGENT_HOME/aiagent.json) then workspace
 * (<cwd>/.aiagent.json); per-server and per-event the workspace wins.
 * Config problems never throw — they are returned for structured reporting.
 */
export function loadAgentConfig(cwd: string, home: string): { config: AgentConfig; problems: string[] } {
  const problems: string[] = [];
  const global = readJson(path.join(home, 'aiagent.json'), problems);
  const workspace = readJson(path.join(cwd, '.aiagent.json'), problems);
  const base = parseAgentConfig(global, problems);
  const over = parseAgentConfig(workspace, problems);
  const config: AgentConfig = {
    mcp: { servers: { ...base.mcp.servers, ...over.mcp.servers } },
    hooks: {
      ...(base.hooks.session_start ?? over.hooks.session_start ? { session_start: over.hooks.session_start ?? base.hooks.session_start } : {}),
      ...(base.hooks.before_tool ?? over.hooks.before_tool ? { before_tool: over.hooks.before_tool ?? base.hooks.before_tool } : {}),
      ...(base.hooks.after_tool ?? over.hooks.after_tool ? { after_tool: over.hooks.after_tool ?? base.hooks.after_tool } : {}),
      ...(base.hooks.before_completion ?? over.hooks.before_completion ? { before_completion: over.hooks.before_completion ?? base.hooks.before_completion } : {}),
      ...(base.hooks.session_end ?? over.hooks.session_end ? { session_end: over.hooks.session_end ?? base.hooks.session_end } : {}),
    },
  };
  return { config, problems };
}
