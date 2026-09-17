/**
 * Phase 2C — Bounded recovery: deterministic regression tests R1–R8.
 * Model reasons. Harness controls recovery.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rm } from 'node:fs/promises';

import { classifyFailure, RecoveryBudget, actionKey, DEFAULT_RECOVERY } from '../core/recovery.js';
import type { FailureClass } from '../core/recovery.js';
import { runLoop } from '../core/loop.js';
import type { AgentEvent } from '../core/events.js';
import { emptyUsage } from '../core/events.js';
import type { CompleteParams, CompleteResult, Provider, ToolCall } from '../providers/types.js';
import type { Tool } from '../tools/registry.js';
import { Registry } from '../tools/registry.js';
import { makeExecTool } from '../tools/exec.js';
import { makeReadTool, makeWriteTool } from '../tools/files.js';
import { PermissionGate } from '../core/permissions.js';
import { Session } from '../core/session.js';
import type { CompletionContract } from '../core/completion.js';

const mkWs = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aiagent-rec-'));

// ── unit: failure classification (machine evidence → class) ─────────────────

test('classifyFailure: all seven classes from machine evidence', () => {
  const cases: [string, Parameters<typeof classifyFailure>[0], FailureClass][] = [
    ['denial', { ok: false, output: 'denied: read-only mode (tool would modify state)', kind: 'denied' }, 'permission_denied'],
    ['loop', { ok: false, output: 'LOOP DETECTED', kind: 'loop_detected' }, 'repeated_identical'],
    ['unknown tool', { ok: false, output: 'unknown tool: teleport', kind: 'unknown_tool' }, 'malformed_request'],
    ['usage error', { ok: false, output: 'empty command', kind: 'tool_error' }, 'malformed_request'],
    ['timeout', { ok: false, output: 'timeout after 120000ms', kind: 'exec', exitCode: null }, 'deterministic'],
    ['killed', { ok: false, output: 'exit null', kind: 'exec', exitCode: null }, 'deterministic'],
    ['missing binary', { ok: false, output: 'exit 127\nbash: nosuch: command not found', kind: 'exec', exitCode: 127 }, 'missing_capability'],
    ['spawn ENOENT', { ok: false, output: 'Error: spawn ENOENT', kind: 'tool_error' }, 'missing_capability'],
    ['dns unreachable', { ok: false, output: 'fetch failed\ncause: getaddrinfo ENOTFOUND api.invalid', kind: 'exec', exitCode: 1 }, 'unavailable_dependency'],
    ['network down', { ok: false, output: 'curl: (6) Could not resolve host: api.invalid', kind: 'exec', exitCode: 6 }, 'unavailable_dependency'],
    ['conn reset', { ok: false, output: 'error: ECONNRESET', kind: 'exec', exitCode: 1 }, 'transient'],
    ['conn refused', { ok: false, output: 'exit 1\nECONNREFUSED 127.0.0.1:9', kind: 'exec', exitCode: 1 }, 'transient'],
    ['generic tool error', { ok: false, output: 'tool error: disk full', kind: 'tool_error' }, 'deterministic'],
    ['plain exit 1', { ok: false, output: 'exit 1\nassertion failed', kind: 'exec', exitCode: 1 }, 'deterministic'],
  ];
  for (const [name, input, expected] of cases) {
    const f = classifyFailure(input);
    assert.equal(f.classification, expected, `${name}: expected ${expected}, got ${f.classification}`);
  }
  // retryable only for transient
  assert.equal(classifyFailure({ ok: false, output: 'ECONNRESET', kind: 'exec' }).retryable, true);
  assert.equal(classifyFailure({ ok: false, output: 'exit 1', kind: 'exec', exitCode: 1 }).retryable, false);
  assert.equal(classifyFailure({ ok: false, output: 'denied', kind: 'denied' }).retryable, false);
});

test('RecoveryBudget: per-action cap, run cap, attempt counts, determinism', () => {
  const k1 = actionKey('exec', { command: 'a' });
  const k2 = actionKey('exec', { command: 'b' });
  assert.notEqual(k1, k2);
  assert.equal(actionKey('exec', { command: 'a' }), k1); // deterministic

  const b = new RecoveryBudget({ maxRetriesPerAction: 1, maxTotalRetries: 3 });
  b.recordExecution(k1);
  assert.equal(b.attemptOf(k1), 1);
  assert.deepEqual(b.canRetry(k1), { allowed: true, reason: 'allowed' });
  b.consume(k1);
  assert.deepEqual(b.canRetry(k1), { allowed: false, reason: 'per_action_exhausted' });
  // run budget across distinct actions
  b.recordExecution(k2); b.consume(k2);
  const k3 = actionKey('exec', { command: 'c' });
  b.recordExecution(k3); b.consume(k3);
  assert.equal(b.totalRetries, 3);
  const k4 = actionKey('exec', { command: 'd' });
  b.recordExecution(k4);
  assert.deepEqual(b.canRetry(k4), { allowed: false, reason: 'run_budget_exhausted' });
  assert.equal(b.state().totalRetries, 3);
});

test('default recovery limits are bounded (documented defaults)', () => {
  assert.deepEqual(DEFAULT_RECOVERY, { maxRetriesPerAction: 1, maxTotalRetries: 3 });
});

// ── integration helpers (runLoop + scripted provider) ───────────────────────

interface Turn { text: string; toolCalls?: ToolCall[] }
function scriptedProvider(turns: Turn[]): Provider {
  let i = 0;
  return {
    id: 'scripted',
    async complete(_p: CompleteParams): Promise<CompleteResult> {
      const t = turns[Math.min(i, turns.length - 1)];
      i++;
      return { text: t.text, toolCalls: t.toolCalls ?? [], usage: emptyUsage() };
    },
  };
}

/** A flaky network-ish tool: fails `failTimes` times with a transient signature, then succeeds. */
function flakyTool(name: string, failTimes: number): Tool {
  let n = 0;
  return {
    name,
    description: 'test flaky tool',
    parameters: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'], additionalProperties: false },
    readOnly: true,
    async execute(input) {
      n++;
      if (n <= failTimes) return { ok: false, output: `call failed: ECONNRESET (connection reset by peer) [x=${String(input.x)}]` };
      return { ok: true, output: `ok on attempt ${n}` };
    },
  };
}

