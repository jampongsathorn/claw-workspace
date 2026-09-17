/**
 * Phase 2H — lifecycle hooks.
 *
 * Hooks are lifecycle INTEGRATIONS, not agents: the runtime runs a
 * configured command at a lifecycle point, passes a minimal JSON envelope
 * on stdin, and treats the bounded stdout as UNTRUSTED external content.
 *
 * Authority boundary (structural, not prompt-based):
 *  - Hook output can never grant permission, bypass read-only mode, mark
 *    completion, fabricate verification, or alter Completion Gate state:
 *    the gate consumes only machine evidence (exec exit codes, file state,
 *    denial records) — hook text is never in that channel.
 *  - Hook output reaches the model only as a clearly-marked untrusted
 *    context block (after_tool / session_start), never as system text.
 *  - Hooks never write Memory/Notes/Scratch (no state tools; the envelope
 *    is the only I/O).
 *
 * Failure semantics:
 *  - default (blocking=false): hook fails → recorded (hook_failed event) →
 *    the main run CONTINUES.
 *  - blocking=true (decided by CONFIG, never by the hook at runtime):
 *    hook fails → structured failure → bounded stop of the run.
 *
 * Isolation & bounds (reusing Phase 2G process-lifecycle primitives):
 *  - each hook runs in its own detached POSIX process group; the group is
 *    killed on timeout, spawn error, or normal exit — no orphaned hook
 *    process, ever;
 *  - timeout: AIAGENT_HOOK_TIMEOUT_MS (default 10000), clamped to
 *    AIAGENT_HOOK_TIMEOUT_MAX_MS (default 60000); per-hook `timeout_ms`
 *    is clamped the same way;
 *  - output: AIAGENT_HOOK_MAX_OUTPUT_BYTES (default 16 KiB) retained, total
 *    always accounted, truncation explicit;
 *  - environment: minimal (PATH, HOME) + the hook's explicit config env
 *    (literals or ${VAR} refs). No API keys, no full environment.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { killProcessGroup } from './shell.js';
import { expandEnv, type HookEvent, type HookSpec, type HooksConfig } from './config.js';
import type { AgentEvent } from './events.js';

export function hookLimits(): { timeoutMs: number; maxTimeoutMs: number; maxOutputBytes: number } {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
  };
  return {
    timeoutMs: num(process.env.AIAGENT_HOOK_TIMEOUT_MS, 10_000),
    maxTimeoutMs: num(process.env.AIAGENT_HOOK_TIMEOUT_MAX_MS, 60_000),
    maxOutputBytes: num(process.env.AIAGENT_HOOK_MAX_OUTPUT_BYTES, 16_384),
  };
}

export interface HookMeta {
  sessionId: string;
  /** event-specific safe metadata — never secrets, never unbounded data */
  event: HookEvent;
  tool?: string;
  ok?: boolean;
  /** bounded slice of the tool output (after_tool only) */
  output?: string;
  cwd?: string;
}

export interface HookRunResult {
  spec: HookSpec;
  ok: boolean;
  /** 'timeout' | `exit <code>` | `spawn error: <code>` — machine reason */
  reason?: string;
  durationMs: number;
  exitCode: number | null;
  /** bounded retained stdout (decoded once). */
  output: string;
  outputBytes: number;
  outputTruncated: boolean;
  blocking: boolean;
}

export function hookLabel(spec: HookSpec): string {
  return (spec.name ?? '').slice(0, 64) || `hook-${spec.command.split('/').pop() ?? 'unknown'}`;
}

