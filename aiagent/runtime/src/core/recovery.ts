/**
 * Phase 2C — Bounded recovery: failure classification + harness-owned retry
 * budget. "Model reasons. Harness controls recovery."
 *
 * When a tool call fails, the harness classifies the failure from machine
 * evidence (exit codes, output signatures, permission decisions — never model
 * prose) and may perform a BOUNDED automatic retry for genuinely transient
 * failures. The budget is explicit, deterministic, observable, per-run, and
 * impossible for model prose to increase. The Completion Gate (Phase 2A)
 * remains the sole completion authority; recovery only feeds it evidence.
 */
import { createHash } from 'node:crypto';

export type FailureClass =
  | 'transient'              // retryable: connection reset / refused / timed out
  | 'deterministic'          // same input will fail again (nonzero exit, timeout, tool error)
  | 'permission_denied'      // harness permission decision (never retried)
  | 'missing_capability'     // binary/command does not exist (exit 127, ENOENT)
  | 'unavailable_dependency' // external dependency unreachable (DNS, network down)
  | 'malformed_request'      // the request itself is broken (unknown tool, empty/invalid input)
  | 'repeated_identical';    // loop-detected synthetic failure

export interface FailureInfo {
  classification: FailureClass;
  retryable: boolean;
}

export interface ClassifyInput {
  ok: boolean;
  output: string;
  /** how the failure was produced (loop-side knowledge, not prose) */
  kind: 'exec' | 'tool_error' | 'denied' | 'unknown_tool' | 'loop_detected' | 'other';
  exitCode?: number | null;
}

const MISSING_CAPABILITY_RE = /ENOENT|command not found|^exit 127(\n|$)/m;
const UNAVAILABLE_DEP_RE = /ENOTFOUND|EAI_AGAIN|getaddrinfo|ENETUNREACH|network (is )?unreachable|Could not resolve host/i;
const TRANSIENT_RE =
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|Connection reset by peer|Operation timed out|fetch failed|timed? ?out/i;

/**
 * Deterministic failure classification. First matching rule wins.
 * Priority: harness-decision classes (denial / loop / unknown tool / usage
 * error) > exec kill/timeout > capability (binary missing) > persistent
 * network (unavailable dependency) > transient network (retryable) >
 * deterministic default. Signature rules apply to every tool, not just exec.
 */
export function classifyFailure(f: ClassifyInput): FailureInfo {
  if (f.kind === 'denied') return { classification: 'permission_denied', retryable: false };
  if (f.kind === 'loop_detected') return { classification: 'repeated_identical', retryable: false };
  if (f.kind === 'unknown_tool') return { classification: 'malformed_request', retryable: false };
  if (f.kind === 'tool_error' && /unknown tool|empty command|invalid/i.test(f.output))
    return { classification: 'malformed_request', retryable: false };
  // anchored (no /m): only the harness denial signature at output start; a
  // failing command that merely PRINTS "denied:" on a later line is not a denial
  if (f.kind === 'exec' && /^denied:/.test(f.output))
    return { classification: 'permission_denied', retryable: false }; // Phase 2G: definition-level exec restriction (exec:mutating child) — a harness authorization decision, never retried, counted as a denial
  if (f.kind === 'exec' && (/^timeout after/m.test(f.output) || f.exitCode === null))
    return { classification: 'deterministic', retryable: false }; // retrying a kill/timeout with the same input does not fix it
  if (f.kind === 'exec' && /^cancelled after/m.test(f.output))
    return { classification: 'deterministic', retryable: false }; // Phase 2G: a harness cancellation is a stop signal — re-running the same action only re-stops it
  if (MISSING_CAPABILITY_RE.test(f.output)) return { classification: 'missing_capability', retryable: false };
  if (UNAVAILABLE_DEP_RE.test(f.output)) return { classification: 'unavailable_dependency', retryable: false };
  if (TRANSIENT_RE.test(f.output)) return { classification: 'transient', retryable: true };
  return { classification: 'deterministic', retryable: false };
}

/**
 * Bounded recovery budget (harness-owned; the model cannot influence it).
 *
 * Defaults (documented rationale):
 *  - maxRetriesPerAction = 1: the order's recommended default. One identical
 *    re-execution is the minimal experiment to separate transient from
 *    deterministic; a THIRD identical execution is exactly where loop
 *    detection already takes over — so no action is ever executed more than
 *    twice by the harness plus once by the model's own repeated request.
 *  - maxTotalRetries = 3 (per run): safety net so a run cannot farm transient
 *    retries across many different actions. The model keeps deciding strategy
 *    after every failure; this cap only bounds wasted executions.
 *
 * Reset: per runLoop invocation (a task/run boundary). A resume is a new run
 * and gets a fresh budget — an appropriate boundary, not a leak.
 */
export interface RecoveryLimits {
  maxRetriesPerAction: number;
  maxTotalRetries: number;
}

export const DEFAULT_RECOVERY: RecoveryLimits = { maxRetriesPerAction: 1, maxTotalRetries: 3 };

export function actionKey(name: string, input: unknown): string {
  return createHash('sha256').update(name + JSON.stringify(input)).digest('hex');
}

export type RetryReason = 'allowed' | 'not_retryable' | 'per_action_exhausted' | 'run_budget_exhausted';

export class RecoveryBudget {
  private perAction = new Map<string, number>(); // retries consumed per action key
  private executions = new Map<string, number>(); // executions observed per action key
  totalRetries = 0;

  constructor(readonly limits: RecoveryLimits = DEFAULT_RECOVERY) {}

  /** Record that the action was executed (model-requested or harness-retry). */
  recordExecution(key: string): void {
    this.executions.set(key, (this.executions.get(key) ?? 0) + 1);
  }

  /** 1-based execution count for this action (the "attempt" number). */
  attemptOf(key: string): number {
    return this.executions.get(key) ?? 0;
  }

  /** Whether the harness may auto-retry this (retryable) action now. */
  canRetry(key: string): { allowed: boolean; reason: RetryReason } {
    if (this.totalRetries >= this.limits.maxTotalRetries) return { allowed: false, reason: 'run_budget_exhausted' };
    if ((this.perAction.get(key) ?? 0) >= this.limits.maxRetriesPerAction)
      return { allowed: false, reason: 'per_action_exhausted' };
    return { allowed: true, reason: 'allowed' };
  }

  /** Consume one auto-retry from the budget. */
  consume(key: string): void {
    this.perAction.set(key, (this.perAction.get(key) ?? 0) + 1);
    this.totalRetries++;
  }

  /** Observable snapshot (events, tests, reports). */
  state(): { limits: RecoveryLimits; totalRetries: number; perAction: Record<string, number> } {
    return { limits: { ...this.limits }, totalRetries: this.totalRetries, perAction: Object.fromEntries(this.perAction) };
  }
}
