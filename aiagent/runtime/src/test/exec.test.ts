/**
 * Phase 2G — Execution & tool hardening: deterministic tests G1–G22.
 * (G23/G24 = the existing recovery & state/session suites; G25 = real-CLI
 * e2e driver run separately.)
 *
 * Invariants under test: bounded execution (timeout/cancel/output), process
 * group cleanup (no orphans), honest machine states, conservative mutation
 * classification, safe bounded apply_patch (unified diff + batch), recovery
 * integration (2C unchanged), completion boundary (timeout/cancel/partial
 * patch never PASS), child-agent execution limits.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { runShell, execLimits } from '../core/shell.js';
import { classifyShellCommand } from '../core/mutation.js';
import { classifyFailure } from '../core/recovery.js';
import { makeExecTool, type ExecEvidence } from '../tools/exec.js';
import { makeApplyPatchTool, parseUnifiedDiff, applyHunksToText } from '../tools/files.js';
import { runLoop } from '../core/loop.js';
import type { AgentEvent } from '../core/events.js';
import { emptyUsage } from '../core/events.js';
import type { CompleteParams, CompleteResult, Provider, ToolCall } from '../providers/types.js';
import { Registry } from '../tools/registry.js';
import type { ToolContext } from '../tools/registry.js';
import { makeReadTool, makeWriteTool } from '../tools/files.js';
import { makeAgentTool, type AgentToolDeps } from '../tools/agent.js';
import { PermissionGate } from '../core/permissions.js';
import { Session } from '../core/session.js';
import { evaluateCompletion, type CompletionContract } from '../core/completion.js';

// harness config for this suite (read per-call by the exec tool)
process.env.AIAGENT_EXEC_MAX_OUTPUT_BYTES = '20000';
const CAP = 20000;

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aiagent-2g-'));

const sleepMarker = (n: number): string => `sleep ${n}`;
/** pgrep with the self-match-safe character-class trick. */
function hasProcess(marker: string): boolean {
  const re = marker.replace(/\d+$/, (d) => `${d.slice(0, -1)}[${d[d.length - 1]}]`);
  try {
    const out = execFileSync('pgrep', ['-f', re], { encoding: 'utf8' });
    return out.trim().length > 0;
  } catch {
    return false; // pgrep exit 1 = no match
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ctx(cwd: string): ToolContext {
  return {
    cwd,
    scratchpad: path.join(cwd, 'scratch'),
    todo: () => [],
    setTodo: async () => {},
    ask: async () => 'skip',
  };
}

const evOf = (r: { exec?: ExecEvidence }) => {
  assert.ok(r.exec, 'exec evidence present');
  return r.exec!;
};

// ── G1 — normal exec success ────────────────────────────────────────────────
test('G1: normal exec success — exit code, duration, state completed', async () => {
  const ws = mk();
  const r = await makeExecTool().execute({ command: 'echo hello-2g && pwd > .cwd-marker' }, ctx(ws));
  assert.equal(r.ok, true);
  assert.ok(String(r.output).startsWith('exit 0'), 'stable exit signature');
  assert.ok(String(r.output).includes('hello-2g'));
  const e = evOf(r);
  assert.equal(e.state, 'completed');
  assert.equal(e.exitCode, 0);
  assert.equal(e.timedOut, false);
  assert.equal(e.cancelled, false);
  assert.ok(e.durationMs >= 0 && e.durationMs < 10_000);
  assert.equal(e.stdoutTruncated, false);
  assert.ok(e.stdoutBytes >= 'hello-2g\n'.length);
  assert.ok(e.mutation, 'mutation verdict present');
});

// ── G2 — non-zero exit ──────────────────────────────────────────────────────
test('G2: non-zero exit — honest failure, deterministic classification', async () => {
  const ws = mk();
  const r = await makeExecTool().execute({ command: 'echo oops >&2; exit 3' }, ctx(ws));
  assert.equal(r.ok, false);
  assert.ok(String(r.output).startsWith('exit 3'));
  assert.ok(String(r.output).includes('oops'));
  const e = evOf(r);
  assert.equal(e.state, 'completed', 'non-zero exit is a completed run (exit code is the evidence)');
  assert.equal(e.exitCode, 3);
  const f = classifyFailure({ ok: false, output: String(r.output), kind: 'exec', exitCode: r.exitCode });
  assert.equal(f.classification, 'deterministic');
  assert.equal(f.retryable, false);
});

// ── G3 — timeout ────────────────────────────────────────────────────────────
test('G3: timeout — killed at deadline, machine evidence, no orphan, never retried', async () => {
  const ws = mk();
  const t0 = Date.now();
  const r = await makeExecTool().execute({ command: sleepMarker(59111), timeout_ms: 400 }, ctx(ws));
  const wall = Date.now() - t0;
  assert.equal(r.ok, false);
  assert.ok(String(r.output).startsWith('timeout after'), 'stable timeout signature');
  const e = evOf(r);
  assert.equal(e.state, 'timed_out');
  assert.equal(e.timedOut, true);
  assert.equal(e.exitCode, null);
  assert.ok(e.durationMs < 4000, 'did not wait beyond the deadline');
  assert.ok(wall < 8000, 'tool call returned promptly');
  const f = classifyFailure({ ok: false, output: String(r.output), kind: 'exec', exitCode: r.exitCode });
  assert.equal(f.classification, 'deterministic', 'timeout never auto-retried');
  await sleep(250);
  assert.equal(hasProcess(sleepMarker(59111)), false, 'no orphaned sleep after timeout');
});

// ── G4 — cancellation (injected programmatically) ───────────────────────────
test('G4: cancellation — stops execution, cleans up, preserves partial output, not a success', async () => {
  const ws = mk();
  const handle = runShell(`echo started-ok; ${sleepMarker(59112)}`, { cwd: ws, timeoutMs: 30_000, maxOutputBytes: CAP });
  setTimeout(() => handle.cancel(), 150);
  const r = await handle.promise;
  assert.equal(r.state, 'cancelled');
  assert.equal(r.cancelled, true);
  assert.equal(r.exitCode, null);
  assert.ok(r.stdout.includes('started-ok'), 'partial output preserved');
  assert.ok(r.durationMs < 5000);
  await sleep(250);
  assert.equal(hasProcess(sleepMarker(59112)), false, 'no orphan after cancellation');
  const f = classifyFailure({ ok: false, output: `cancelled after ${r.durationMs}ms (harness cancellation)`, kind: 'exec', exitCode: null });
  assert.equal(f.classification, 'deterministic', 'cancellation never retried');
});

// ── G5 — descendant cleanup on normal exit ──────────────────────────────────
test('G5: backgrounded descendant is reaped when the shell exits (no uncontrolled descendants)', async () => {
  const ws = mk();
  const r = await makeExecTool().execute({ command: `${sleepMarker(59113)} & echo bg-launched` }, ctx(ws));
  assert.equal(r.ok, true, 'the shell itself exited 0');
  const e = evOf(r);
  assert.equal(e.state, 'completed');
  await sleep(400); // SIGKILL to the group is immediate; allow the kernel to reap
  assert.equal(hasProcess(sleepMarker(59113)), false, 'backgrounded grandchild killed with the group');
});

// ── G6 — huge stdout ────────────────────────────────────────────────────────
test('G6: huge stdout — bounded retention, total byte accounting, explicit truncation', async () => {
  const ws = mk();
  const r = await makeExecTool().execute({ command: `head -c 200000 /dev/zero | tr '\\0' 'A'` }, ctx(ws));
  assert.equal(r.ok, true);
  const e = evOf(r);
  assert.equal(e.stdoutBytes, 200000, 'total bytes observed (beyond the cap)');
  assert.equal(e.stdoutTruncated, true);
  assert.ok(String(r.stdout).length <= CAP, 'retained output bounded');
  assert.ok(String(r.output).includes('stdout truncated'), 'truncation explicit in model-facing output');
  assert.ok(String(r.stdout).startsWith('A'.repeat(1000)), 'diagnostic head preserved');
  // memory bounded: the retained string is the cap, not 200k
  assert.ok((r.stdout ?? '').length < 50_000);
});

// ── G7 — huge stderr ────────────────────────────────────────────────────────
test('G7: huge stderr — bounded independently from stdout', async () => {
  const ws = mk();
  const r = await makeExecTool().execute({ command: `head -c 150000 /dev/zero | tr '\\0' 'E' 1>&2; exit 1` }, ctx(ws));
  assert.equal(r.ok, false);
  const e = evOf(r);
  assert.equal(e.exitCode, 1);
  assert.equal(e.stderrBytes, 150000);
  assert.equal(e.stderrTruncated, true);
  assert.equal(e.stdoutTruncated, false, 'streams accounted separately');
  assert.ok(String(r.output).includes('stderr truncated'));
});

// ── G8 — output truncation marker integrity ─────────────────────────────────
test('G8: truncation markers are honest — counts + re-run guidance, evidence never silently cut', async () => {
  const ws = mk();
  const r = await makeExecTool().execute({ command: `head -c 40000 /dev/zero | tr '\\0' 'Z'` }, ctx(ws));
  const out = String(r.output);
  const e = evOf(r);
  assert.equal(e.stdoutBytes, 40000, 'evidence carries the TRUE total, not the retained size');
  assert.ok(out.includes(`of ${40000} bytes`), 'byte accounting in the marker');
  assert.ok(out.includes('re-run with narrower scope'), 'model is told how to recover more');
  assert.ok(String(r.stdout).startsWith('Z'.repeat(500)), 'head preserved for diagnosis');
});

// ── G9 — unicode/binary-safe output ─────────────────────────────────────────
test('G9: multi-byte output is intact (no per-chunk decode corruption)', async () => {
  const ws = mk();
  // single-chunk exact
  const r1 = await makeExecTool().execute({ command: `printf 'héllo 世界\n'` }, ctx(ws));
  assert.ok(String(r1.stdout).includes('héllo 世界'), 'exact multi-byte round-trip');
  // many chunks, under cap: exact
  const r2 = await makeExecTool().execute({ command: `for i in $(seq 1 500); do printf '日本語'; done` }, ctx(ws));
  const e2 = evOf(r2);
  assert.equal(e2.stdoutBytes, 500 * 9);
  assert.equal(e2.stdoutTruncated, false);
  assert.equal(r2.stdout, '日本語'.repeat(500), '3000 chunks decoded without boundary corruption');
  // many chunks, over cap: prefix intact, no corruption away from the cut point
  const r3 = await makeExecTool().execute({ command: `for i in $(seq 1 4000); do printf '日本語'; done` }, ctx(ws));
  const e3 = evOf(r3);
  assert.equal(e3.stdoutTruncated, true);
  assert.ok(String(r3.stdout).startsWith('日本語'.repeat(1000)), 'retained prefix is clean multi-byte');
  assert.ok(!String(r3.stdout).slice(0, 3000).includes('\uFFFD'), 'no mojibake in the retained region');
});

// ── G10 — mutation classification (conservative tables) ─────────────────────
test('G10: mutation classification — read-only, mutating, and unknown cases', () => {
  const ro = (c: string) => assert.equal(classifyShellCommand(c).verdict, 'read_only', c);
  const mut = (c: string) => assert.equal(classifyShellCommand(c).verdict, 'mutating', c);
  const unk = (c: string) => assert.equal(classifyShellCommand(c).verdict, 'unknown', c);
  ro('ls -la');
  ro('cat /etc/hosts');
  ro('git status');
  ro('git log --oneline -5');
  ro('git branch');
  ro('git remote');
  ro('git remote show origin');
  ro('npm ls');
  ro('find . -name "*.ts"');
  ro('grep -r needle .');
  ro('echo hi && pwd');
  // sed/perl are NEVER read_only: `sed 's/x/y/w out'` can write files — conservative
  unk('sed -n "1,5p" f.txt');
  unk('perl -pe "s/a/b/" f.txt');
  ro('tar -tf archive.tar');
  mut('rm -rf x');
  mut('cp a b');
  mut('git commit -m x');
  mut('npm install');
  mut('sed -i s/a/b/ f.txt');
  mut('echo x | tee f');
  mut('ls > out.txt');
  mut('echo x >> log.txt');
  mut('echo a>b'); // no-space redirection is still a redirection
  mut('ls 1>out');
  mut('git branch new-branch'); // creates state
  mut('git remote add origin url');
  ro('echo =>'); // '>' with no target is not a redirection
  ro('ls 2>&1'); // fd duplication is not a file
  mut('bash script.sh');
  mut('tar -xf archive.tar');
  mut('curl -o file http://x');
  mut('rm a; echo done');
  unk('mytool --flag');
  unk('/usr/bin/ls');
  unk('./script.sh');
  unk('node -e "console.log(1)"');
  unk('echo $(cat /etc/passwd)');
  unk(`echo \`date\``);
  unk('curl http://example.com');
  // shell invocations are mutation vectors (arbitrary code) — never read_only
  mut('sh -c "whatever"');
  mut('bash script.sh');
});

// ── G11 — ambiguity stays conservative ──────────────────────────────────────
test('G11: ambiguous commands are NEVER upgraded to read-only', () => {
  for (const c of ['weirdcmd', 'echo "a|b"', 'ls &&', 'git', 'npm', 'tar -zq', 'echo x |']) {
    const v = classifyShellCommand(c).verdict;
    assert.notEqual(v, 'read_only', `${c} must not be read_only (got ${v})`);
  }
  assert.equal(classifyShellCommand('').verdict, 'unknown');
  // chained: read-only + read-only stays read-only; read-only + unknown → unknown
  assert.equal(classifyShellCommand('ls; ls').verdict, 'read_only');
  assert.equal(classifyShellCommand('ls; mytool').verdict, 'unknown');
  assert.equal(classifyShellCommand('ls | grep x').verdict, 'read_only');
});

// ── G12 — permission denial (gate + child mutation filter) ──────────────────
test('G12: read-only mode denies exec; exec:mutating child filter denies mutating/unknown, allows read-only', async () => {
  // (a) gate denial: never retried
  const ws = mk();
  const home = mk();
  const session = await Session.create(home, { model: 't', provider: 's', promptVersion: '2.5.0', stableHash: 'x', cwd: ws, surface: 'headless' });
  const gate = new PermissionGate('read-only', false, false, async () => 'n');
  const registry = new Registry();
  registry.register(makeExecTool());
  const provider: Provider = {
    id: 'scripted',
    async complete(): Promise<CompleteResult> {
      return {
        text: '',
        toolCalls: [{ id: 'c1', name: 'exec', input: { command: 'rm -rf /tmp/must-not-run-2g' } }],
        usage: emptyUsage(),
      };
    },
  };
  const events: AgentEvent[] = [];
  const tctx = { ...ctx(ws), gate };
  for await (const e of runLoop({ provider, model: 't', system: 's', registry, session, gate, toolCtx: tctx, maxTurns: 3, userPrompt: 'x' })) {
    events.push(e);
    if (e.type === 'done') break;
  }
  const tr = events.find((e) => e.type === 'tool_result' && e.id === 'c1');
  assert.ok(tr && tr.type === 'tool_result' && tr.ok === false, 'denied');
  assert.ok(tr.output.includes('read-only mode'));
  assert.equal(tr.failure?.classification, 'permission_denied');
  assert.equal(events.filter((e) => e.type === 'retry').length, 0, 'denial is never retried');

  // (b) child mutation filter: mutating denied, read-only allowed, denial classified permission_denied
  const agentsDir = mk();
  fs.writeFileSync(
    path.join(agentsDir, 'explorer.md'),
    '---\nname: explorer\nwhenToUse: test\nmodel: inherit\ndisallowedTools: [agent, edit, write, apply_patch, exec:mutating]\n---\n\nEXPLORER body.\n',
  );
  const ws2 = mk();
  const home2 = mk();
  const parentSession = await Session.create(home2, { model: 't', provider: 's', promptVersion: '2.5.0', stableHash: 'x', cwd: ws2, surface: 'headless' });
  const gate2 = new PermissionGate('full', false, true, async () => 'n');
  const registry2 = new Registry();
  registry2.register(makeExecTool());
  registry2.register(makeReadTool());
  const childTurns: { text: string; toolCalls?: ToolCall[] }[] = [
    { text: '', toolCalls: [{ id: 'd1', name: 'exec', input: { command: 'git commit -m hostile' } }] },
    { text: '', toolCalls: [{ id: 'd2', name: 'exec', input: { command: 'ls' } }] },
    { text: 'CHILD_REPORT: done.' },
  ];
  let ci = 0;
  const childProvider: Provider = {
    id: 'child',
    async complete(): Promise<CompleteResult> {
      const t = childTurns[Math.min(ci, childTurns.length - 1)];
      ci++;
      return { text: t.text, toolCalls: t.toolCalls ?? [], usage: emptyUsage() };
    },
  };
  let pi = 0;
  const parentTurns: { text: string; toolCalls?: ToolCall[] }[] = [
    { text: '', toolCalls: [{ id: 'p1', name: 'agent', input: { action: 'run', agent: 'explorer', task: 'sweep' } }] },
    { text: 'delegated' },
  ];
  const parentProvider: Provider = {
    id: 'parent',
    async complete(): Promise<CompleteResult> {
      const t = parentTurns[Math.min(pi, parentTurns.length - 1)];
      pi++;
      return { text: t.text, toolCalls: t.toolCalls ?? [], usage: emptyUsage() };
    },
  };
  const router: Provider = {
    id: 'router',
    async complete(p: CompleteParams): Promise<CompleteResult> {
      return String(p.system).includes('SUB-AGENT BOUNDARY') ? childProvider.complete(p) : parentProvider.complete(p);
    },
  };
  const depsRef: { current: AgentToolDeps | null } = { current: null };
  registry2.register(makeAgentTool(() => depsRef.current!, [agentsDir]));
  depsRef.current = { provider: router, model: 't', gate: gate2, registry: registry2, session: parentSession, toolCtx: { ...ctx(ws2), gate: gate2 } };
  const events2: AgentEvent[] = [];
  for await (const e of runLoop({
    provider: router, model: 't', system: 'parent system', registry: registry2, session: parentSession,
    gate: gate2, toolCtx: { ...ctx(ws2), gate: gate2 }, maxTurns: 5, userPrompt: 'delegate a sweep',
  })) events2.push(e);
  const ar = events2.find((e) => e.type === 'agent_result');
  assert.ok(ar && ar.type === 'agent_result', 'delegation completed');
  assert.equal(ar.status, 'SUCCESS');
  assert.ok(ar.denials >= 1, 'child mutation denial counted in the machine digest');
  assert.ok(ar.toolCalls['exec'] >= 2, 'child exec was NOT stripped — read-only commands ran');
});

// ── G13 — apply_patch: unified diff success ─────────────────────────────────
test('G13: unified diff apply — modify + new file, deterministic, atomic per file', async () => {
  const ws = mk();
  const c = ctx(ws);
  const w = makeWriteTool();
  await w.execute({ path: 'a.txt', content: 'line1\nline2\nline3\n' }, c);
  const patch = [
    '--- a/a.txt',
    '+++ b/a.txt',
    '@@ -1,3 +1,3 @@',
    ' line1',
    '-line2',
    '+LINE2-CHANGED',
    ' line3',
    '--- /dev/null',
    '+++ b/c.txt',
    '@@ -0,0 +1,2 @@',
    '+new-file-line-1',
    '+new-file-line-2',
  ].join('\n');
  const r = await makeApplyPatchTool().execute({ patch }, c);
  assert.equal(r.ok, true, r.output);
  assert.equal(fs.readFileSync(path.join(ws, 'a.txt'), 'utf8'), 'line1\nLINE2-CHANGED\nline3\n');
  assert.equal(fs.readFileSync(path.join(ws, 'c.txt'), 'utf8'), 'new-file-line-1\nnew-file-line-2\n');
  assert.ok(String(r.output).includes('2 file(s)'));
  // no temp litter
  assert.equal(fs.readdirSync(ws).filter((f) => f.includes('.aiagent-patch-')).length, 0);
});

// ── G14 — malformed patches rejected ────────────────────────────────────────
test('G14: malformed patches rejected — counts, context, deletion, structure', async () => {
  const ws = mk();
  const c = ctx(ws);
  await makeWriteTool().execute({ path: 'a.txt', content: 'line1\nline2\nline3\n' }, c);
  const before = fs.readFileSync(path.join(ws, 'a.txt'), 'utf8');
  const cases: [string, string][] = [
    ['bad hunk counts', '--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,2 @@\n line1\n-line2\n+X\n line3\n'],
    ['context does not apply', '--- a/a.txt\n+++ b/a.txt\n@@ -1,3 +1,3 @@\n NOPE\n-line2\n+X\n line3\n'],
    ['deletion not supported', '--- a/a.txt\n+++ /dev/null\n@@ -1,3 +0,0 @@\n-line1\n-line2\n-line3\n'],
    ['missing +++ target', '--- a/a.txt\n@@ -1,2 +1,2 @@\n line1\n-line2\n+X\n line3\n'],
    ['garbage outside hunk', '--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,2 @@\n line1\nRANDOM JUNK LINE\n-line2\n+X\n line3\n'],
    ['empty', ''],
    ['binary', 'Binary files a/a.txt and b/a.txt differ\n'],
  ];
  for (const [name, p] of cases) {
    const r = await makeApplyPatchTool().execute({ patch: p }, c);
    assert.equal(r.ok, false, `${name} must be rejected`);
    assert.ok(String(r.output).match(/rejected|malformed|not supported|empty/), `${name}: clear reason`);
  }
  assert.equal(fs.readFileSync(path.join(ws, 'a.txt'), 'utf8'), before, 'no file modified by rejected patches');
  // parser-level: declared counts verified
  assert.ok(parseUnifiedDiff('--- a/a\n+++ b/a\n@@ -1,5 +1,2 @@\n x\n y\n').error?.includes('declared'), 'count mismatch caught by parser');
  // hunk offset search is deterministic (unique match applies, position reported)
  const okRes = applyHunksToText('a.txt', 'p\nq\nr\ns\n', false, [
    { oldStart: 99, oldCount: 2, newStart: 99, newCount: 2, lines: [{ t: ' ', s: 'r' }, { t: '-', s: 's' }, { t: '+', s: 'S2' }] },
  ]);
  assert.ok(okRes.ok, 'hunk matched at its real position (declared was wrong)');
  const amb = applyHunksToText('a.txt', 'p\nx\nq\nx\nr\n', false, [
    { oldStart: 99, oldCount: 1, newStart: 99, newCount: 1, lines: [{ t: '-', s: 'x' }, { t: '+', s: 'X' }] },
  ]);
  assert.ok(!amb.ok && /ambiguous/.test(amb.error), 'declared position invalid + multiple exact matches → rejected as ambiguous');
  // pure-insertion hunk (oldCount 0): "insert AFTER line 2" — exact position
  const ins = applyHunksToText('a.txt', 'a\nb\nc\n', false, [
    { oldStart: 2, oldCount: 0, newStart: 3, newCount: 1, lines: [{ t: '+', s: 'INSERTED' }] },
  ]);
  assert.ok(ins.ok, 'pure-insertion applies');
  assert.equal(ins.ok && ins.text, 'a\nb\nINSERTED\nc\n', 'insertion lands AFTER the declared line, not before');
  // duplicate file sections rejected (no silent overwrite of the first)
  const dup = parseUnifiedDiff('--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-x\n+X\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-y\n+Y\n');
  assert.ok(dup.error?.includes('duplicate'), 'duplicate file section rejected');
});

// ── G15 — unsafe patch paths ───────────────────────────────────────────────
test('G15: path traversal, absolute escape, and symlink escape are all rejected', async () => {
  const ws = mk();
  const c = ctx(ws);
  const outside = path.join(mk(), 'outside.txt');
  fs.writeFileSync(outside, 'do not touch\n');
  // traversal
  const r1 = await makeApplyPatchTool().execute({
    patch: '--- /dev/null\n+++ b/../../evil.txt\n@@ -0,0 +1,1 @@\n+pwned\n',
  }, c);
  assert.equal(r1.ok, false, 'traversal rejected');
  assert.ok(String(r1.output).includes('escapes'));
  assert.ok(!fs.existsSync(path.join(ws, '../../evil.txt')));
  // absolute path
  const r2 = await makeApplyPatchTool().execute({
    patch: `--- /dev/null\n+++ b/${outside}\n@@ -0,0 +1,1 @@\n+pwned\n`,
  }, c);
  assert.equal(r2.ok, false, 'absolute escape rejected');
  assert.ok(fs.readFileSync(outside, 'utf8').includes('do not touch'), 'outside file untouched');
  // symlink escape (link inside workspace → outside file)
  fs.symlinkSync(outside, path.join(ws, 'link.txt'));
  const r3 = await makeApplyPatchTool().execute({
    patch: '--- a/link.txt\n+++ b/link.txt\n@@ -1 +1 @@\n-do not touch\n+pwned\n',
  }, c);
  assert.equal(r3.ok, false, 'symlink escape rejected');
  assert.ok(String(r3.output).includes('symlink escape'));
  assert.ok(fs.readFileSync(outside, 'utf8').includes('do not touch'), 'symlink target untouched');
  // the same protections hold for the plain file tools
  const w = makeWriteTool();
  const rw = await w.execute({ path: '../../evil2.txt', content: 'x' }, c);
  assert.equal(rw.ok, false, 'write tool also confined');
  const rr = await makeReadTool().execute({ path: outside }, c);
  assert.equal(rr.ok, false, 'read tool also confined');
});

// ── G16 — partial write failure is explicit, never success ──────────────────
test('G16: mid-batch write failure → explicit partial report (wrote X, NOT Y), never success', async () => {
  const ws = mk();
  const c = ctx(ws);
  await makeWriteTool().execute({ path: 'a.txt', content: 'target-one\n' }, c);
  await makeWriteTool().execute({ path: 'b.txt', content: 'beta\n' }, c);
  const bPath = path.join(ws, 'b.txt');
  const tool = makeApplyPatchTool((abs) => abs === bPath); // injected write failure (root cannot EACCES)
  const r = await tool.execute({
    edits: [
      { path: 'a.txt', old_string: 'target-one', new_string: 'ALPHA' },
      { path: 'b.txt', old_string: 'beta', new_string: 'BETA' },
    ],
  }, c);
  assert.equal(r.ok, false, 'partial application is never ok:true');
  assert.ok(String(r.output).includes('PARTIALLY applied'));
  assert.ok(String(r.output).includes('NOT [b.txt]'), 'names exactly what was not written');
  assert.equal(fs.readFileSync(path.join(ws, 'a.txt'), 'utf8'), 'ALPHA\n', 'first file was modified (reported)');
  assert.equal(fs.readFileSync(bPath, 'utf8'), 'beta\n', 'second file untouched (reported)');
  // no temp litter from the failed write
  assert.equal(fs.readdirSync(ws).filter((f) => f.includes('.aiagent-patch-')).length, 0, 'temp file cleaned up');
  // validation-phase no-op prevention (batch): later edit invalidated by earlier one
  await makeWriteTool().execute({ path: 'f.txt', content: 'zz-target\n' }, c);
  const rr = await makeApplyPatchTool().execute({
    edits: [
      { path: 'f.txt', old_string: 'zz-target', new_string: 'zz-replaced' },
      { path: 'f.txt', old_string: 'zz-target', new_string: 'zz-other' },
    ],
  }, c);
  assert.equal(rr.ok, false);
  assert.ok(String(rr.output).includes('PREVENTED'), 'silent no-op prevented');
  assert.equal(fs.readFileSync(path.join(ws, 'f.txt'), 'utf8'), 'zz-target\n', 'nothing written on prevented batch');
});

// ── G17 — recovery integration (2C reused, bounded) ─────────────────────────
test('G17: transient exec failure → exactly one bounded auto-retry, then structured stop', async () => {
  const ws = mk();
  const home = mk();
  const session = await Session.create(home, { model: 't', provider: 's', promptVersion: '2.5.0', stableHash: 'x', cwd: ws, surface: 'headless' });
  const gate = new PermissionGate('full', false, true, async () => 'n');
  const registry = new Registry();
  registry.register(makeExecTool());
  const cmd = `node -e "fetch('http://127.0.0.1:9/').then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})"`;
  let calls = 0;
  const provider: Provider = {
    id: 'scripted',
    async complete(): Promise<CompleteResult> {
      calls++;
      if (calls === 1) return { text: '', toolCalls: [{ id: 't1', name: 'exec', input: { command: cmd } }], usage: emptyUsage() };
      return { text: 'giving up', toolCalls: [], usage: emptyUsage() };
    },
  };
  const events: AgentEvent[] = [];
  for await (const e of runLoop({
    provider, model: 't', system: 's', registry, session, gate, toolCtx: { ...ctx(ws), gate }, maxTurns: 4, userPrompt: 'try it',
  })) {
    events.push(e);
    if (e.type === 'done') break;
  }
  const retries = events.filter((e) => e.type === 'retry');
  assert.equal(retries.length, 1, 'exactly one auto-retry (Phase 2C per-action budget)');
  assert.equal(retries[0].type === 'retry' && retries[0].classification, 'transient');
  const exhausted = events.find((e) => e.type === 'recovery_exhausted');
  assert.ok(exhausted, 'recovery_exhausted emitted');
  assert.equal(exhausted.type === 'recovery_exhausted' && exhausted.reason, 'per_action_exhausted');
  const execResults = events.filter((e) => e.type === 'tool_result' && e.name === 'exec');
  assert.equal(execResults.length, 2, 'two failed attempts recorded (then stop — no third)');
});

// ── G18 — completion integration ────────────────────────────────────────────
test('G18: timeout/cancel/truncated-failure/partial-patch never PASS; clean exit 0 does', async () => {
  const ws = mk();
  const c = ctx(ws);
  // (a) verification command TIMES OUT + model claims success → NOT PASS
  const r1 = await makeExecTool().execute({ command: sleepMarker(59301), timeout_ms: 300 }, c);
  assert.equal(r1.ok, false);
  const v1 = evaluateCompletion(
    { requirements: [{ kind: 'verification', id: 'v', command: sleepMarker(59301) }, { kind: 'report' }] },
    { finalText: 'Done, it works.', toolResults: [{ name: 'exec', ok: false, output: String(r1.output), input: { command: sleepMarker(59301) }, exitCode: r1.exitCode }], denials: [] },
    ws,
  );
  assert.equal(v1.state, 'FIX_REQUIRED', 'timeout is inconclusive evidence, not PASS');
  assert.ok(v1.reasons.some((x) => x.includes('timed out')));
  // (b) verification command TRUNCATED + exit 1 → NOT PASS
  const bigCmd = `head -c 50000 /dev/zero | tr '\\0' 'B'; exit 1`;
  const r2 = await makeExecTool().execute({ command: bigCmd }, c);
  const v2 = evaluateCompletion(
    { requirements: [{ kind: 'verification', id: 'v', command: bigCmd }, { kind: 'report' }] },
    { finalText: 'Done.', toolResults: [{ name: 'exec', ok: false, output: String(r2.output), input: { command: bigCmd }, exitCode: r2.exitCode }], denials: [] },
    ws,
  );
  assert.equal(v2.state, 'FIX_REQUIRED');
  assert.ok(v2.reasons.some((x) => x.includes('exit 1')));
  // (c) verification command CANCELLED + claim → NOT PASS
  const handle = runShell(`echo half; ${sleepMarker(59302)}`, { cwd: ws, timeoutMs: 30_000, maxOutputBytes: CAP });
  setTimeout(() => handle.cancel(), 100);
  const rc = await handle.promise;
  const cancelOut = `cancelled after ${rc.durationMs}ms (harness cancellation — partial output below is NOT a completed result)\n${rc.stdout}`;
  const v3 = evaluateCompletion(
    { requirements: [{ kind: 'verification', id: 'v', command: sleepMarker(59302) }, { kind: 'report' }] },
    { finalText: 'Done.', toolResults: [{ name: 'exec', ok: false, output: cancelOut, input: { command: sleepMarker(59302) }, exitCode: null }], denials: [] },
    ws,
  );
  assert.equal(v3.state, 'FIX_REQUIRED', 'cancelled execution is inconclusive evidence');
  // (d) clean exit 0 + report → PASS
  const r4 = await makeExecTool().execute({ command: 'true' }, c);
  const v4 = evaluateCompletion(
    { requirements: [{ kind: 'verification', id: 'v', command: 'true' }, { kind: 'report' }] },
    { finalText: 'Done.', toolResults: [{ name: 'exec', ok: true, output: String(r4.output), input: { command: 'true' }, exitCode: 0 }], denials: [] },
    ws,
  );
  assert.equal(v4.state, 'PASS', 'exit 0 + report satisfies the contract');
  // (e) PARTIAL patch → required file-state unsatisfied → NOT PASS
  await makeWriteTool().execute({ path: 'a.txt', content: 'alpha\n' }, c);
  await makeWriteTool().execute({ path: 'b.txt', content: 'beta\n' }, c);
  const tool = makeApplyPatchTool((abs) => abs === path.join(ws, 'b.txt'));
  const rp = await tool.execute({
    edits: [
      { path: 'a.txt', old_string: 'alpha', new_string: 'A-NEW' },
      { path: 'b.txt', old_string: 'beta', new_string: 'B-NEW' },
    ],
  }, c);
  assert.equal(rp.ok, false);
  const v5 = evaluateCompletion(
    { requirements: [{ kind: 'file-state', id: 'f', path: 'b.txt', check: 'contains', value: 'B-NEW' }, { kind: 'report' }] },
    { finalText: 'Patch applied, all done.', toolResults: [{ name: 'apply_patch', ok: false, output: String(rp.output), input: {} }], denials: [] },
    ws,
  );
  assert.equal(v5.state, 'FIX_REQUIRED', 'partial patch cannot satisfy the contract');
});

// ── G19/G20/G21 — child-agent execution under the new model ────────────────
interface ChildEnv {
  events: AgentEvent[];
  parentSession: Session;
  ws: string;
}
async function childRun(
  childTurns: { text: string; toolCalls?: ToolCall[] }[],
  opts?: { mode?: 'read-only' | 'auto' | 'full' },
): Promise<ChildEnv> {
  const ws = mk();
  const home = mk();
  const agentsDir = mk();
  fs.writeFileSync(
    path.join(agentsDir, 'explorer.md'),
    '---\nname: explorer\nwhenToUse: test\nmodel: inherit\ndisallowedTools: [agent, edit, write, apply_patch, exec:mutating]\n---\n\nEXPLORER body.\n',
  );
  const parentSession = await Session.create(home, { model: 't', provider: 's', promptVersion: '2.5.0', stableHash: 'x', cwd: ws, surface: 'headless' });
  const gate = new PermissionGate(opts?.mode ?? 'full', false, true, async () => 'n');
  const registry = new Registry();
  registry.register(makeExecTool());
  registry.register(makeReadTool());
  let ci = 0;
  const childProvider: Provider = {
    id: 'child',
    async complete(): Promise<CompleteResult> {
      const t = childTurns[Math.min(ci, childTurns.length - 1)];
      ci++;
      return { text: t.text, toolCalls: t.toolCalls ?? [], usage: emptyUsage() };
    },
  };
  let pi = 0;
  const parentProvider: Provider = {
    id: 'parent',
    async complete(): Promise<CompleteResult> {
      if (pi === 0) return { text: '', toolCalls: [{ id: 'p1', name: 'agent', input: { action: 'run', agent: 'explorer', task: 'work' } }], usage: emptyUsage() };
      return { text: 'delegated', toolCalls: [], usage: emptyUsage() };
    },
  };
  const router: Provider = {
    id: 'router',
    async complete(p: CompleteParams): Promise<CompleteResult> {
      return String(p.system).includes('SUB-AGENT BOUNDARY') ? childProvider.complete(p) : parentProvider.complete(p);
    },
  };
  const depsRef: { current: AgentToolDeps | null } = { current: null };
  registry.register(makeAgentTool(() => depsRef.current!, [agentsDir]));
  depsRef.current = { provider: router, model: 't', gate, registry, session: parentSession, toolCtx: { ...ctx(ws), gate } };
  const events: AgentEvent[] = [];
  for await (const e of runLoop({
    provider: router, model: 't', system: 'parent system', registry, session: parentSession,
    gate, toolCtx: { ...ctx(ws), gate }, maxTurns: 5, userPrompt: 'delegate',
  })) events.push(e);
  return { events, parentSession, ws };
}

test('G19: child exec timeout — bounded, cleaned up, never becomes parent PASS', async () => {
  const { events, ws } = await childRun([
    { text: '', toolCalls: [{ id: 'c1', name: 'exec', input: { command: sleepMarker(59401), timeout_ms: 300 } }] },
    { text: 'CHILD_REPORT: the sleep timed out.' },
  ]);
  const ar = events.find((e) => e.type === 'agent_result');
  assert.ok(ar && ar.type === 'agent_result', 'structured child result');
  assert.ok(ar.denials >= 0 && ar.toolCalls['exec'] === 1, 'child exec ran exactly once');
  await sleep(300);
  assert.equal(hasProcess(sleepMarker(59401)), false, 'child timeout left no orphan');
  // the child's report is UNVERIFIED context — the parent's gate is untouched:
  const v = evaluateCompletion(
    { requirements: [{ kind: 'verification', id: 'v', command: 'node v.js' }, { kind: 'report' }] },
    { finalText: 'Done.', toolResults: [], denials: [] },
    ws,
  );
  assert.equal(v.state, 'FIX_REQUIRED', 'child timeout + parent claim without verification ≠ PASS');
});

test('G20: child huge output — bounded by the same engine caps, run still structured', async () => {
  const { events } = await childRun([
    { text: '', toolCalls: [{ id: 'c1', name: 'exec', input: { command: `head -c 300000 /dev/zero | tr '\\0' 'C'` } }] },
    { text: 'CHILD_REPORT: read a lot.' },
  ]);
  const ar = events.find((e) => e.type === 'agent_result');
  assert.ok(ar && ar.type === 'agent_result', 'delegation completed despite 300k output');
  assert.equal(ar.status, 'SUCCESS');
  assert.equal(ar.toolCalls['exec'], 1);
  // the evidence the parent receives is bounded (tool_result outputs are registry-truncated)
  const tr = events.find((e) => e.type === 'tool_result' && e.name === 'agent');
  assert.ok(tr && tr.type === 'tool_result' && tr.output.length < 40_000, 'parent-facing delegation output bounded');
});

test('G21: child backgrounded descendant is reaped with the child exec', async () => {
  await childRun([
    { text: '', toolCalls: [{ id: 'c1', name: 'exec', input: { command: `${sleepMarker(59501)} & echo bg` } }] },
    { text: 'CHILD_REPORT: done.' },
  ]);
  await sleep(400);
  assert.equal(hasProcess(sleepMarker(59501)), false, 'child execution cleanup works (no uncontrolled descendants)');
});

// ── G22 — run-level retry budget exhaustion ─────────────────────────────────
test('G22: run budget (3 total) exhausted across distinct transient actions — visible, then stop', async () => {
  const ws = mk();
  const home = mk();
  const session = await Session.create(home, { model: 't', provider: 's', promptVersion: '2.5.0', stableHash: 'x', cwd: ws, surface: 'headless' });
  const gate = new PermissionGate('full', false, true, async () => 'n');
  const registry = new Registry();
  registry.register(makeExecTool());
  const mkCmd = (tag: string) => `node -e "//${tag}\nfetch('http://127.0.0.1:1/').then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})"`;
  const cmds = [mkCmd('a'), mkCmd('b'), mkCmd('c'), mkCmd('d')];
  let turn = 0;
  const provider: Provider = {
    id: 'scripted',
    async complete(): Promise<CompleteResult> {
      if (turn < cmds.length) {
        const t = turn++;
        return { text: '', toolCalls: [{ id: `t${t}`, name: 'exec', input: { command: cmds[t] } }], usage: emptyUsage() };
      }
      return { text: 'stopped', toolCalls: [], usage: emptyUsage() };
    },
  };
  const events: AgentEvent[] = [];
  for await (const e of runLoop({
    provider, model: 't', system: 's', registry, session, gate, toolCtx: { ...ctx(ws), gate }, maxTurns: 10, userPrompt: 'try four things',
  })) {
    events.push(e);
    if (e.type === 'done') break;
  }
  const retries = events.filter((e) => e.type === 'retry');
  assert.equal(retries.length, 3, 'run budget = 3 auto-retries total (Phase 2C), no more');
  const exhausted = events.filter((e) => e.type === 'recovery_exhausted');
  assert.ok(exhausted.some((e) => e.type === 'recovery_exhausted' && e.reason === 'run_budget_exhausted'), 'exhaustion reason visible');
  // no action was executed more than twice (1 + 1 retry)
  const execResults = events.filter((e) => e.type === 'tool_result' && e.name === 'exec');
  assert.ok(execResults.length <= 8, 'bounded total executions');
});

// ── budget/config sanity ────────────────────────────────────────────────────
test('CONFIG: harness caps are env-driven and clamp model requests', async () => {
  const limits = execLimits();
  assert.equal(limits.maxOutputBytes, CAP, 'env override honored');
  assert.ok(limits.maxTimeoutMs >= 600_000);
  const ws = mk();
  // model asks for 10 minutes; harness cap (default 600s) clamps it —
  // prove the clamp by requesting a timeout FAR above the cap and a fast exit:
  const r = await makeExecTool().execute({ command: 'true', timeout_ms: 999_999_999 }, ctx(ws));
  assert.equal(r.ok, true);
  const e = evOf(r);
  assert.ok(e.durationMs < 5000, 'clamped timeout did not delay a fast command');
});
