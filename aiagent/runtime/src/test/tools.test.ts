import test from 'node:test';
import assert from 'node:assert';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Registry, type ToolContext } from '../tools/registry.js';
import { makeReadTool, makeWriteTool, makeEditTool, makeApplyPatchTool } from '../tools/files.js';
import { makeGlobTool, makeGrepTool } from '../tools/search.js';
import { makeTodoTool } from '../tools/todo.js';
import { makeExecTool } from '../tools/exec.js';
import { makeAskTool } from '../tools/ask.js';
import type { TodoItem } from '../core/session.js';

async function ctx(cwd: string): Promise<ToolContext> {
  let todo: TodoItem[] = [];
  return {
    cwd,
    scratchpad: path.join(cwd, 'scratch'),
    todo: () => todo,
    setTodo: async (t) => { todo = t; },
    ask: async () => 'ok',
  };
}

test('write → read roundtrip', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aiagent-'));
  const c = await ctx(dir);
  const w = makeWriteTool();
  const r = makeReadTool();
  assert.strictEqual((await w.execute({ path: 'a/b.txt', content: 'hello\nworld\n' }, c)).ok, true);
  const out = (await r.execute({ path: 'a/b.txt' }, c)).output;
  assert.ok(out.includes('hello') && out.includes('world'));
  const range = (await r.execute({ path: 'a/b.txt', start_line: 2, end_line: 2 }, c)).output;
  assert.ok(range.includes('world') && !range.includes('hello'));
  await rm(dir, { recursive: true, force: true });
});

test('edit: unique match ok; ambiguous match rejected; replace_all works', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aiagent-'));
  const c = await ctx(dir);
  const w = makeWriteTool();
  const e = makeEditTool();
  await w.execute({ path: 'f.txt', content: 'x = 1\ny = 2\nx = 3\n' }, c);
  assert.strictEqual((await e.execute({ path: 'f.txt', old_string: 'y = 2', new_string: 'y = 20' }, c)).ok, true);
  const amb = await e.execute({ path: 'f.txt', old_string: 'x = ', new_string: 'z = ' }, c);
  assert.strictEqual(amb.ok, false);
  assert.match(amb.output, /ambiguous/);
  assert.strictEqual((await e.execute({ path: 'f.txt', old_string: 'x = ', new_string: 'z = ', replace_all: true }, c)).ok, true);
  const text = await readFile(path.join(dir, 'f.txt'), 'utf8');
  assert.strictEqual(text, 'z = 1\ny = 20\nz = 3\n');
  await rm(dir, { recursive: true, force: true });
});

test('apply_patch: multi-file, all-or-nothing validation', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aiagent-'));
  const c = await ctx(dir);
  const w = makeWriteTool();
  await w.execute({ path: 'a.txt', content: 'alpha\n' }, c);
  await w.execute({ path: 'b.txt', content: 'beta\n' }, c);
  const p = makeApplyPatchTool();
  const ok = await p.execute(
    { edits: [
      { path: 'a.txt', old_string: 'alpha', new_string: 'ALPHA' },
      { path: 'b.txt', old_string: 'beta', new_string: 'BETA' },
    ] },
    c,
  );
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(await readFile(path.join(dir, 'a.txt'), 'utf8'), 'ALPHA\n');
  const bad = await p.execute({ edits: [{ path: 'a.txt', old_string: 'nope', new_string: 'x' }] }, c);
  assert.strictEqual(bad.ok, false);
  assert.match(bad.output, /validation failed/);
  await rm(dir, { recursive: true, force: true });
});

test('glob + grep find files', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aiagent-'));
  const c = await ctx(dir);
  const w = makeWriteTool();
  await w.execute({ path: 'src/a.ts', content: 'export const needle = 1;\n' }, c);
  await w.execute({ path: 'src/b.ts', content: 'nothing here\n' }, c);
  const g = await makeGlobTool().execute({ pattern: 'src/**/*.ts' }, c);
  assert.ok(g.output.includes('src/a.ts') && g.output.includes('src/b.ts'));
  const gr = await makeGrepTool().execute({ pattern: 'needle' }, c);
  assert.ok(gr.output.includes('src/a.ts:1'));
  await rm(dir, { recursive: true, force: true });
});

test('todo: replaces list and persists via ctx', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aiagent-'));
  const c = await ctx(dir);
  const t = makeTodoTool();
  const r = await t.execute(
    { items: [
      { text: 'step one', status: 'in_progress' },
      { text: 'step two', status: 'pending' },
    ] },
    c,
  );
  assert.strictEqual(r.ok, true);
  assert.ok(r.output.includes('→') && r.output.includes('step one'));
  assert.strictEqual(c.todo().length, 2);
  await rm(dir, { recursive: true, force: true });
});

test('registry: specs expose 9 core tools', () => {
  const r = new Registry();
  for (const f of [makeReadTool, makeWriteTool, makeEditTool, makeApplyPatchTool]) r.register(f());
  r.register(makeExecTool());
  r.register(makeGlobTool());
  r.register(makeGrepTool());
  r.register(makeTodoTool());
  r.register(makeAskTool());
  const names = r.specs().map((s) => s.name).sort();
  assert.deepStrictEqual(names, ['apply_patch', 'ask', 'edit', 'exec', 'glob', 'grep', 'read', 'todo', 'write']);
});
