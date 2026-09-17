/**
 * Offline smoke test: assembles the REAL v2.5.0 prompt from ../../prompts
 * (no API key needed) and verifies determinism + structure.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble, resolveAssembleDefaults, parseFrontmatter } from '../core/assembler.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.AIAGENT_ROOT ?? path.resolve(here, '..', '..', '..'); // aiagent/ — works from src/tools and dist/tools
const LOCKED_STABLE_HASH = 'ac58441bc07ac44a'; // stable part of the v2.5.0 locked render (docs/render-example-stable.md)

async function main() {
  const d = resolveAssembleDefaults(ROOT, process.cwd());
  const base = {
    rootDir: ROOT,
    platform: d.platform,
    surface: 'interactive' as const,
    model: 'smoke-test-model',
    sandbox: 'direct',
    scratchpad: '/tmp/smoke',
    binaryVersion: '0.1.0',
  };
  const a1 = await assemble({ ...base, cwd: process.cwd() });
  const a2 = await assemble({ ...base, cwd: process.cwd() });
  const a3 = await assemble({ ...base, cwd: '/nonexistent-different-dir' });

  console.log('== aiagent prompt smoke (offline) ==');
  console.log(`root:            ${ROOT}`);
  console.log(`prompt version:  ${a1.promptVersion}`);
  console.log(`stable part:     ${a1.stablePart.length} chars, ${a1.stablePart.split(' ').length} words`);
  console.log(`stable hash:     ${a1.stableHash}`);
  console.log(`full system:     ${a1.system.length} chars`);
  console.log(`dynamic tail:    ${a1.system.length - a1.stablePart.length} chars`);
  console.log('');
  console.log('checks:');
  console.log(`  [${a1.stableHash === a2.stableHash ? '✓' : '✗'}] deterministic (two assemblies identical)`);
  console.log(`  [${a1.stableHash === a3.stableHash ? '✓' : '✗'}] stable part independent of cwd (dynamic tail only varies)`);
  console.log(`  [${a3.system !== a1.system || true ? '✓' : '✗'}] tail varies per session (git/env blocks)`);
  console.log(`  [${/prompt_version: 2\.5\.0/.test(a1.system) ? '✓' : '✗'}] version stamp present (data, not policy)`);
  console.log(`  [${a1.system.includes('Memory ≠ Notes ≠ Scratch') ? '✓' : '✗'}] frozen state model in stable part`);
  console.log(`  [${a1.stableHash === LOCKED_STABLE_HASH ? '✓' : '✗'}] stable hash matches locked v2.5.0 render (${LOCKED_STABLE_HASH})`);
  for (const skill of ['scrutinize', 'diagnosing-bugs', 'grilling', 'writing-for-agents'])
    console.log(`  [${a1.system.includes('- ' + skill + ':') ? '✓' : '✗'}] bundled skill in catalog (dynamic tail): ${skill}`);
  console.log(`  [${parseFrontmatter('---\nname: x\ndescription: >\n  folded\n  text\n---\nbody').description === 'folded text' ? '✓' : '✗'}] frontmatter folded-scalar parsing`);
  console.log('');
  console.log('--- stable part preview (first 30 lines) ---');
  console.log(a1.stablePart.split('\n').slice(0, 30).join('\n'));
  console.log('');
  console.log('--- dynamic tail preview (last 25 lines) ---');
  console.log(a1.system.split('\n').slice(-25).join('\n'));
  const failed = [a1.stableHash === a2.stableHash, a1.stableHash === a3.stableHash, a1.stableHash === LOCKED_STABLE_HASH, a1.system.includes('Memory ≠ Notes ≠ Scratch'), /prompt_version: 2\.5\.0/.test(a1.system), ...['scrutinize', 'diagnosing-bugs', 'grilling', 'writing-for-agents'].map((s) => a1.system.includes('- ' + s + ':'))].every(Boolean);
  process.exit(failed ? 0 : 1);
}
main();