/** Run ONE hook command to completion (bounded). Never throws. */
export async function runHook(spec: HookSpec, meta: HookMeta): Promise<HookRunResult> {
  const limits = hookLimits();
  const timeoutMs = Math.min(Math.max(1, spec.timeout_ms ?? limits.timeoutMs), limits.maxTimeoutMs);
  const t0 = Date.now();
  let child: ChildProcess;
  try {
    child = spawn(spec.command, spec.args ?? [], {
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...expandEnv(spec.env) },
      detached: true, // own process group — group kill on every path (2G primitive)
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  } catch (e) {
    return {
      spec,
      ok: false,
      reason: `spawn error: ${e instanceof Error ? e.message : String(e)}`,
      durationMs: Date.now() - t0,
      exitCode: null,
      output: '',
      outputBytes: 0,
      outputTruncated: false,
      blocking: spec.blocking ?? false,
    };
  }

  const envelope = JSON.stringify({
    event: meta.event,
    session: meta.sessionId,
    ...(meta.tool ? { tool: meta.tool } : {}),
    ...(typeof meta.ok === 'boolean' ? { ok: meta.ok } : {}),
    ...(typeof meta.output === 'string' ? { output: meta.output.slice(0, 4000) } : {}),
    ...(meta.cwd ? { cwd: meta.cwd } : {}),
  });

  let settled = false;
  let exitCode: number | null = null;
  let timedOut = false;
  let spawnError: string | undefined;
  const out = { chunks: [] as Buffer[], kept: 0, total: 0 };

  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (child.pid !== undefined) killProcessGroup(child.pid, 'SIGKILL'); // reap on every path
  };

  const timer = setTimeout(() => {
    timedOut = true;
    if (child.pid !== undefined) killProcessGroup(child.pid, 'SIGKILL');
  }, timeoutMs);
  timer.unref?.();

  child.stdout?.on('data', (d: Buffer) => {
    out.total += d.length;
    const remaining = limits.maxOutputBytes - out.kept;
    if (remaining > 0) {
      const take = d.subarray(0, Math.min(remaining, d.length));
      out.chunks.push(take);
      out.kept += take.length;
    }
  });
  child.on('error', (e) => {
    spawnError = String((e as NodeJS.ErrnoException).code ?? e.message);
    finish();
  });
  child.on('exit', (code) => {
    exitCode = code;
    finish();
  });

  // write the envelope, then close stdin (the hook reads one document)
  try {
    child.stdin?.write(envelope);
    child.stdin?.end();
  } catch {
    /* hook gone early — exit/error handlers settle */
  }

  // hard backstop: even if exit events never fire, the group is killed at timeout
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (settled) {
        clearInterval(check);
        resolve();
      }
    }, 25);
    // also resolve at the kill deadline (kill → exit → settle; backstop is
    // the interval above plus the timer's own kill)
    setTimeout(() => {
      clearInterval(check);
      if (!settled) {
        settled = true;
        if (child.pid !== undefined) killProcessGroup(child.pid, 'SIGKILL');
      }
      resolve();
    }, timeoutMs + 1500).unref?.();
  });
  if (!settled) {
    settled = true;
    if (child.pid !== undefined) killProcessGroup(child.pid, 'SIGKILL');
  }

  const ok = !timedOut && !spawnError && exitCode === 0;
  const reason = timedOut
    ? `timeout (${timeoutMs}ms)`
    : spawnError
      ? `spawn error: ${spawnError}`
      : exitCode !== 0 && exitCode !== null
        ? `exit ${exitCode}`
        : exitCode === null && !spawnError
          ? 'killed'
          : undefined;
  return {
    spec,
    ok,
    reason,
    durationMs: Date.now() - t0,
    exitCode,
    output: Buffer.concat(out.chunks).toString('utf8'),
    outputBytes: out.total,
    outputTruncated: out.total > out.kept,
    blocking: spec.blocking ?? false,
  };
}

/**
 * Hook runner over a parsed config. Events are invoked SEQUENTIALLY in
 * config order (deterministic; no parallelism introduced).
 */
export class HookRunner {
  constructor(private readonly hooks: HooksConfig = {}) {}

  specsFor(event: HookEvent): HookSpec[] {
    return this.hooks[event] ?? [];
  }

  hasAny(): boolean {
    return Object.values(this.hooks).some((l) => l && l.length > 0);
  }
}

export interface HookFiring {
  results: HookRunResult[];
  /** machine-observable lifecycle events (metadata only — never output content). */
  events: AgentEvent[];
}

/**
 * Fire every hook registered for `event`, SEQUENTIALLY in config order.
 * Never throws: every failure is captured in the result and surfaced as a
 * machine-observable event. Authority consequences (blocking → bounded stop;
 * non-blocking → continue) are decided by the CALLER from the results — the
 * runner itself only reports.
 */
export async function fireHooks(
  hooks: HookRunner | undefined,
  event: HookEvent,
  meta: Omit<HookMeta, 'event'>,
): Promise<HookFiring> {
  if (!hooks) return { results: [], events: [] };
  // disabled hooks (config-decided) are skipped deterministically — no events
  const specs = hooks.specsFor(event).filter((s) => s.enabled !== false);
  if (specs.length === 0) return { results: [], events: [] };
  const results: HookRunResult[] = [];
  const events: AgentEvent[] = [];
  for (const spec of specs) {
    const label = hookLabel(spec);
    events.push({ type: 'hook_started', hook: label, event });
    const r = await runHook(spec, { ...meta, event });
    results.push(r);
    if (r.ok) {
      events.push({
        type: 'hook_completed',
        hook: label,
        event,
        durationMs: r.durationMs,
        exitCode: r.exitCode,
        outputBytes: r.outputBytes,
        outputTruncated: r.outputTruncated,
      });
    } else {
      events.push({
        type: 'hook_failed',
        hook: label,
        event,
        reason: (r.reason ?? 'failed').slice(0, 300),
        durationMs: r.durationMs,
        blocking: r.blocking,
      });
    }
  }
  return { results, events };
}
