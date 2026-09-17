#!/usr/bin/env node
/**
 * Fixture runner for the aiagent harness evaluation.
 * Env-driven (OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL). Never prints or
 * embeds secret values; records only the base-URL hostname.
 * Exit codes: 0 = model run completed (verdict inside report), 2 = usage, 3 = BLOCKED (no credentials).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureArg = process.argv[2];
if (!fixtureArg) { console.error('usage: node run-fixture.mjs <fixture-dir>'); process.exit(2); }
const fixture = path.resolve(here, fixtureArg);
const RUNTIME = path.resolve(here, '..', '..', 'runtime');

const base = process.env.OPENAI_BASE_URL ?? '';
const key = process.env.OPENAI_API_KEY ?? '';
const meta = {
  fixture: path.basename(fixture),
  provider: 'openai-compatible',
  base_url: base ? new URL(base).hostname : '(not configured)',
  model: process.env.OPENAI_MODEL ? `OPENAI_MODEL=${process.env.OPENAI_MODEL}` : '(runtime default: gpt-5.6)',
  prompt_version: '2.5.0',
  binary_version: '0.1.0',
  platform: 'linux',
  surface: 'headless',
};

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = fs.mkdtempSync(`/tmp/aiagent-eval-${meta.fixture}-${ts.slice(0, 15)}`);
const ws = path.join(runDir, 'ws');
const home = path.join(runDir, 'home');
const resultsDir = path.join(fixture, 'results', ts);
fs.mkdirSync(resultsDir, { recursive: true });
fs.mkdirSync(ws, { recursive: true });
fs.mkdirSync(home, { recursive: true });

const log = [];
const w = (s = '') => { log.push(s); console.log(s); };
const sh = (cmd, opts = {}) => {
  const r = spawnSync('bash', ['-c', cmd], { encoding: 'utf8', ...opts });
  return { code: r.status ?? -1, out: (r.stdout ?? '') + (r.stderr ?? '') };
};
const finish = (code) => {
  fs.writeFileSync(path.join(resultsDir, 'evidence.md'), log.join('\n') + '\n');
  console.log(`\n[evidence written to ${path.relative(here, resultsDir)}/evidence.md]`);
  process.exit(code);
};

w('== harness evaluation: ' + meta.fixture + ' ==');
w('run dir:   ' + runDir);
w('workspace: ' + ws);
w('provider:  ' + meta.provider + ' @ ' + meta.base_url);
w('model:     ' + meta.model);
w('prompt:    ' + meta.prompt_version + '  binary: ' + meta.binary_version + '  surface: ' + meta.surface);
w('');

// ---------- 1. credential gate (stop condition) ----------
if (!base || !key) {
  w('VERIFICATION: BLOCKED');
  w('BUILD: (not run)');
  w('TESTS: (not run)');
  w('SCRUTINIZE: (not run)');
  w('TRACE: (not run)');
  w('FINDINGS: missing provider credentials — OPENAI_BASE_URL and/or OPENAI_API_KEY not set in the environment.');
  w('VERIFICATION_GAPS: no real-model run performed; no architecture change made to work around the missing credentials.');
  w('NEXT_ACTION: BLOCKED');
  finish(3);
}

// ---------- 2. build isolated workspace ----------
w('-- setup --');
// setup.sh writes the fixture repo into its cwd (the isolated workspace) and commits it
let r = sh('bash ' + path.join(fixture, 'setup.sh'), { cwd: ws });
if (r.code !== 0) { w('SETUP FAILED:\n' + r.out); w('VERIFICATION: BLOCKED'); w('FINDINGS: fixture setup failed (category EVALUATION).'); w('NEXT_ACTION: BLOCKED'); finish(3); }
w('workspace built: ' + sh('git -C ' + ws + ' log --oneline').out.trim());

// ---------- 3. baseline (pre-agent state) ----------
w(''); w('-- baseline (pre-agent) --');
let baseline = '(no baseline script)';
if (fs.existsSync(path.join(fixture, 'baseline.sh'))) {
  r = sh('bash ' + path.join(fixture, 'baseline.sh'), { cwd: ws });
  baseline = `exit=${r.code}\n` + r.out.trim();
}
w('baseline exit=' + (fs.existsSync(path.join(fixture, 'baseline.sh')) ? r.code : 'n/a'));
w(baseline);

// ---------- 4. run the agent (headless CLI, NDJSON) ----------
w(''); w('-- agent run --');
const task = fs.readFileSync(path.join(fixture, 'task.md'), 'utf8').trim();
const mode = fs.existsSync(path.join(fixture, 'mode.txt')) ? fs.readFileSync(path.join(fixture, 'mode.txt'), 'utf8').trim() : 'auto';
const maxTurns = fs.existsSync(path.join(fixture, 'max-turns.txt')) ? Number(fs.readFileSync(path.join(fixture, 'max-turns.txt'), 'utf8').trim()) : 30;
const args = ['exec', task, '--json', '--mode', mode, '--max-turns', String(maxTurns)];
if (mode !== 'read-only') args.push('--yes');
if (process.env.OPENAI_MODEL) args.push('--model', process.env.OPENAI_MODEL);

const events = [];
let finalState = null;
const t0 = Date.now();
await new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(RUNTIME, 'dist', 'index.js'), ...args], {
    cwd: ws,
    env: { ...process.env, AIAGENT_HOME: home, OPENAI_BASE_URL: base, OPENAI_API_KEY: key },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      try { const e = JSON.parse(line); events.push(e); } catch { /* non-JSON line */ }
    }
  });
  const errLog = [];
  child.stderr.on('data', (d) => errLog.push(d.toString()));
  const killer = setTimeout(() => { child.kill('SIGKILL'); }, 900_000);
  child.on('close', (code) => { clearTimeout(killer); w('cli exit=' + code + ' duration=' + ((Date.now() - t0) / 1000).toFixed(1) + 's'); if (errLog.length) w('stderr: ' + errLog.join('').slice(0, 500)); resolve(); });
});
fs.writeFileSync(path.join(resultsDir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n');

const init = events.find((e) => e.type === 'init');
if (init) w('init: session ' + init.sessionId + ' model=' + init.model + ' prompt=' + init.promptVersion + ' stableHash=' + init.stableHash);
const toolCalls = events.filter((e) => e.type === 'tool_call');
const execCalls = toolCalls.filter((e) => e.name === 'exec');
const reads = toolCalls.filter((e) => e.name === 'read');
const skillReads = reads.filter((e) => String(e.input?.path ?? '').match(/skills\/[\w-]+\/SKILL\.md/));
const textEvents = events.filter((e) => e.type === 'assistant_text');
finalState = events.find((e) => e.type === 'done');
const lastText = textEvents.length ? textEvents[textEvents.length - 1].text : '(none)';

w('tool calls: ' + toolCalls.length + ' (exec ' + execCalls.length + ', read ' + reads.length + ', write/edit ' + toolCalls.filter((e) => ['write', 'edit', 'apply_patch'].includes(e.name)).length + ')');
w('skill SKILL.md reads: ' + (skillReads.length ? skillReads.map((e) => e.input.path).join(', ') : 'none'));
w('harness final event: ' + (finalState ? 'done turns=' + finalState.turns + (finalState.error ? ' error="' + finalState.error + '"' : '') : '(no done event)'));
w(''); w('-- model final message --'); w(lastText.slice(0, 2000));

// ---------- 5. post-verification (independent of the model) ----------
w(''); w('-- post-verification (eval-side, independent) --');
const dirty = sh('git -C ' + ws + ' status --porcelain').out.trim();
w('workspace mutation (git status --porcelain): ' + (dirty ? '\n' + dirty : '(clean)'));
let post = '(no post script)';
let postCode = null;
if (fs.existsSync(path.join(fixture, 'post.sh'))) {
  r = sh('bash ' + path.join(fixture, 'post.sh'), { cwd: ws });
  postCode = r.code;
  post = `exit=${r.code}\n` + r.out.trim();
}
w('post-verify:\n' + post);

// ---------- 6. skill evidence ----------
w(''); w('-- skill evidence --');
w('available in catalog: scrutinize, diagnosing-bugs, grilling, writing-for-agents (verified by offline smoke)');
w('loaded (SKILL.md read by model): ' + (skillReads.length ? 'YES — ' + skillReads.map((e) => path.basename(path.dirname(String(e.input.path)))) .join(', ') : 'NO — model never read any SKILL.md'));
w('note: Phase 1 has no Skill tool; skill application = model reads SKILL.md via the read tool after catalog match (architectural gap, documented, not implemented here)');

// ---------- 7. minimum report ----------
w(''); w('== minimum report ==');
w('VERIFICATION: (filled by analysis step — see results dir; fixture expectation in expected.md)');
w('BUILD: ' + (r.out ? 'workspace built via setup.sh (git-initialized)' : 'n/a'));
w('TESTS:\nbaseline:\n' + baseline + '\npost:\n' + post);
w('SCRUTINIZE: skill available=' + true + ' loaded=' + (skillReads.length > 0) + ' — see analysis');
w('TRACE: ' + toolCalls.length + ' tool calls; ' + execCalls.length + ' exec commands; final harness event: ' + (finalState ? 'done' : 'missing'));
w('FINDINGS: see model final message + post-verification above');
w('VERIFICATION_GAPS: see analysis');
w('NEXT_ACTION: see analysis');
finish(0);
