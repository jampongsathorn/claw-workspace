/**
 * Phase 2A — Completion Contract & Deterministic Completion Gate.
 * The F2 authority probes (harness eval round 1) converted into permanent
 * regression tests: a model's "DONE" claim must never become PASS by itself.
 *
 *   A: false DONE (0 tool calls, 0 evidence)        -> NOT PASS (FIX_REQUIRED)
 *   B: contradictory DONE (claim passed, exit 1)    -> FIX_REQUIRED
 *   C: valid completion (verification green)        -> PASS
 *   D: verification unavailable (no binary)         -> BLOCKED
 *   E: permission denial (read-only)                -> BLOCKED
 *   E2: permission denial (user declined interact.) -> NEEDS_INPUT
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';

import {
  evaluateCompletion,
  deriveDefaultContract,
  detectTestCommand,
  loadContractFile,
  validateContract,
  parseExitCode,
  commandAvailable,
} from '../core/completion.js';
import type { CompletionContract, RunEvidence, GateVerdict } from '../core/completion.js';
import { runLoop } from '../core/loop.js';
import { Registry } from '../tools/registry.js';
import { makeExecTool } from '../tools/exec.js';
import { makeReadTool, makeWriteTool } from '../tools/files.js';
import { PermissionGate } from '../core/permissions.js';
import { Session } from '../core/session.js';
import { emptyUsage } from '../core/events.js';
import type { CompleteParams, CompleteResult, Provider } from '../providers/types.js';
import type { ToolEvidence, DenialEvidence } from '../core/completion.js';

function mkWs(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aiagent-gate-'));
}

const ev = (finalText: string, toolResults: ToolEvidence[] = [], denials: DenialEvidence[] = []): RunEvidence => ({ finalText, toolResults, denials });
const contract = (requirements: CompletionContract['requirements']): CompletionContract => ({ requirements });
const V = (command: string) => ({ kind: 'verification' as const, id: 'tests', command });
const R = { kind: 'report' as const };
const F = (p: string, check: 'exists' | 'absent' | 'contains' = 'exists', value?: string) => ({
  kind: 'file-state' as const, id: 'fs', path: p, check, value,
});

// ── unit: evidence parsing ──────────────────────────────────────────────────

test('parseExitCode: 0 / nonzero / null / missing', () => {
  assert.equal(parseExitCode('exit 0\nok'), 0);
  assert.equal(parseExitCode('exit 1\nstderr'), 1);
  assert.equal(parseExitCode('exit null\n'), null);
  assert.equal(parseExitCode('no marker'), undefined);
});

test('commandAvailable: node yes, nonsense no', () => {
  assert.equal(commandAvailable('node --version'), true);
  assert.equal(commandAvailable('definitely-not-a-real-cmd-xyz --check'), false);
});

// ── unit: contract validation & derivation ─────────────────────────────────

test('validateContract: rejects empty / malformed / unknown kinds', () => {
  assert.throws(() => validateContract({ requirements: [] }), /non-empty/);
  assert.throws(() => validateContract({ requirements: [{ kind: 'verification', id: 'x' }] }), /command/);
  assert.throws(() => validateContract({ requirements: [{ kind: 'telepathy' }] }), /unknown/);
  assert.equal(validateContract({ requirements: [R] }).requirements.length, 1);
});

test('deriveDefaultContract: read-only = report only', () => {
  const ws = mkWs();
  const c = deriveDefaultContract('read-only', ws);
  assert.deepEqual(c.requirements.map((r) => r.kind), ['report']);
  rm(ws, { recursive: true, force: true });
});

test('deriveDefaultContract: workspace with npm test -> verification + report; without -> report', () => {
  const wsA = mkWs();
  fs.writeFileSync(path.join(wsA, 'package.json'), JSON.stringify({ scripts: { test: 'node -e "assert.ok(1)"' } }));
  assert.equal(detectTestCommand(wsA), 'npm test --silent');
  assert.deepEqual(deriveDefaultContract('auto', wsA).requirements.map((r) => r.kind), ['verification', 'report']);
  const wsB = mkWs();
  fs.writeFileSync(path.join(wsB, 'hello.py'), 'print(1)');
  assert.equal(detectTestCommand(wsB), null);
  assert.deepEqual(deriveDefaultContract('auto', wsB).requirements.map((r) => r.kind), ['report']);
  const wsC = mkWs();
  fs.writeFileSync(path.join(wsC, 'pytest.ini'), '[pytest]');
  assert.equal(detectTestCommand(wsC), 'python3 -m pytest -q');
  rm(wsA, { recursive: true, force: true });
  rm(wsB, { recursive: true, force: true });
  rm(wsC, { recursive: true, force: true });
});

test('loadContractFile: parses and validates a JSON contract', () => {
  const f = path.join(mkWs(), 'contract.json');
  fs.writeFileSync(f, JSON.stringify({ requirements: [V('node test.js'), R] }));
  const c = loadContractFile(f);
  assert.equal(c.requirements[0].kind, 'verification');
});

// ── unit: gate matrix (pure, no loop) ───────────────────────────────────────

test('gate: never-ran verification (available) -> FIX_REQUIRED', () => {
  const v = evaluateCompletion(contract([V('node test.js'), R]), ev('DONE.'), mkWs());
  assert.equal(v.state, 'FIX_REQUIRED');
  assert.match(v.reasons.join(' '), /never ran/);
});

test('gate: ran but exit 1 -> FIX_REQUIRED (claim contradicted by evidence)', () => {
  const v = evaluateCompletion(
    contract([V('node test.js'), R]),
    ev('All tests passed. DONE.', [{ name: 'exec', ok: false, output: 'exit 1\nassert failed', input: { command: 'node test.js' } }]),
    mkWs(),
  );
  assert.equal(v.state, 'FIX_REQUIRED');
  assert.match(v.reasons.join(' '), /exit 1/);
});

test('gate: exit 0 + report -> PASS', () => {
  const v = evaluateCompletion(
    contract([V('node test.js'), R]),
    ev('Done: tests green.', [{ name: 'exec', ok: true, output: 'exit 0\nok', input: { command: 'node test.js' } }]),
    mkWs(),
  );
  assert.equal(v.state, 'PASS');
  assert.deepEqual(v.reasons, []);
});

test('gate: capability error (ENOENT / network) -> BLOCKED', () => {
  const ws = mkWs();
  for (const out of ['exit 127\nbash: mytool: command not found', 'exit 1\nError: fetch failed (ENOTFOUND api.example)']) {
    const v = evaluateCompletion(
      contract([V('node test.js'), R]),
      ev('DONE.', [{ name: 'exec', ok: false, output: out, input: { command: 'node test.js' } }]),
      ws,
    );
    assert.equal(v.state, 'BLOCKED', `expected BLOCKED for: ${out}`);
  }
});

test('gate: unavailable verification command -> BLOCKED; available -> FIX_REQUIRED', () => {
  const ws = mkWs();
  const blocked = evaluateCompletion(contract([V('definitely-not-a-real-cmd-xyz --check')]), ev('DONE.'), ws);
  assert.equal(blocked.state, 'BLOCKED');
  const fixable = evaluateCompletion(contract([V('node test.js')]), ev('DONE.'), ws);
  assert.equal(fixable.state, 'FIX_REQUIRED');
});

test('gate: headless denial -> BLOCKED; user-declined -> NEEDS_INPUT; later success resolves', () => {
  const ws = mkWs();
  const headless = evaluateCompletion(contract([F('out.txt'), R]), ev('DONE.', [], [
    { tool: 'write', reason: 'denied: read-only mode (tool would modify state)', prompted: false, atResultIndex: 0 },
  ]), ws);
  assert.equal(headless.state, 'BLOCKED');

  const interactive = evaluateCompletion(contract([F('out.txt'), R]), ev('DONE.', [], [
    { tool: 'write', reason: 'denied by user', prompted: true, atResultIndex: 0 },
  ]), ws);
  assert.equal(interactive.state, 'NEEDS_INPUT');

  const resolved = evaluateCompletion(contract([R]), ev('DONE.', [
    { name: 'exec', ok: true, output: 'exit 0\n', input: { command: 'node test.js' } },
  ], [{ tool: 'exec', reason: 'denied by user', prompted: true, atResultIndex: 0 }]), ws);
  assert.equal(resolved.state, 'PASS'); // the later successful exec resolved the denial
});

test('gate: file-state checked against the filesystem, not the claim', () => {
  const ws = mkWs();
  fs.writeFileSync(path.join(ws, 'out.txt'), 'result: 42');
  const ok1 = evaluateCompletion(contract([F('out.txt', 'contains', 'result: 42'), R]), ev('wrote out.txt'), ws);
  assert.equal(ok1.state, 'PASS');
  const bad = evaluateCompletion(contract([F('out.txt', 'contains', 'result: 99'), R]), ev('wrote out.txt (I think)'), ws);
  assert.equal(bad.state, 'FIX_REQUIRED');
  const absent = evaluateCompletion(contract([F('missing.txt', 'absent'), R]), ev('cleanup done'), ws);
  assert.equal(absent.state, 'PASS');
});

test('gate: empty completion text with report requirement -> FIX_REQUIRED', () => {
  assert.equal(evaluateCompletion(contract([R]), ev('   '), mkWs()).state, 'FIX_REQUIRED');
});

// ── integration: runLoop + scripted provider (the real loop, F2 probes A–E) ─

interface Turn { text: string; toolCalls?: { id: string; name: string; input: Record<string, unknown> }[] }

function scriptedProvider(ws: string, turns: Turn[]): Provider {
  let i = 0;
  return {
    id: 'scripted',
    async complete(_params: CompleteParams): Promise<CompleteResult> {
      const t = turns[Math.min(i, turns.length - 1)];
      i++;
      if (t.toolCalls?.length) {
        return {
          text: t.text,
          toolCalls: t.toolCalls.map((c) => ({ id: c.id, name: c.name, input: c.input })),
          usage: emptyUsage(),
        };
      }
      return { text: t.text, toolCalls: [], usage: emptyUsage() };
    },
  };
}

async function runGate(ws: string, turns: Turn[], opts: { contract?: CompletionContract; mode?: 'read-only' | 'auto' | 'full'; interactive?: boolean; decline?: boolean } = {}): Promise<GateVerdict | undefined> {
  const home = mkWs();
  const gate = new PermissionGate(opts.mode ?? 'auto', opts.interactive ?? false, opts.mode !== 'auto', async () => 'n');
  const session = await Session.create(home, {
    model: 'test', provider: 'scripted', promptVersion: '2.5.0', stableHash: 'gate-test', cwd: ws, surface: 'headless',
  });
  const ctx = { cwd: ws, scratchpad: home, todo: () => [], setTodo: async () => {}, ask: async () => 'skip' };
  const registry = new Registry();
  registry.register(makeExecTool());
  registry.register(makeReadTool());
  registry.register(makeWriteTool());
  let verdict: GateVerdict | undefined;
  for await (const e of runLoop({
    provider: scriptedProvider(ws, turns),
    model: 'test',
    system: 'test system',
    userPrompt: 'run the task',
    gate,
    session,
    registry,
    toolCtx: ctx,
    maxTurns: 6,
    contract: opts.contract,
  })) {
    if (e.type === 'done') verdict = e.completion;
  }
  await rm(home, { recursive: true, force: true });
  return verdict;
}

test('PROBE A: false DONE — 0 tool calls, 0 evidence -> FIX_REQUIRED (never PASS)', async () => {
  const ws = mkWs();
  fs.writeFileSync(path.join(ws, 'test.js'), 'assert.ok(1); console.log("ok");');
  const v = await runGate(ws, [{ text: 'DONE. Task complete.' }], {
    contract: contract([V('node test.js'), R]),
  });
  assert.equal(v?.state, 'FIX_REQUIRED');
  assert.match(v?.reasons.join(' ') ?? '', /never ran/);
  rm(ws, { recursive: true, force: true });
});

test('PROBE B: contradictory DONE — ran the test, it exited 1, model claims pass -> FIX_REQUIRED', async () => {
  const ws = mkWs();
  fs.writeFileSync(path.join(ws, 'test.js'), 'const assert = require("node:assert"); assert.strictEqual(1 + 1, 3);');
  const v = await runGate(
    ws,
    [
      { text: '', toolCalls: [{ id: 'c1', name: 'exec', input: { command: 'node test.js' } }] },
      { text: 'All tests passed. DONE.' },
    ],
    { contract: contract([V('node test.js'), R]) },
  );
  assert.equal(v?.state, 'FIX_REQUIRED');
  assert.match(v?.reasons.join(' ') ?? '', /exit 1/);
  rm(ws, { recursive: true, force: true });
});

test('PROBE C: valid completion — verification green, evidence exists -> PASS', async () => {
  const ws = mkWs();
  fs.writeFileSync(path.join(ws, 'test.js'), 'console.log("ok"); process.exit(0);');
  const v = await runGate(
    ws,
    [
      { text: '', toolCalls: [{ id: 'c1', name: 'exec', input: { command: 'node test.js' } }] },
      { text: 'Verified: node test.js exited 0. DONE.' },
    ],
    { contract: contract([V('node test.js'), R]) },
  );
  assert.equal(v?.state, 'PASS');
  rm(ws, { recursive: true, force: true });
});

test('PROBE D: verification unavailable (binary does not exist) -> BLOCKED', async () => {
  const ws = mkWs();
  const v = await runGate(ws, [{ text: 'DONE.' }], {
    contract: contract([V('definitely-not-a-real-cmd-xyz --check'), R]),
  });
  assert.equal(v?.state, 'BLOCKED');
  assert.match(v?.reasons.join(' ') ?? '', /unavailable/);
  rm(ws, { recursive: true, force: true });
});

test('PROBE E: permission denial (read-only headless) -> BLOCKED', async () => {
  const ws = mkWs();
  const v = await runGate(
    ws,
    [
      { text: '', toolCalls: [{ id: 'c1', name: 'write', input: { path: 'out.txt', content: 'x' } }] },
      { text: 'Wrote out.txt. DONE.' },
    ],
    { contract: contract([F('out.txt'), R]), mode: 'read-only' },
  );
  assert.equal(v?.state, 'BLOCKED');
  assert.match(v?.reasons.join(' ') ?? '', /permission denied/);
  assert.equal(fs.existsSync(path.join(ws, 'out.txt')), false); // file was never created — claim contradicted
  rm(ws, { recursive: true, force: true });
});

test('PROBE E2: user declined interactively -> NEEDS_INPUT (resumable)', async () => {
  const ws = mkWs();
  const v = await runGate(
    ws,
    [
      { text: '', toolCalls: [{ id: 'c1', name: 'write', input: { path: 'out.txt', content: 'x' } }] },
      { text: 'DONE.' },
    ],
    { contract: contract([F('out.txt'), R]), mode: 'auto', interactive: true }, // promptFn always 'n'
  );
  assert.equal(v?.state, 'NEEDS_INPUT');
  rm(ws, { recursive: true, force: true });
});

test('backward compat: runLoop without contract -> no completion field (Phase 1 behavior)', async () => {
  const ws = mkWs();
  const v = await runGate(ws, [{ text: 'DONE.' }], {});
  assert.equal(v, undefined);
  rm(ws, { recursive: true, force: true });
});
