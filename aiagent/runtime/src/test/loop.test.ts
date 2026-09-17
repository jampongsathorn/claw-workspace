import test from 'node:test';
import assert from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runLoop } from '../core/loop.js';
import type { AgentEvent } from '../core/events.js';
import type { Provider, CompleteParams, CompleteResult } from '../providers/types.js';
import { Registry } from '../tools/registry.js';
import { makeExecTool } from '../tools/exec.js';
import { PermissionGate } from '../core/permissions.js';
import { Session } from '../core/session.js';

class ScriptedProvider implements Provider {
  readonly id = 'mock';
  constructor(private script: CompleteResult[]) {}
  async complete(_p: CompleteParams): Promise<CompleteResult> {
    return this.script.shift() ?? { text: 'done', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 } };
  }
}

async function setup(script: CompleteResult[]) {
  const home = await mkdtemp(path.join(tmpdir(), 'aiagent-home-'));
  const session = await Session.create(home, {
    model: 'mock', provider: 'mock', promptVersion: '2.5.0', stableHash: 'abc', cwd: process.cwd(), surface: 'headless',
  });
  const registry = new Registry();
  registry.register(makeExecTool());
  const gate = new PermissionGate('auto', false, true); // headless + yes
  const toolCtx = {
    cwd: process.cwd(),
    scratchpad: home,
    todo: () => [],
    setTodo: async () => {},
    ask: async () => 'ok',
  };
  const events: AgentEvent[] = [];
  const gen = runLoop({
    provider: new ScriptedProvider(script),
    model: 'mock',
    system: 'test system',
    registry,
    session,
    gate,
    toolCtx,
    maxTurns: 10,
    userPrompt: 'run echo hello',
  });
  for await (const e of gen) events.push(e);
  return { events, home };
}

test('loop: tool call executes, then text-only ends the loop', async () => {
  const { events, home } = await setup([
    { text: '', toolCalls: [{ id: 'c1', name: 'exec', input: { command: 'echo hello' } }], usage: { inputTokens: 1, outputTokens: 1 } },
    { text: 'Hello ran.', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 } },
  ]);
  const types = events.map((e) => e.type);
  assert.ok(types.includes('tool_call'));
  const tr = events.find((e) => e.type === 'tool_result') as any;
  assert.strictEqual(tr.ok, true);
  assert.ok(tr.output.includes('hello'));
  assert.strictEqual(types[types.length - 1], 'done');
  const done = events[events.length - 1] as any;
  assert.strictEqual(done.error, undefined);
  assert.strictEqual(done.turns, 2);
  // session persisted both assistant + tool messages
  assert.strictEqual((await Session.resume(home, 'latest')).messages.length, 4); // user, assistant(+tc), tool, assistant(final)
  await rm(home, { recursive: true, force: true });
});

test('loop: 3× identical tool call triggers loop detection', async () => {
  const call = { id: 'c1', name: 'exec', input: { command: 'true' } };
  const { events, home } = await setup([
    { text: '', toolCalls: [call], usage: { inputTokens: 1, outputTokens: 1 } },
    { text: '', toolCalls: [{ ...call, id: 'c2' }], usage: { inputTokens: 1, outputTokens: 1 } },
    { text: '', toolCalls: [{ ...call, id: 'c3' }], usage: { inputTokens: 1, outputTokens: 1 } },
  ]);
  assert.ok(events.some((e) => e.type === 'loop_detected'));
  const done = events[events.length - 1] as any;
  assert.match(done.error, /loop detected/);
  await rm(home, { recursive: true, force: true });
});

test('loop: read-only mode denies mutating tools', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'aiagent-home-'));
  const session = await Session.create(home, {
    model: 'mock', provider: 'mock', promptVersion: '2.5.0', stableHash: 'abc', cwd: process.cwd(), surface: 'headless',
  });
  const registry = new Registry();
  registry.register(makeExecTool());
  const gate = new PermissionGate('read-only', false, true);
  const events: AgentEvent[] = [];
  const gen = runLoop({
    provider: new ScriptedProvider([
      { text: '', toolCalls: [{ id: 'c1', name: 'exec', input: { command: 'echo x' } }], usage: { inputTokens: 1, outputTokens: 1 } },
      { text: 'ok', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 } },
    ]),
    model: 'mock',
    system: 's',
    registry,
    session,
    gate,
    toolCtx: { cwd: process.cwd(), scratchpad: home, todo: () => [], setTodo: async () => {}, ask: async () => '' },
    maxTurns: 5,
    userPrompt: 'go',
  });
  for await (const e of gen) events.push(e);
  const tr = events.find((e) => e.type === 'tool_result') as any;
  assert.strictEqual(tr.ok, false);
  assert.match(tr.output, /read-only/);
  await rm(home, { recursive: true, force: true });
});
