/**
 * Phase 2A — Completion contract & deterministic completion gate.
 *
 * Principle: the model thinks, the harness controls completion.
 * The model may REQUEST completion (a text-only turn). The harness decides the
 * final state from machine-observable evidence only:
 *
 *   completion_request -> evaluateCompletion(contract, evidence) -> PASS /
 *   FIX_REQUIRED / BLOCKED / NEEDS_INPUT
 *
 * The contract comes from harness/task context (explicit --contract file or
 * deterministic derivation), never from the model. No keyword detection, no
 * LLM judge: the model's prose is never authoritative evidence.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type CompletionState = 'RUNNING' | 'NEEDS_INPUT' | 'FIX_REQUIRED' | 'BLOCKED' | 'PASS';

export type ContractRequirement =
  | { kind: 'verification'; id: string; command: string; expect?: 'exit0' }
  | { kind: 'file-state'; id: string; path: string; check: 'exists' | 'absent' | 'contains'; value?: string }
  | { kind: 'report' };

/** Machine-readable completion contract: what must be true before a task may complete. */
export interface CompletionContract {
  requirements: ContractRequirement[];
}

export interface ToolEvidence {
  name: string;
  ok: boolean;
  output: string;
  input?: unknown;
  /** Position in the tool-results sequence when this entry was recorded. */
  /** Phase 2C additive machine evidence (gate semantics do not consume these). */
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  classification?: import('./recovery.js').FailureClass;
  attempt?: number;
  retriesUsed?: number;
  /** Phase 2G additive: machine-readable execution evidence (gate does not consume it — exit codes still come from output). */
  exec?: import('../tools/exec.js').ExecEvidence;
}
export interface DenialEvidence {
  tool: string;
  reason: string;
  /** true if a human was prompted and declined (resumable by re-approval). */
  prompted: boolean;
  /** toolResults.length at the time of the denial (for unresolved detection). */
  atResultIndex: number;
}
export interface RunEvidence {
  /** Final text of the completion-request turn. */
  finalText: string;
  toolResults: ToolEvidence[];
  denials: DenialEvidence[];
}

export interface GateVerdict {
  state: CompletionState;
  reasons: string[];
}

const EXIT_RE = /^exit (null|-?\d+)/m;

/** CLI exit codes for headless completion states (documented in README). */
export const COMPLETION_EXIT: Record<CompletionState, number> = {
  RUNNING: 0,
  NEEDS_INPUT: 12,
  FIX_REQUIRED: 10,
  BLOCKED: 11,
  PASS: 0,
};

/** Capability-error signatures: the tool executed but the capability is unavailable. */
const CAPABILITY_RE =
  /ENOENT|command not found|EAI_AGAIN|ENOTFOUND|ENETUNREACH|EHOSTUNREACH|ECONNREFUSED|ECONNRESET|network (is )?unreachable|getaddrinfo/i;

export function parseExitCode(output: string): number | null | undefined {
  const m = EXIT_RE.exec(output);
  if (!m) return undefined;
  return m[1] === 'null' ? null : Number(m[1]);
}

export function commandAvailable(command: string): boolean {
  const token = command.trim().split(/\s+/)[0];
  if (!token) return false;
  try {
    return spawnSync('bash', ['-c', `command -v ${JSON.stringify(token)}`], { encoding: 'utf8' }).status === 0;
  } catch {
    return false;
  }
}

/** Deterministic default contract from harness/task context (mode + workspace). */
export function deriveDefaultContract(mode: 'read-only' | 'auto' | 'full', cwd: string): CompletionContract {
  if (mode === 'read-only') {
    // observation/reporting task: completion is a substantive report; no mutation or tests required
    return { requirements: [{ kind: 'report' }] };
  }
  const test = detectTestCommand(cwd);
  return {
    requirements: test
      ? [{ kind: 'verification', id: 'tests', command: test }, { kind: 'report' }]
      : [{ kind: 'report' }],
  };
}

/** Detect a workspace test entry (machine-observable; returns exact command or null). */
export function detectTestCommand(cwd: string): string | null {
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (typeof pkg?.scripts?.test === 'string') return 'npm test --silent';
    }
  } catch {
    /* malformed package.json: fall through */
  }
  try {
    const entries = fs.readdirSync(cwd);
    const hasPytest =
      entries.includes('pytest.ini') ||
      entries.some((f) => /^test_.*\.py$/.test(f)) ||
      (fs.existsSync(path.join(cwd, 'tests')) && fs.readdirSync(path.join(cwd, 'tests')).some((f) => /^test_.*\.py$/.test(f)));
    if (hasPytest) return 'python3 -m pytest -q';
    const makePath = path.join(cwd, 'Makefile');
    if (fs.existsSync(makePath) && /^\s*test\s*:/m.test(fs.readFileSync(makePath, 'utf8'))) return 'make test';
  } catch {
    /* unreadable workspace: no verification derivable */
  }
  return null;
}