async function runLoopTest(
  turns: Turn[],
  opts: { contract?: CompletionContract; mode?: 'read-only' | 'auto' | 'full'; recovery?: { maxRetriesPerAction?: number; maxTotalRetries?: number }; extraTools?: Tool[]; ws?: string } = {},
): Promise<{ events: AgentEvent[]; ws: string }> {
  const ws = opts.ws ?? mkWs();
  const home = mkWs();
  const session = await Session.create(home, {
    model: 'test', provider: 'scripted', promptVersion: '2.5.0', stableHash: 'rec-test', cwd: ws, surface: 'headless',
  });
  const registry = new Registry();
  registry.register(makeExecTool());
  registry.register(makeReadTool());
  registry.register(makeWriteTool());
  for (const t of opts.extraTools ?? []) registry.register(t);
  const gate = new PermissionGate(opts.mode ?? 'auto', false, opts.mode !== 'auto', async () => 'n');
  const events: AgentEvent[] = [];
  for await (const e of runLoop({
    provider: scriptedProvider(turns),
    model: 'test',
    system: 'test system',
    userPrompt: 'task',
    registry,
    session,
    gate,
    toolCtx: { cwd: ws, scratchpad: home, todo: () => [], setTodo: async () => {}, ask: async () => 'skip' },
    maxTurns: 10,
    contract: opts.contract,
    recovery: opts.recovery,
  })) events.push(e);
  await rm(home, { recursive: true, force: true });
  if (!opts.ws) await rm(ws, { recursive: true, force: true });
  return { events, ws };
}

const V = (command: string) => ({ kind: 'verification' as const, id: 'tests', command });
const R = { kind: 'report' as const };
const tc = (id: string, name: string, input: Record<string, unknown>): ToolCall => ({ id, name, input });
const doneOf = (events: AgentEvent[]) => events.find((e) => e.type === 'done');
type ToolResultEvent = Extract<AgentEvent, { type: 'tool_result' }>;
const toolResultsOf = (events: AgentEvent[], name?: string): ToolResultEvent[] =>
  events.filter((e): e is ToolResultEvent => e.type === 'tool_result' && (name ? e.name === name : true));

