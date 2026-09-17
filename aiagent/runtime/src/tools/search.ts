import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { Tool } from './registry.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build', 'coverage', '.venv', '__pycache__']);

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) await walk(p, out);
    } else if (e.isFile()) {
      out.push(p);
    }
  }
  return out;
}

function globToRegex(pattern: string): RegExp {
  let re = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i += 2;
        if (pattern[i] === '/') i++;
      } else {
        re += '[^/]*';
        i++;
      }
    } else if (c === '?') {
      re += '[^/]';
      i++;
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }
  return new RegExp('^' + re + '$');
}

export function makeGlobTool(): Tool {
  return {
    name: 'glob',
    description: 'Find files by glob pattern (e.g. "src/**/*.ts"). Returns matching paths.',
    parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
    readOnly: true,
    async execute(input, ctx) {
      const pattern = String(input.pattern);
      const rx = globToRegex(pattern);
      const files = await walk(ctx.cwd);
      const matches = files
        .map((f) => path.relative(ctx.cwd, f))
        .filter((rel) => rx.test(rel) || rx.test(path.posix.join('.', rel)))
        .sort()
        .slice(0, 500);
      return { ok: true, output: matches.length ? matches.join('\n') : 'no matches' };
    },
  };
}

function rgAvailable(): boolean {
  return existsSync('/usr/bin/rg') || existsSync('/usr/local/bin/rg');
}

function rg(pattern: string, cwd: string, include: string | undefined, max: number): Promise<{ out: string; code: number }> {
  return new Promise((resolve) => {
    const args = ['-n', '--max-count', String(max * 3), '--max-filesize', '1M'];
    if (include) args.push('-g', include);
    args.push('--', pattern, '.');
    execFile('rg', args, { cwd, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      resolve({ out: (stdout ?? '').trim(), code: err && !stdout ? 1 : 0 });
    });
  });
}

async function jsGrep(cwd: string, pattern: string, include: string | undefined, max: number): Promise<string[]> {
  const rx = new RegExp(pattern, 'm');
  const suffix = include ? include.replace(/^\*/, '') : null;
  const files = (await walk(cwd)).filter((f) => (suffix ? f.endsWith(suffix) : true));
  const hits: string[] = [];
  for (const f of files) {
    if (hits.length >= max) break;
    let text: string;
    try {
      text = await readFile(f, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\u0000')) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length && hits.length < max; i++) {
      if (rx.test(lines[i])) hits.push(`${path.relative(cwd, f)}:${i + 1}: ${lines[i].trim().slice(0, 300)}`);
    }
  }
  return hits;
}

export function makeGrepTool(): Tool {
  return {
    name: 'grep',
    description:
      'Search file contents with a regular expression (ripgrep when available). ' +
      'Use a narrow pattern and result cap; prefer searching over reading many files.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        include: { type: 'string', description: 'Optional glob filter for files, e.g. "*.ts"' },
        max_results: { type: 'number', description: 'Default 100' },
      },
      required: ['pattern'],
    },
    readOnly: true,
    async execute(input, ctx) {
      const pattern = String(input.pattern);
      const max = Math.min(Number(input.max_results ?? 100) || 100, 500);
      if (rgAvailable()) {
        const r = await rg(pattern, ctx.cwd, input.include ? String(input.include) : undefined, max);
        const lines = r.out ? r.out.split('\n') : [];
        return { ok: true, output: lines.length ? lines.slice(0, max).join('\n') : 'no matches' };
      }
      const hits = await jsGrep(ctx.cwd, pattern, input.include ? String(input.include) : undefined, max);
      return { ok: true, output: hits.join('\n') || 'no matches (js fallback)' };
    },
  };
}
