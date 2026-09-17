#!/usr/bin/env node
/**
 * aiagent CLI — Phase 1
 *   aiagent                       interactive REPL
 *   aiagent exec "task"           headless (single task, exits)
 * Flags: --provider openai|anthropic · --model <id> · --mode read-only|auto|full
 *        --yes · --max-turns N · --json (NDJSON events) · --continue[=<id>]
 *        --contract <file> (Phase 2A completion contract; default derived from mode+workspace)
 * Exit codes (headless, completion gate active): 0 PASS · 10 FIX_REQUIRED · 11 BLOCKED · 12 NEEDS_INPUT
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assemble, resolveAssembleDefaults } from './core/assembler.js';
import { runLoop } from './core/loop.js';
import type { AgentEvent } from './core/events.js';
import { PermissionGate, type Mode } from './core/permissions.js';
import { Session } from './core/session.js';
import { Registry } from './tools/registry.js';
import { makeExecTool } from './tools/exec.js';
import { makeReadTool, makeWriteTool, makeEditTool, makeApplyPatchTool } from './tools/files.js';
import { makeGlobTool, makeGrepTool } from './tools/search.js';
import { makeTodoTool } from './tools/todo.js';
import { makeAskTool } from './tools/ask.js';
import { makeSkillTool } from './tools/skill.js';
import { makeAgentTool, type AgentToolDeps } from './tools/agent.js';
import { makeMemoryTool, makeNotesTool } from './tools/state.js';
import { listMemory, renderMemoryIndex, renderNotes } from './core/state.js';
import { createProvider, DEFAULT_MODELS, type ProviderId } from './providers/index.js';
import { deriveDefaultContract, loadContractFile, COMPLETION_EXIT } from './core/completion.js';
import type { CompletionContract, CompletionState } from './core/completion.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.AIAGENT_ROOT ?? path.resolve(here, '..', '..');

interface Opts {
  headless: boolean;
  task?: string;
  provider: ProviderId;
  model?: string;
  mode: Mode;
  yes: boolean;
  maxTurns: number;
  json: boolean;
  continueWith?: string;
  contract?: string;
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = { headless: false, provider: 'openai', mode: 'auto', yes: false, maxTurns: 50, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'exec') o.headless = true;
    else if (a === '--provider') o.provider = argv[++i] as ProviderId;
    else if (a === '--model') o.model = argv[++i];
    else if (a === '--mode') o.mode = argv[++i] as Mode;
    else if (a === '--yes') o.yes = true;
    else if (a === '--max-turns') o.maxTurns = Number(argv[++i]);
    else if (a === '--json') o.json = true;
    else if (a === '--continue') o.continueWith = 'latest';
    else if (a.startsWith('--continue=')) o.continueWith = a.slice('--continue='.length);
    else if (a === '--contract') o.contract = argv[++i];
    else if (o.headless && a.startsWith('-') === false && !o.task) o.task = a; // task = one argv element (quoted); flags parse before OR after it
    else if (!o.headless && a.startsWith('-') === false && !o.task) {
      // ignore stray tokens in interactive mode
    }
  }
  if (!['openai', 'anthropic'].includes(o.provider)) throw new Error(`unknown provider: ${o.provider}`);
  if (!['read-only', 'auto', 'full'].includes(o.mode)) throw new Error(`unknown mode: ${o.mode}`);
  return o;
}

function buildRegistry(rootDir: string, cwd: string): Registry {
  const r = new Registry();
  r.register(makeSkillTool([path.join(rootDir, 'skills'), path.join(cwd, 'skills')]));
  r.register(makeExecTool());
  r.register(makeReadTool());
  r.register(makeWriteTool());
  r.register(makeEditTool());
  r.register(makeApplyPatchTool());
  r.register(makeGlobTool());
  r.register(makeGrepTool());
  r.register(makeTodoTool());
  r.register(makeAskTool());
  return r;
}

function renderEvent(e: AgentEvent, json: boolean): void {
  if (json) {
    stdout.write(JSON.stringify(e) + '\n');
    return;
  }
  switch (e.type) {
    case 'init':
      stdout.write(
        `\x1b[2m— session ${e.sessionId} · ${e.model} (${e.provider}) · prompt ${e.promptVersion} ` +
          `hash ${e.stableHash} · ${e.platform}/${e.surface} —\x1b[0m\n`,
      );
      break;
    case 'assistant_text':
      stdout.write(e.text + (e.text.endsWith('\n') ? '' : '\n'));
      break;
    case 'assistant_thought':
      stdout.write(`\x1b[2m${e.text}\x1b[0m\n`);
      break;
    case 'tool_call': {
      const i = e.input as Record<string, string>;
      const s = i.command ?? i.task ?? i.path ?? i.pattern ?? i.question ?? JSON.stringify(e.input);
      stdout.write(`\x1b[36m⚙ ${e.name}\x1b[0m \x1b[2m${String(s).slice(0, 140)}\x1b[0m\n`);
      break;
    }
    case 'tool_result':
      stdout.write(`\x1b[2m  ${e.ok ? '✓' : '✗'} ${e.name}: ${e.output.split('\n')[0].slice(0, 140)}\x1b[0m\n`);
      break;
    case 'error':
      stdout.write(`\x1b[31merror: ${e.message}\x1b[0m\n`);
      break;
    case 'loop_detected':
      stdout.write(`\x1b[33mloop detected: ${e.tool} ×${e.repeats}\x1b[0m\n`);
      break;
    case 'retry':
      stdout.write(`\x1b[33m↻ retry ${e.tool} (attempt ${e.attempt} · ${e.classification} · budget ${e.totalRetriesUsed})\x1b[0m\n`);
      break;
    case 'skill_discovered':
      stdout.write(`\x1b[35m✦ skills discovered (${e.count}): ${e.skills.join(', ')}\x1b[0m\n`);
      break;
    case 'skill_selected':
      stdout.write(`\x1b[35m✦ skill selected: ${e.name}\x1b[0m\n`);
      break;
    case 'skill_loaded':
      stdout.write(`\x1b[35m✦ skill loaded: ${e.name} (${e.chars} chars · sha256 ${e.contentHash.slice(0, 12)})\x1b[0m\n`);
      break;
    case 'skill_load_failed':
      stdout.write(`\x1b[31m✗ skill load failed: ${e.name} (${e.reason})\x1b[0m\n`);
      break;
    case 'agent_discovered':
      stdout.write(`\x1b[34m⬢ agents discovered (${e.count}): ${e.agents.map((a) => a.name).join(', ')}\x1b[0m\n`);
      break;
    case 'agent_selected':
      stdout.write(`\x1b[34m⬢ delegating to: ${e.agent}\x1b[0m\n`);
      break;
    case 'agent_spawned':
      stdout.write(`\x1b[34m⬢ agent spawned: ${e.agent} (${e.agentId} → child ${e.childSessionId})${e.rerunOf ? ` [rerun of ${e.rerunOf}: ${e.rerunReason}]` : ''}\x1b[0m\n`);
      break;
    case 'agent_started':
      stdout.write(`\x1b[2m  agent running: ${e.agent} (child ${e.childSessionId})\x1b[0m\n`);
      break;
    case 'agent_result':
      stdout.write(`\x1b[34m⬢ agent result: ${e.agent} → ${e.status} (turns=${e.turns}, child ${e.childSessionId})\x1b[0m\n`);
      break;
    case 'agent_failed':
      stdout.write(`\x1b[31m⬢ agent failed: ${e.agent} — ${e.reason}\x1b[0m\n`);
      break;
    case 'agent_blocked':
      stdout.write(`\x1b[35m⬢ agent blocked: ${e.agent} — ${e.reason}\x1b[0m\n`);
      break;
    case 'agent_needs_input':
      stdout.write(`\x1b[33m⬢ agent needs input: ${e.agent} — ${e.reason}\x1b[0m\n`);
      break;
    case 'agent_completed':
      stdout.write(`\x1b[34m⬢ agent completed: ${e.agent} (${e.status}, child ${e.childSessionId}) — unverified context, not task completion\x1b[0m\n`);
      break;
    case 'state_read':
      stdout.write(`\x1b[2m· state read: ${e.store}${e.id ? ` '${e.id}'` : e.count !== undefined ? ` (${e.count} entries)` : ''}\x1b[0m\n`);
      break;
    case 'state_written':
      stdout.write(`\x1b[32m· state written: ${e.store}${e.id ? ` '${e.id}'` : ''}${e.bytes !== undefined ? ` (${e.bytes} chars)` : ''}${e.source ? ` [${e.source}]` : ''}\x1b[0m\n`);
      break;
    case 'state_promoted':
      stdout.write(`\x1b[32m· state promoted: ${e.from} → ${e.to}${e.id ? ` '${e.id}'` : ''} — ${e.reason}\x1b[0m\n`);
      break;
    case 'state_cleared':
      stdout.write(`\x1b[33m· state cleared: ${e.store}${e.id ? ` '${e.id}'` : ''}\x1b[0m\n`);
      break;
    case 'context_rebuilt':
      stdout.write(`\x1b[2m— context rebuilt: ${e.notes} note(s), ${e.memoryEntries} memory entries [${e.sections.join(', ')}]\x1b[0m\n`);
      break;
    case 'context_pruned':
      stdout.write(
        `\x1b[33m⚠ context pruned: ${e.charsBefore} → ${e.charsAfter} chars (system ${e.systemChars} intact) — ` +
          `${e.prunedToolResults} tool result(s), ${e.prunedAssistantTexts} assistant text(s), ${e.prunedDelegatedResults} delegated result(s)\x1b[0m\n`,
      );
      break;
    case 'recovery_exhausted':
      stdout.write(`\x1b[31m⛔ recovery exhausted: ${e.tool} (${e.classification} · ${e.reason}) — evidence returned to model\x1b[0m\n`);
      break;
    case 'max_turns':
      stdout.write(`\x1b[33mmax turns reached (${e.turns})\x1b[0m\n`);
      break;
    case 'done': {
      stdout.write(
        `\x1b[2m— done in ${e.turns} turn(s) · in ${e.usage.inputTokens} / out ${e.usage.outputTokens} ` +
          `${e.usage.cachedInputTokens ? `· cached ${e.usage.cachedInputTokens}` : ''}\x1b[0m\n`,
      );
      if (e.completion) {
        const color = e.completion.state === 'PASS' ? 32 : e.completion.state === 'BLOCKED' ? 35 : 31;
        stdout.write(`\x1b[${color}mcompletion gate: ${e.completion.state}\x1b[0m\n`);
        for (const r of e.completion.reasons) stdout.write(`  \x1b[2m· ${r}\x1b[0m\n`);
      }
      break;
    }
    default:
      break;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  const cwd = process.cwd();
  const surface = opts.headless ? 'headless' : 'interactive';
  const model = opts.model ?? DEFAULT_MODELS[opts.provider];
  const provider = createProvider(opts.provider);
  const d = resolveAssembleDefaults(ROOT, cwd);
  const registry = buildRegistry(ROOT, cwd);
  // Phase 2E: agent tool with per-session deps (resolved at call time) + bundled agent definitions
  const agentDirs = [path.join(ROOT, 'prompts', 'agents'), path.join(cwd, '.agents')];
  const agentDepsRef: { current: AgentToolDeps | null } = { current: null };
  registry.register(
    makeAgentTool(() => {
      if (!agentDepsRef.current) throw new Error('agent tool called outside a task run');
      return agentDepsRef.current;
    }, agentDirs),
  );
  // Phase 2F: explicit state operations (memory = gated, notes = session-scoped).
  // Child sessions (Phase 2E) re-bind these to their OWN session/home in runDelegation.
  registry.register(makeMemoryTool(() => d.home));
  registry.register(
    makeNotesTool(() => {
      if (!session) throw new Error('notes tool called outside a task run');
      return session;
    }),
  );

  const rl = opts.headless ? undefined : createInterface({ input: stdin, output: stdout });

  const askUser = async (q: string): Promise<string> => {
    if (!rl) throw new Error('ask is not available in headless mode — report what is needed instead');
    return (await rl.question(`\n\x1b[35m? ${q}\n\x1b[0m> `)).trim();
  };
  const yesNo = async (q: string): Promise<'y' | 'n'> => {
    if (!rl) return 'n';
    const a = (await rl.question(q)).trim().toLowerCase();
    return a === 'y' || a === 'yes' ? 'y' : 'n';
  };

  const gate = new PermissionGate(opts.mode, opts.headless ? false : true, opts.yes, yesNo);

  // Phase 2A: completion contract from harness/task context (never from the model).
  // Headless runs are gated; interactive REPL keeps Phase 1 behavior (a human is in the loop).
  let contract: CompletionContract | undefined;
  if (opts.headless) {
    contract = opts.contract ? loadContractFile(opts.contract) : deriveDefaultContract(opts.mode, cwd);
  }
  let finalState: CompletionState | undefined;

  let session: Session | null = null;

  /**
   * Phase 2F: context is built DELIBERATELY — core prompt + environment +
   * durable memory INDEX (progressive disclosure) + active task notes (only
   * the current task's state) + current task. Nothing is blindly accumulated;
   * scratch is session-local and announced by path, never pre-loaded.
   */
  const assembleFor = async (s: Session) => {
    const memoryIndex = renderMemoryIndex(await listMemory(d.home));
    const notes = renderNotes(s.notes);
    return assemble({
      rootDir: ROOT,
      cwd: s.meta.cwd,
      platform: d.platform,
      surface: surface as 'interactive' | 'headless',
      model: s.meta.model,
      sandbox: 'direct (Phase 1)',
      scratchpad: s.scratchDir, // session-local (Phase 2F)
      binaryVersion: d.binaryVersion,
      globalInstructionFile: d.globalInstructionFile,
      memoryIndex: memoryIndex || undefined,
      notes: notes || undefined,
    });
  };

  const freshSession = async () => {
    // stable part (version + hash) is session-independent → preflight once,
    // create the session (which owns its scratch dir), then the real assembly
    // with the session's state sections.
    const pre = await assemble({
      rootDir: ROOT, cwd, platform: d.platform, surface: surface as 'interactive' | 'headless',
      model, sandbox: 'direct (Phase 1)', scratchpad: d.scratchpad, binaryVersion: d.binaryVersion,
      globalInstructionFile: d.globalInstructionFile,
    });
    const s = await Session.create(d.home, {
      model,
      provider: provider.id,
      promptVersion: pre.promptVersion,
      stableHash: pre.stableHash,
      cwd,
      surface,
    });
    fs.mkdirSync(s.scratchDir, { recursive: true });
    session = s;
    const bundle = await assembleFor(s);
    return bundle.system;
  };

  const toolCtxFor = (system: string) => ({
    cwd,
    scratchpad: session!.scratchDir, // Phase 2F: session-local scratch
    todo: () => session!.todo,
    setTodo: (t: Parameters<Session['setTodo']>[0]) => session!.setTodo(t),
    ask: askUser,
    notesLines: () => session!.notes.map((n) => n.text), // Phase 2F: live promotion verification
    gate,
    _system: system,
  });

  const runTask = async (task: string, system: string) => {
    agentDepsRef.current = { provider, model, gate, registry, session: session!, toolCtx: toolCtxFor(system) };
    const deps = {
      provider,
      model,
      contract,
      system,
      registry,
      session: session!,
      gate,
      toolCtx: toolCtxFor(system),
      maxTurns: opts.maxTurns,
      userPrompt: task,
    };
    for await (const e of runLoop(deps)) {
      renderEvent(e, opts.json);
      if (e.type === 'done') {
        await session!.appendLog({ kind: 'done', turns: e.turns, error: e.error });
        if (e.completion) finalState = e.completion.state;
      }
    }
  };

  if (opts.continueWith) {
    session = await Session.resume(d.home, opts.continueWith);
    fs.mkdirSync(session.scratchDir, { recursive: true });
    // Phase 2F: resume RECONSTRUCTS context (notes re-injected once as a section,
    // memory as an index) — it does not replay historical state mutations.
    const bundle = await assembleFor(session);
    const system = bundle.system;
    const memCount = (await listMemory(d.home)).length;
    const sections = ['environment', ...(bundle.system.includes('### Durable memory (index)') ? ['durable-memory-index'] : []), ...(bundle.system.includes('### Active task notes') ? ['active-task-notes'] : [])];
    renderEvent(
      { type: 'context_rebuilt', sessionId: session.id, notes: session.notes.length, memoryEntries: memCount, sections },
      opts.json,
    );
    renderEvent(
      {
        type: 'init',
        sessionId: session.id,
        model: session.meta.model,
        provider: provider.id,
        promptVersion: session.meta.promptVersion,
        stableHash: session.meta.stableHash,
        platform: d.platform,
        surface,
      },
      opts.json,
    );
    if (opts.headless) {
      if (!opts.task) throw new Error('headless --continue needs a task: aiagent --continue exec "keep going"');
      await runTask(opts.task, system);
    } else {
      stdout.write(`\x1b[2m(resumed session ${session.id})\x1b[0m\n`);
      await repl(system);
    }
  } else if (opts.headless) {
    if (!opts.task) throw new Error('usage: aiagent exec "task"');
    const system = await freshSession();
    await runTask(opts.task!, system);
    // Phase 2A harness authority: exit code reflects the GATE's verdict, not the model's claim.
    process.exitCode = finalState !== undefined ? COMPLETION_EXIT[finalState] : 0;
  } else {
    const system = await freshSession();
    stdout.write('\x1b[2maiagent — type a task, /help for commands, /exit to quit\x1b[0m\n\n');
    await repl(system);
  }
  rl?.close();

  async function repl(system: string) {
    for (;;) {
      const line = (await rl!.question('\x1b[32maiagent>\x1b[0m ')).trim();
      if (!line) continue;
      if (line === '/exit' || line === '/quit') break;
      if (line === '/help') {
        stdout.write('/exit — quit · /new — new session · /todo — show todo list · /notes <text> — save task note\n');
        continue;
      }
      if (line === '/new') {
        const s2 = await freshSession();
        stdout.write('\x1b[2m(new session)\x1b[0m\n');
        await repl(s2);
        return;
      }
      if (line === '/todo') {
        stdout.write(session!.todo.map((i) => `[${i.status}] ${i.text}`).join('\n') || '(no todos)\n');
        continue;
      }
      if (line.startsWith('/notes ')) {
        await session!.appendNote(line.slice(7), 'user'); // Phase 2F: re-injected on resume
        stdout.write(`\x1b[2m(note saved — ${session!.notes.length} total; re-injected on resume)\x1b[0m\n`);
        continue;
      }
      await runTask(line, system);
    }
  }
}

main().catch((e) => {
  console.error(`\x1b[31maiagent: ${e instanceof Error ? e.message : String(e)}\x1b[0m`);
  process.exit(1);
});
