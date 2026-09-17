/**
 * Phase 2G — bounded shell execution engine.
 *
 * Invariant: a terminated agent execution must not leave uncontrolled
 * descendant processes behind. On POSIX (the v1 floor: macOS/Linux) the
 * command runs in its OWN process group (`detached: true` → PGID = child pid);
 * every termination path (normal exit, timeout, cancellation, spawn error)
 * kills the whole group, so backgrounded grandchildren cannot outlive the
 * tool call. Commands that genuinely need long-lived daemons must fully
 * detach themselves (setsid) — the harness does not support background
 * daemons (documented limitation).
 *
 * Output is BOUNDED per stream (retained = first `maxOutputBytes` bytes;
 * TOTAL bytes always accounted). Retained bytes are decoded once at
 * finalization, so multi-byte sequences stay intact except possibly one
 * U+FFFD at the truncation cut point.
 *
 * Cancellation is injectable programmatically (`handle.cancel()`); the CLI
 * does not wire interactive cancellation yet (deferred, documented) — the
 * primitive and its semantics are tested directly.
 *
 * Machine states (exactly one): completed | timed_out | cancelled | killed |
 * failed. `completed` includes non-zero exit (the exit code is the evidence);
 * `killed` = terminated by a signal without harness timeout/cancel; `failed`
 * = spawn-level failure.
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

export type ShellState = 'completed' | 'timed_out' | 'cancelled' | 'killed' | 'failed';

export interface ShellResult {
  state: ShellState;
  exitCode: number | null;
  signal?: string;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  /** bounded retained stdout (first maxOutputBytes bytes, decoded). */
  stdout: string;
  /** bounded retained stderr. */
  stderr: string;
  /** TOTAL observed bytes (beyond the retained cap) — never silently lost. */
  stdoutBytes: number;
  stderrBytes: number;
  /** retained bytes (the kept prefix). */
  stdoutKeptBytes: number;
  stderrKeptBytes: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  /** spawn-level error (e.g. shell missing) — state 'failed'. */
  error?: string;
}

export interface ShellOptions {
  cwd: string;
  /** deadline in ms (harness-clamped before the call). */
  timeoutMs: number;
  /** per-stream retained-output cap in bytes (harness-controlled). */
  maxOutputBytes: number;
  env?: NodeJS.ProcessEnv;
}

export interface ShellHandle {
  /** Bounded cancellation: kill the process group NOW, keep partial output. */
  cancel(): void;
  promise: Promise<ShellResult>;
}

const POST_EXIT_KILL_GRACE_MS = 2500; // watchdog: finalize even if pipes never EOF

export function killProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal); // group kill (POSIX); throws ENOENT if already gone
  } catch {
    try {
      process.kill(pid, signal); // fallback: the shell itself
    } catch {
      /* already dead */
    }
  }
}

/**
 * Deterministic shell: bash is a v1 floor dependency (macOS/Linux). We do NOT
 * honor $SHELL — it may carry flags (`/bin/bash -l`) or point at a shell with
 * different syntax, and the model writes bash.
 */
const SHELL = '/bin/bash';

export function runShell(command: string, opts: ShellOptions): ShellHandle {
  const startedAt = Date.now();
  let state: ShellState = 'completed';
  let timedOut = false;
  let cancelled = false;
  let settled = false;
  let exitCode: number | null = null;
  let signal: NodeJS.Signals | null = null;
  let spawnError: string | undefined;
  let resolvePromise!: (r: ShellResult) => void;
  const promise = new Promise<ShellResult>((resolve) => {
    resolvePromise = resolve;
  });

  const out = { chunks: [] as Buffer[], kept: 0, total: 0 };
  const err = { chunks: [] as Buffer[], kept: 0, total: 0 };

  const onStream = (sink: typeof out) => (chunk: Buffer) => {
    sink.total += chunk.length;
    const remaining = opts.maxOutputBytes - sink.kept;
    if (remaining > 0) {
      const take = chunk.subarray(0, Math.min(remaining, chunk.length));
      sink.chunks.push(take);
      sink.kept += take.length;
    }
  };

  const result = (): ShellResult => ({
    state,
    exitCode,
    ...(signal ? { signal: String(signal) } : {}),
    durationMs: Date.now() - startedAt,
    timedOut,
    cancelled,
    stdout: Buffer.concat(out.chunks).toString('utf8'),
    stderr: Buffer.concat(err.chunks).toString('utf8'),
    stdoutBytes: out.total,
    stderrBytes: err.total,
    stdoutKeptBytes: out.kept,
    stderrKeptBytes: err.kept,
    // truncated iff bytes were actually dropped (total > retained)
    stdoutTruncated: out.total > out.kept,
    stderrTruncated: err.total > err.kept,
    ...(spawnError ? { error: spawnError } : {}),
  });

  const finalize = (): void => {
    if (settled) return;
    settled = true;
    resolvePromise(result());
  };

  let child: ChildProcess;
  try {
    child = spawn(SHELL, ['-c', command], {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      detached: true, // own process group (POSIX v1 floor) — group kill on every path
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    state = 'failed';
    spawnError = String(e);
    finalize();
    return { cancel() {}, promise };
  }

  const watchdog = (): void => {
    setTimeout(() => finalize(), POST_EXIT_KILL_GRACE_MS).unref?.();
  };

  const timeoutTimer = setTimeout(() => {
    if (settled) return;
    state = 'timed_out';
    timedOut = true;
    killProcessGroup(child.pid!, 'SIGKILL');
    watchdog();
  }, opts.timeoutMs);
  // hard backstop: the promise must always settle
  setTimeout(() => finalize(), opts.timeoutMs + POST_EXIT_KILL_GRACE_MS + 1000).unref?.();

  child.stdout?.on('data', onStream(out));
  child.stderr?.on('data', onStream(err));
  child.on('error', (e) => {
    spawnError = String(e);
    if (!timedOut && !cancelled) state = 'failed';
    clearTimeout(timeoutTimer);
    finalize();
  });
  child.on('exit', (code, sig) => {
    exitCode = code;
    signal = sig;
    if (!timedOut && !cancelled && sig) state = 'killed'; // signal-terminated (e.g. OOM), not by us
    // reap backgrounded descendants: the shell is done — nothing in the group
    // may outlive this execution (safe no-op when the group is already gone).
    killProcessGroup(child.pid!, 'SIGKILL');
    clearTimeout(timeoutTimer);
    watchdog();
  });
  child.on('close', () => finalize());

  return {
    cancel() {
      if (settled || cancelled) return;
      state = 'cancelled';
      cancelled = true;
      killProcessGroup(child.pid!, 'SIGKILL');
      clearTimeout(timeoutTimer);
      watchdog();
    },
    promise,
  };
}

/**
 * Exec limits — env-overridable (the runtime's existing configuration
 * mechanism), harness-controlled. The model may request `timeout_ms` but it
 * is clamped to `maxTimeoutMs`; the model cannot raise the cap.
 */
export function execLimits(): { defaultTimeoutMs: number; maxTimeoutMs: number; maxOutputBytes: number } {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    defaultTimeoutMs: num(process.env.AIAGENT_EXEC_TIMEOUT_MS, 120_000),
    maxTimeoutMs: num(process.env.AIAGENT_EXEC_TIMEOUT_MAX_MS, 600_000),
    maxOutputBytes: num(process.env.AIAGENT_EXEC_MAX_OUTPUT_BYTES, 102_400),
  };
}