// ── R1: transient failure → bounded auto-retry succeeds ────────────────────

test('R1: transient failure, first attempt fails, retry succeeds → recovered (exactly 1 retry)', async () => {
  const { events, ws } = await runLoopTest(
    [
      { text: '', toolCalls: [tc('c1', 'flaky', { x: 'a' })] },
      { text: 'ok', toolCalls: [] },
    ],
    { extraTools: [flakyTool('flaky', 1)] },
  );
  const fails = events.filter((e) => e.type === 'tool_result' && !e.ok);
  const oks = events.filter((e) => e.type === 'tool_result' && e.ok);
  const retries = events.filter((e) => e.type === 'retry');
  assert.equal(fails.length, 1);
  assert.equal(oks.length, 1);
  assert.equal(retries.length, 1, 'exactly one automatic retry');
  assert.equal(retries[0].attempt, 2);
  assert.equal(retries[0].classification, 'transient');
  assert.equal((fails[0] as { failure?: { classification?: string; retryable?: boolean } }).failure?.classification, 'transient');
  assert.equal((fails[0] as { failure?: { retryable?: boolean } }).failure?.retryable, true);
  assert.equal(events.some((e) => e.type === 'recovery_exhausted'), false);
  rm(ws, { recursive: true, force: true });
});

// ── R2: repeated deterministic failure → retry bounded, loop stopped ────────

test('R2: deterministic failure repeated by model → 0 auto-retries, loop detected, no infinite loop', async () => {
  const failCmd = 'node -e "process.exit(1)"';
  const { events, ws } = await runLoopTest([
    { text: '', toolCalls: [tc('c1', 'exec', { command: failCmd })] },
    { text: '', toolCalls: [tc('c2', 'exec', { command: failCmd })] },
    { text: '', toolCalls: [tc('c3', 'exec', { command: failCmd })] },
  ]);
  const toolResults = events.filter((e) => e.type === 'tool_result' && e.name === 'exec');
  const retries = events.filter((e) => e.type === 'retry');
  const loops = events.filter((e) => e.type === 'loop_detected');
  assert.equal(retries.length, 0, 'deterministic failures are never auto-retried');
  assert.equal(loops.length, 1);
  assert.equal(toolResults.length, 3, 'attempt 1 executed, attempt 2 executed, attempt 3 = loop condition (not executed)');
  assert.equal((toolResults[0] as { failure?: { classification?: string } }).failure?.classification, 'deterministic');
  const done = doneOf(events);
  assert.ok(done && done.error?.includes('loop detected'));
  assert.equal(done?.turns, 3, 'the run stops — no infinite loop');
  rm(ws, { recursive: true, force: true });
});

// ── R3: identical tool loop (any tool) → machine-observable loop condition ──

test('R3: same tool + equivalent input ×3 → loop_detected with explicit machine-observable condition', async () => {
  const { events, ws } = await runLoopTest([
    { text: '', toolCalls: [tc('c1', 'flaky', { x: 'same' })] },
    { text: '', toolCalls: [tc('c2', 'flaky', { x: 'same' })] },
    { text: '', toolCalls: [tc('c3', 'flaky', { x: 'same' })] },
    { text: 'stop', toolCalls: [] },
  ], { extraTools: [flakyTool('flaky', 0)] });
  const loop = events.find((e) => e.type === 'loop_detected');
  assert.ok(loop, 'loop_detected event emitted');
  assert.equal((loop as { tool?: string; repeats?: number }).tool, 'flaky');
  assert.equal((loop as { repeats?: number }).repeats, 3);
  const third = events.filter((e) => e.type === 'tool_result' && e.id === 'c3');
  assert.equal((third[0] as { failure?: { classification?: string } }).failure?.classification, 'repeated_identical');
  const done = doneOf(events);
  assert.ok(done?.error?.includes('loop detected'));
  rm(ws, { recursive: true, force: true });
});

// ── R4: verification failure + success claim → NOT PASS ────────────────────