export function validateContract(obj: unknown): CompletionContract {
  const c = obj as CompletionContract;
  if (!c || !Array.isArray(c.requirements) || c.requirements.length === 0)
    throw new Error('invalid contract: "requirements" must be a non-empty array');
  for (const r of c.requirements) {
    if (r.kind === 'verification') {
      if (typeof r.id !== 'string' || typeof r.command !== 'string' || !r.command.trim())
        throw new Error('invalid contract: verification requires id + command');
    } else if (r.kind === 'file-state') {
      if (typeof r.id !== 'string' || typeof r.path !== 'string' || !['exists', 'absent', 'contains'].includes(r.check))
        throw new Error('invalid contract: file-state requires id + path + check(exists|absent|contains)');
    } else if (r.kind !== 'report') {
      throw new Error(`invalid contract: unknown requirement kind "${(r as { kind?: string }).kind}"`);
    }
  }
  return c;
}

export function loadContractFile(file: string): CompletionContract {
  return validateContract(JSON.parse(fs.readFileSync(file, 'utf8')));
}

/**
 * The deterministic completion gate. Evaluates ONLY machine-observable state:
 * permission decisions, tool results (exit codes, outputs), and current file
 * state. The model's prose never decides the state.
 */
export function evaluateCompletion(contract: CompletionContract, ev: RunEvidence, cwd: string): GateVerdict {
  // 1) Unresolved permission denials take precedence (spec order).
  // A denial is resolved if the same tool later succeeded.
  const unresolved = ev.denials.filter((d) =>
    !ev.toolResults.slice(d.atResultIndex).some((t) => t.ok && t.name === d.tool),
  );
  if (unresolved.some((d) => d.prompted)) {
    return {
      state: 'NEEDS_INPUT',
      reasons: unresolved
        .filter((d) => d.prompted)
        .map((d) => `permission denied by user (${d.tool}): ${d.reason} — re-approve or adjust the task`),
    };
  }
  if (unresolved.length > 0) {
    return {
      state: 'BLOCKED',
      reasons: unresolved.map((d) => `permission denied (${d.tool}): ${d.reason} — not resolvable in this mode`),
    };
  }

  let blocked = false;
  let fix = false;
  const reasons: string[] = [];

  // 2) Verification requirements: matched by exact (trimmed) command on exec results.
  for (const r of contract.requirements) {
    if (r.kind !== 'verification') continue;
    const attempts = ev.toolResults.filter(
      (t) =>
        t.name === 'exec' &&
        typeof (t.input as { command?: unknown })?.command === 'string' &&
        (t.input as { command: string }).command.trim() === r.command.trim(),
    );
    if (attempts.length === 0) {
      if (commandAvailable(r.command)) {
        fix = true;
        reasons.push(`verification '${r.id}' never ran: ${r.command} (still performable — run it and re-request completion)`);
      } else {
        blocked = true;
        reasons.push(`verification '${r.id}' unavailable: command not found on this system: ${r.command}`);
      }
      continue;
    }
    const last = attempts[attempts.length - 1];
    const code = parseExitCode(last.output);
    if (code === 0) continue; // satisfied
    if (code === undefined || code === null) {
      fix = true;
      reasons.push(`verification '${r.id}' inconclusive: no exit code on ${r.command} (killed or timed out) — rerun it`);
    } else if (CAPABILITY_RE.test(last.output)) {
      blocked = true;
      reasons.push(`verification '${r.id}' cannot run: capability unavailable (${last.output.split('\n').find((l) => CAPABILITY_RE.test(l)) ?? 'capability error'})`);
    } else {
      fix = true;
      reasons.push(`verification '${r.id}' failed: exit ${code} on ${r.command} — the completion claim is contradicted by observed evidence`);
    }
  }

  // 3) File-state requirements: checked against the workspace NOW (ground truth, not claims).
  for (const r of contract.requirements) {
    if (r.kind !== 'file-state') continue;
    const p = path.resolve(cwd, r.path);
    let ok = false;
    try {
      if (r.check === 'exists') ok = fs.existsSync(p);
      else if (r.check === 'absent') ok = !fs.existsSync(p);
      else if (r.check === 'contains') ok = fs.existsSync(p) && fs.readFileSync(p, 'utf8').includes(r.value ?? '');
    } catch {
      ok = false;
    }
    if (!ok) {
      fix = true;
      reasons.push(`file-state '${r.id}' not met: ${r.path} ${r.check}${r.value !== undefined ? ` ${JSON.stringify(r.value)}` : ''}`);
    }
  }

  // 4) Report requirement: the completion request must carry substantive text.
  for (const r of contract.requirements) {
    if (r.kind !== 'report') continue;
    if (ev.finalText.trim().length === 0) {
      fix = true;
      reasons.push('completion request carried no report text — state what was done and what was verified');
    }
  }

  return { state: blocked ? 'BLOCKED' : fix ? 'FIX_REQUIRED' : 'PASS', reasons };
}
