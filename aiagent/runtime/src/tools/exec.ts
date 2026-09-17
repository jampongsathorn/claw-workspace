import type { Tool } from './registry.js';
import { runShell, execLimits, type ShellResult } from '../core/shell.js';
import { classifyShellCommand } from '../core/mutation.js';

/**
 * Phase 2G — shell execution, hardened.
 *
 * Lifecycle: gated (PermissionGate) → spawn in own process group → bounded
 * output (per-stream byte cap, total accounting) → machine state
 * (completed | timed_out | cancelled | killed | failed) → Phase 2C
 * classification (timeout/cancel/kill are deterministic — never retried).
 *
 * Output signatures kept stable for the Completion Gate + classifier:
 * success/failure start with `exit <code>`; timeouts start with
 * `timeout after <ms>ms`; cancellations with `cancelled after <ms>ms`.
 *
 * The model may request `timeout_ms`; the harness clamps it to
 * AIAGENT_EXEC_TIMEOUT_MAX_MS (default 600s). The model cannot raise the
 * cap. Process group is killed on EVERY termination path — no orphans.
 */
export interface ExecEvidence {
  state: 'completed' | 'timed_out' | 'cancelled' | 'killed' | 'failed';
  exitCode: number | null;
  signal?: string;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  stdoutBytes: number;
  stderrBytes: number;
  /** conservative mutation classification of the command (Phase 2G). */
  mutation?: 'read_only' | 'mutating' | 'unknown';
  error?: string;
}

function render(r: ShellResult): { ok: boolean; output: string; body: string } {
  const body = [
    r.stdout.trim(),
    r.stderr.trim() ? `stderr:\n${r.stderr.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n') || '(no output)';
  const trunc: string[] = [];
  if (r.stdoutTruncated) trunc.push(`stdout truncated: ${r.stdoutKeptBytes} of ${r.stdoutBytes} bytes retained`);
  if (r.stderrTruncated) trunc.push(`stderr truncated: ${r.stderrKeptBytes} of ${r.stderrBytes} bytes retained`);
  const note = trunc.length ? `\n[output limited — ${trunc.join('; ')}; re-run with narrower scope if more is needed]` : '';
  switch (r.state) {
    case 'timed_out':
      return {
        ok: false,
        output: `timeout after ${r.durationMs}ms (process group killed at the deadline — not a completed result)\n${body}${note}`,
        body,
      };
    case 'cancelled':
      return {
        ok: false,
        output: `cancelled after ${r.durationMs}ms (harness cancellation — partial output below is NOT a completed result)\n${body}${note}`,
        body,
      };
    case 'killed':
      return { ok: false, output: `killed by ${r.signal ?? 'signal'} (exit null)\n${body}${note}`, body };
    case 'failed':
      return { ok: false, output: `exec failed: ${r.error ?? 'spawn error'}\n${body}`, body };
    default:
      return { ok: r.exitCode === 0, output: `exit ${r.exitCode}\n${body}${note}`, body };
  }
}

export function makeExecTool(): Tool {
  return {
    name: 'exec',
    description:
      'Execute a shell command in the working directory (fresh shell per call; cwd/env do not persist). ' +
      'Prefer non-interactive flags (-y, --ci, --no-pager). ' +
      'Timeout in milliseconds (harness default 120000, hard cap 600000 — the cap cannot be raised by a tool call). ' +
      'Use for builds, tests, git, and anything that needs the shell.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to run' },
        description: { type: 'string', description: 'Short active-voice description of what the command does' },
        timeout_ms: { type: 'number', description: 'Optional timeout in milliseconds (clamped to the harness cap)' },
      },
      required: ['command'],
      additionalProperties: false,
    },
    readOnly: false,
    async execute(input, ctx) {
      const command = String(input.command ?? '');
      if (!command.trim()) return { ok: false, output: 'empty command', exitCode: null };
      const limits = execLimits();
      const timeout = Math.min(Math.max(1, Number(input.timeout_ms ?? limits.defaultTimeoutMs) || limits.defaultTimeoutMs), limits.maxTimeoutMs);
      const mutation = classifyShellCommand(command);
      const handle = runShell(command, { cwd: ctx.cwd, timeoutMs: timeout, maxOutputBytes: limits.maxOutputBytes });
      const r = await handle.promise;
      const { ok, output } = render(r);
      const exec: ExecEvidence = {
        state: r.state,
        exitCode: r.exitCode,
        ...(r.signal ? { signal: r.signal } : {}),
        durationMs: r.durationMs,
        timedOut: r.timedOut,
        cancelled: r.cancelled,
        stdoutTruncated: r.stdoutTruncated,
        stderrTruncated: r.stderrTruncated,
        stdoutBytes: r.stdoutBytes,
        stderrBytes: r.stderrBytes,
        mutation: mutation.verdict,
        ...(r.error ? { error: r.error } : {}),
      };
      return { ok, output, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, exec };
    },
  };
}