test('R4: model claims success but verification exits non-zero → gate FIX_REQUIRED (never PASS)', async () => {
  const ws = mkWs();
  fs.writeFileSync(path.join(ws, 'test.js'), 'const assert = require("node:assert"); assert.strictEqual(1 + 1, 3);');
  const { events } = await runLoopTest(
    [
      { text: '', toolCalls: [tc('c1', 'exec', { command: 'node test.js' })] },
      { text: 'All tests passed. DONE.' },
    ],
    { contract: { requirements: [V('node test.js'), R] }, ws },
  );
  const done = doneOf(events);
  const completion = done?.completion;
  assert.notEqual(completion?.state, 'PASS');
  assert.equal(completion?.state, 'FIX_REQUIRED');
  assert.match((completion?.reasons ?? []).join(' '), /exit 1/);
  rm(ws, { recursive: true, force: true });
});

// ── R5: verification failure → model fixes → verification passes → PASS ─────

test('R5: first verification fails, model corrective action, second verification succeeds → PASS', async () => {
  const ws = mkWs();
  fs.writeFileSync(path.join(ws, 'test.js'), 'const assert = require("node:assert"); assert.strictEqual(1 + 1, 3);');
  const fixed = 'const assert = require("node:assert"); assert.strictEqual(1 + 1, 2); console.log("ok");';
  const { events } = await runLoopTest(
    [
      { text: '', toolCalls: [tc('c1', 'exec', { command: 'node test.js' })] },                    // RED
      { text: '', toolCalls: [tc('c2', 'write', { path: 'test.js', content: fixed })] },           // corrective action
      { text: '', toolCalls: [tc('c3', 'exec', { command: 'node test.js' })] },                    // GREEN (model re-runs)
      { text: 'Fixed the assertion; verification exits 0. DONE.' },
    ],
    { contract: { requirements: [V('node test.js'), R] }, ws },
  );
  const execResults = toolResultsOf(events, 'exec');
  assert.equal(execResults.length, 2);
  assert.equal(execResults[0].ok, false);
  assert.equal(execResults[1].ok, true, 'second verification actually passed (machine evidence)');
  const done = doneOf(events);
  assert.equal(done?.completion?.state, 'PASS');
  assert.equal(fs.readFileSync(path.join(ws, 'test.js'), 'utf8'), fixed, 'workspace reflects the model\'s fix, not the claim');
  rm(ws, { recursive: true, force: true });
});

// ── R6: permission denial → Phase 2A semantics preserved, no retry ──────────

test('R6: permission denial → no retry of denied action, gate BLOCKED (Phase 2A semantics intact)', async () => {
  const { events, ws } = await runLoopTest(
    [
      { text: '', toolCalls: [tc('c1', 'write', { path: 'out.txt', content: 'x' })] },
      { text: 'DONE.' },
    ],
    { contract: { requirements: [{ kind: 'file-state', id: 'fs', path: 'out.txt', check: 'exists' }, R] }, mode: 'read-only' },
  );
  const writeResults = events.filter((e) => e.type === 'tool_result' && e.name === 'write');
  const retries = events.filter((e) => e.type === 'retry');
  assert.equal(writeResults.length, 1, 'denied action executed (denied) exactly once — never retried');
  assert.equal(retries.length, 0);
  assert.equal((writeResults[0] as { failure?: { classification?: string } }).failure?.classification, 'permission_denied');
  assert.equal(doneOf(events)?.completion?.state, 'BLOCKED');
  rm(ws, { recursive: true, force: true });
});

// ── R7: unavailable capability → BLOCKED, not endless retry ─────────────────

test('R7: required command does not exist → missing_capability, 0 retries, gate BLOCKED', async () => {
  const missing = 'definitely-not-a-real-cmd-xyz --check';
  const { events, ws } = await runLoopTest(
    [
      { text: '', toolCalls: [tc('c1', 'exec', { command: missing })] },
      { text: 'Cannot run the verification; the binary is missing. DONE.' },
    ],
    { contract: { requirements: [V(missing), R] } },
  );
  const execResults = events.filter((e) => e.type === 'tool_result' && e.name === 'exec');
  const retries = events.filter((e) => e.type === 'retry');
  assert.equal(execResults.length, 1, 'the missing binary was attempted once and not retried');
  assert.equal((execResults[0] as { failure?: { classification?: string; exitCode?: number } }).failure?.classification, 'missing_capability');
  assert.equal(retries.length, 0, 'no endless retry');
  assert.equal(doneOf(events)?.completion?.state, 'BLOCKED');
  rm(ws, { recursive: true, force: true });
});

