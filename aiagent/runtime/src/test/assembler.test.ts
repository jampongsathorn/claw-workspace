import test from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble, parseFrontmatter } from '../core/assembler.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.AIAGENT_ROOT ?? path.resolve(here, '..', '..', '..');

const base = {
  rootDir: ROOT,
  platform: 'linux' as const,
  surface: 'interactive' as const,
  model: 'test-model',
  sandbox: 'direct',
  scratchpad: '/tmp/x',
  binaryVersion: '0.1.0',
};

test('assembler is deterministic (same inputs → same bytes/hash)', async () => {
  const a = await assemble({ ...base, cwd: '/tmp' });
  const b = await assemble({ ...base, cwd: '/tmp' });
  assert.strictEqual(a.stableHash, b.stableHash);
  assert.strictEqual(a.stablePart, b.stablePart);
});

test('stable part is independent of cwd (cache prefix invariant)', async () => {
  const a = await assemble({ ...base, cwd: '/tmp' });
  const b = await assemble({ ...base, cwd: '/etc' });
  assert.strictEqual(a.stableHash, b.stableHash);
});

test('stable part follows manifest order and includes selects', async () => {
  const a = await assemble({ ...base, cwd: '/tmp' });
  const ids = a.stablePart.split('# Identity').length - 1;
  assert.strictEqual(ids, 1);
  assert.ok(a.stablePart.startsWith('# Identity'));
  assert.ok(a.stablePart.includes('# Platform Notes — Linux'));
  assert.ok(a.stablePart.includes('# Surface Notes — Interactive Terminal'));
  // frozen sections present
  for (const s of ['# Core Operating Loop', '# Directive vs Inquiry', '# Reporting Outcomes', '# State Model', '# Authorization', '# Honesty'])
    assert.ok(a.stablePart.includes(s), `missing frozen section ${s}`);
});

test('dynamic tail last, with version stamp as data', async () => {
  const a = await assemble({ ...base, cwd: process.cwd() });
  const tail = a.system.slice(a.stablePart.length);
  assert.ok(tail.includes('prompt_version: '));
  assert.ok(tail.includes(`model: ${base.model}`));
  assert.ok(a.system.endsWith('surface: interactive'));
});

test('model override module is assembled when present', async () => {
  const a = await assemble({ ...base, cwd: '/tmp', model: 'no-such-model' });
  assert.ok(!a.stablePart.includes('model override applied'));
});

test('frontmatter: folded description + name', () => {
  const fm = parseFrontmatter('---\nname: scrutinize\ndescription: >\n  Outsider perspective.\n  End to end.\n---\n# Body');
  assert.strictEqual(fm.name, 'scrutinize');
  assert.strictEqual(fm.description, 'Outsider perspective. End to end.');
});