// ── R8: recovery budget exhaustion → bounded, terminal state per gate ───────

test('R8: repeated transient failures exhaust the retry budget → recovery_exhausted, gate BLOCKED (capability classification)', async () => {
  // ECONNREFUSED to a closed port: a genuine transient signature, deterministic in the sandbox.
  const cmd = 'node -e "const s=require(\'net\').connect(9,\'127.0.0.1\');s.on(\'error\',e=>{console.error(e.code);process.exit(1)});s.end()"';
  const { events, ws } = await runLoopTest(
    [
      { text: '', toolCalls: [tc('c1', 'exec', { command: cmd })] },
      { text: 'Verification could not connect; the dependency is unavailable. DONE.' },
    ],
    { contract: { requirements: [V(cmd), R] } },
  );
  const execResults = events.filter((e) => e.type === 'tool_result' && e.name === 'exec');
  const retries = events.filter((e) => e.type === 'retry');
  const exhausted = events.filter((e) => e.type === 'recovery_exhausted');
  assert.equal(retries.length, 1, 'default budget: exactly 1 auto-retry per identical action');
  assert.equal((retries[0] as { classification?: string }).classification, 'transient');
  assert.equal(exhausted.length, 1);
  assert.equal((exhausted[0] as { reason?: string }).reason, 'per_action_exhausted');
  assert.equal(execResults.length, 2, 'attempt 1 + 1 retry, then STOP RETRYING');
  const done = doneOf(events);
  assert.ok(['BLOCKED', 'FIX_REQUIRED'].includes(done?.completion?.state ?? ''), 'terminal state per existing capability classification');
  assert.equal(done?.completion?.state, 'BLOCKED', 'ECONNREFUSED is a capability-class signature in the 2A gate');
  rm(ws, { recursive: true, force: true });
});

test('R8b: run-level budget caps retries across distinct actions (observable)', async () => {
  // 4 distinct transient failures; run budget = 3 → the 4th gets no retry.
  const { events, ws } = await runLoopTest(
    [
      { text: '', toolCalls: [tc('a1', 'flaky', { x: '1' }), tc('a2', 'flaky', { x: '2' }), tc('a3', 'flaky', { x: '3' })] },
      { text: '', toolCalls: [tc('a4', 'flaky', { x: '4' })] },
      { text: 'done', toolCalls: [] },
    ],
    { extraTools: [flakyTool('flaky', Infinity)], recovery: { maxRetriesPerAction: 1, maxTotalRetries: 3 } },
  );
  const retries = events.filter((e) => e.type === 'retry');
  const exhausted = events.filter((e) => e.type === 'recovery_exhausted') as { reason?: string }[];
  assert.equal(retries.length, 3, 'run budget: 3 total auto-retries across distinct actions');
  assert.equal(exhausted.length, 4, 'every exhausted action reports why');
  assert.equal(exhausted[3].reason, 'run_budget_exhausted');
  rm(ws, { recursive: true, force: true });
});

// ── gate compatibility: recovery must not weaken the Completion Gate ────────

test('gate compatibility: a recovered tool result still requires the contract verification to pass', async () => {
  // Model's flaky helper recovers on retry, but the CONTRACT verification never
  // ran — the gate must still refuse PASS.
  const ws = mkWs();
  fs.writeFileSync(path.join(ws, 'test.js'), 'console.log("ok");');
  const { events } = await runLoopTest(
    [
      { text: '', toolCalls: [tc('c1', 'flaky', { x: 'ping' })] }, // transient → auto-retry → ok
      { text: 'Service ping recovered. DONE.' },
    ],
    { extraTools: [flakyTool('flaky', 1)], contract: { requirements: [V('node test.js'), R] } },
  );
  const retries = events.filter((e) => e.type === 'retry');
  assert.equal(retries.length, 1);
  assert.equal(doneOf(events)?.completion?.state, 'FIX_REQUIRED', 'recovered side-tool is not the contract verification');
  rm(ws, { recursive: true, force: true });
});
