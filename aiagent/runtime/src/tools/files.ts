import { existsSync } from 'node:fs';
import { readFile as readFileAsync, writeFile as writeFileAsync, mkdir as mkdirAsync, rename as renameAsync, rm as rmAsync, realpath as realpathAsync, stat as statAsync } from 'node:fs/promises';
import path from 'node:path';
import type { Tool } from './registry.js';

// ── Phase 2G: workspace path confinement ────────────────────────────────────
//
// All file tools resolve strictly inside the working directory:
//  - `..` traversal and absolute paths outside cwd → rejected;
//  - symlink escape: the existing prefix is resolved via realpath and must
//    still be inside realpath(cwd) — a symlink inside the workspace pointing
//    outside is rejected;
//  - NUL bytes / empty paths → rejected.
// This is a harness boundary (authorization layer), not a prompt instruction:
// it holds in every permission mode and cannot be overridden by memory,
// notes, skills, or sub-agent guidance.

async function resolveSafePath(cwd: string, p: string): Promise<string> {
  const raw = String(p ?? '');
  if (!raw) throw new Error('empty path');
  if (raw.includes('\0')) throw new Error('invalid path (NUL byte)');
  const cwdReal = await realpathAsync(cwd).catch(() => path.resolve(cwd));
  const abs = path.resolve(cwd, raw);
  if (abs !== cwdReal && !abs.startsWith(cwdReal + path.sep))
    throw new Error(`unsafe path: ${p} escapes the working directory — file paths must stay inside the workspace`);
  let probe = abs;
  const tail: string[] = [];
  for (;;) {
    if (existsSync(probe)) break;
    const parent = path.dirname(probe);
    if (parent === probe) break;
    tail.unshift(path.basename(probe));
    probe = parent;
  }
  const real = await realpathAsync(probe).catch(() => probe);
  const realAbs = tail.length ? path.join(real, ...tail) : real;
  if (realAbs !== cwdReal && !realAbs.startsWith(cwdReal + path.sep))
    throw new Error(`unsafe path: ${p} resolves outside the working directory (symlink escape blocked)`);
  return realAbs;
}

export function makeReadTool(): Tool {
  return {
    name: 'read',
    description: 'Read a file (paths are confined to the working directory). Use start_line/end_line (1-based, inclusive) for large files.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        start_line: { type: 'number' },
        end_line: { type: 'number' },
      },
      required: ['path'],
    },
    readOnly: true,
    async execute(input, ctx) {
      try {
        const abs = await resolveSafePath(ctx.cwd, String(input.path));
        const s = await statAsync(abs).catch(() => null);
        if (!s) return { ok: false, output: `file not found: ${input.path}` };
        if (s.size > 1_000_000) return { ok: false, output: `file too large (${s.size} bytes) — use read with line ranges or grep` };
        const text = await readFileAsync(abs, 'utf8');
        const lines = text.split('\n');
        const start = Math.max(1, Number(input.start_line ?? 1));
        const end = Math.min(lines.length, Number(input.end_line ?? lines.length));
        const body = lines.slice(start - 1, end).map((l, i) => `${start + i}\t${l}`).join('\n');
        return { ok: true, output: `(${lines.length} lines total, showing ${start}–${end})\n${body}` };
      } catch (e) {
        return { ok: false, output: String(e instanceof Error ? e.message : e) };
      }
    },
  };
}

export function makeWriteTool(): Tool {
  return {
    name: 'write',
    description: 'Write a file (creates parent dirs; overwrites if exists; confined to the working directory). Inspect the target before overwriting.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
    readOnly: false,
    async execute(input, ctx) {
      try {
        const abs = await resolveSafePath(ctx.cwd, String(input.path));
        await mkdirAsync(path.dirname(abs), { recursive: true });
        await writeFileAsync(abs, String(input.content ?? ''));
        return { ok: true, output: `wrote ${input.path} (${String(input.content).length} chars)` };
      } catch (e) {
        return { ok: false, output: String(e instanceof Error ? e.message : e) };
      }
    },
  };
}

export function makeEditTool(): Tool {
  return {
    name: 'edit',
    description:
      'Edit a file by exact string match (confined to the working directory). old_string must match exactly once (include enough context to make it unique). ' +
      'Never issue two edits to the same file in one turn.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string' },
        new_string: { type: 'string' },
        replace_all: { type: 'boolean' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    readOnly: false,
    async execute(input, ctx) {
      try {
        const abs = await resolveSafePath(ctx.cwd, String(input.path));
        const text = await readFileAsync(abs, 'utf8');
        const old = String(input.old_string);
        const nu = String(input.new_string);
        const count = text.split(old).length - 1;
        if (count === 0) return { ok: false, output: 'old_string not found — read the file and include more context' };
        if (count > 1 && !input.replace_all)
          return { ok: false, output: `old_string is ambiguous (${count} matches) — add more context or set replace_all` };
        const next = input.replace_all ? text.split(old).join(nu) : text.replace(old, nu);
        await writeFileAsync(abs, next);
        return { ok: true, output: `edited ${input.path} (${input.replace_all ? count : 1} replacement${count === 1 ? '' : 's'})` };
      } catch (e) {
        return { ok: false, output: String(e instanceof Error ? e.message : e) };
      }
    },
  };
}

// ── Phase 2G: apply_patch — unified diff (bounded) + hardened batch edits ────

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  /** ' ' context, '-' delete, '+' add. */
  lines: { t: ' ' | '-' | '+'; s: string }[];
}
export interface DiffFile {
  /** target path (relative to cwd, `a/`/`b/` prefixes stripped). */
  rel: string;
  newFile: boolean;
  hunks: DiffHunk[];
}
const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Deterministic unified-diff parser (bounded subset).
 *  - file sections: `--- <a>` / `+++ <b>`; `--- /dev/null` = new file;
 *    `+++ /dev/null` (deletion) → rejected;
 *  - hunks with verified line counts (declared oldCount/newCount must match
 *    the hunk body — malformed → rejected);
 *  - no fuzz, no offset guessing, no binary patches.
 */
export function parseUnifiedDiff(patchText: string): { files: DiffFile[]; error?: string } {
  if (!patchText.trim()) return { files: [], error: 'empty patch' };
  if (/Binary files/i.test(patchText)) return { files: [], error: 'binary patches are not supported' };
  const lines = patchText.replace(/\r\n/g, '\n').split('\n');
  const files: DiffFile[] = [];
  let cur: DiffFile | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('--- ')) {
      cur = { rel: '', newFile: line.slice(4).trim() === '/dev/null', hunks: [] };
      files.push(cur);
      continue;
    }
    if (line.startsWith('+++ ') && cur) {
      let b = line.slice(4).trim();
      if (b === '/dev/null') return { files: [], error: 'file deletion is not supported by apply_patch' };
      if (b.startsWith('a/') || b.startsWith('b/')) b = b.slice(2);
      cur.rel = b;
      continue;
    }
    const hm = line.match(HUNK_RE);
    if (hm && cur) {
      cur.hunks.push({
        oldStart: Number(hm[1]),
        oldCount: hm[2] === undefined ? 1 : Number(hm[2]),
        newStart: Number(hm[3]),
        newCount: hm[4] === undefined ? 1 : Number(hm[4]),
        lines: [],
      });
      continue;
    }
    if (cur && cur.hunks.length > 0) {
      const h = cur.hunks[cur.hunks.length - 1];
      const oldSoFar = h.lines.filter((l) => l.t !== '+').length;
      const newSoFar = h.lines.filter((l) => l.t !== '-').length;
      const hunkDone = h.oldCount === oldSoFar && h.newCount === newSoFar;
      if (line[0] === ' ' || line[0] === '-' || line[0] === '+') {
        if (hunkDone) return { files: [], error: `malformed hunk in ${cur.rel}: more lines than declared` };
        h.lines.push({ t: line[0] as ' ' | '-' | '+', s: line.slice(1) });
      } else if (line === '') {
        if (!hunkDone) h.lines.push({ t: ' ', s: '' }); // empty context (some producers strip the leading space); a '' after the counts are met is just the trailing newline — not content
      } else {
        return { files: [], error: `malformed patch: unexpected line outside a hunk: ${JSON.stringify(line.slice(0, 60))}` };
      }
      // validate declared counts when the hunk ends: next line is a header /
      // non-hunk line / EOF, or the declared counts are already satisfied
      const next = lines[i + 1];
      const nextIsHunkLine =
        next !== undefined && next !== '' &&
        (next[0] === ' ' || next[0] === '-' || next[0] === '+') &&
        !next.startsWith('--- ') && !next.startsWith('+++ ');
      const hunkTerminatesHere =
        hunkDone ||
        next === undefined ||
        (next !== '' && !nextIsHunkLine && !HUNK_RE.test(next));
      if (hunkTerminatesHere) {
        const oldLines = h.lines.filter((l) => l.t !== '+').length;
        const newLines = h.lines.filter((l) => l.t !== '-').length;
        if (oldLines !== h.oldCount)
          return { files: [], error: `malformed hunk in ${cur.rel}: declared ${h.oldCount} old lines, found ${oldLines}` };
        if (newLines !== h.newCount)
          return { files: [], error: `malformed hunk in ${cur.rel}: declared ${h.newCount} new lines, found ${newLines}` };
      }
    }
  }
  for (const f of files) {
    if (!f.rel) return { files: [], error: 'malformed patch: file section without a +++ target' };
  }
  if (files.length === 0) return { files: [], error: 'malformed patch: no file sections found' };
  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f.rel)) return { files: [], error: `malformed patch: duplicate file section ${f.rel}` };
    seen.add(f.rel);
  }
  return { files };
}

/**
 * Apply one file's hunks to its current text. Deterministic: each hunk is
 * matched at its declared position first; otherwise an exact-match scan finds
 * the old block — exactly one match applies it (position is reported),
 * multiple matches → ambiguous (rejected), none → does not apply (rejected).
 */
export function applyHunksToText(
  fileName: string,
  current: string,
  newFile: boolean,
  hunks: DiffHunk[],
): { ok: true; text: string; added: number; removed: number } | { ok: false; error: string } {
  const lines = current.split('\n');
  let offset = 0;
  let added = 0;
  let removed = 0;

  if (newFile) {
    if (lines.length > 1 || (lines.length === 1 && lines[0] !== ''))
      return { ok: false, error: `new file ${fileName} already exists with content` };
    let outText = '';
    for (const h of hunks) for (const l of h.lines) {
      if (l.t === '+') {
        outText += l.s + '\n';
        added++;
      } else return { ok: false, error: `new-file hunk in ${fileName} contains context/delete lines` };
    }
    return { ok: true, text: outText, added, removed };
  }

  for (const h of hunks) {
    const oldBlock: string[] = [];
    const newBlock: string[] = [];
    for (const l of h.lines) {
      if (l.t === ' ') {
        oldBlock.push(l.s);
        newBlock.push(l.s);
      } else if (l.t === '-') {
        oldBlock.push(l.s);
        removed++;
      } else {
        newBlock.push(l.s);
        added++;
      }
    }
    // A pure-insertion hunk (oldCount 0, e.g. `@@ -3,0 +4,1 @@`) means
    // "insert AFTER line oldStart" — 0-based index oldStart, not oldStart-1.
    const insertion = oldBlock.length === 0;
    const tryAt = (idx: number): boolean => {
      if (idx < 0) return false;
      if (insertion) return idx <= lines.length;
      if (idx + oldBlock.length > lines.length) return false;
      for (let i = 0; i < oldBlock.length; i++) if (lines[idx + i] !== oldBlock[i]) return false;
      return true;
    };
    let pos = (insertion ? h.oldStart : h.oldStart - 1) + offset;
    if (!tryAt(pos)) {
      if (!insertion) {
        let matches = 0;
        let found = -1;
        for (let i = 0; i + oldBlock.length <= lines.length; i++) {
          if (tryAt(i)) {
            matches++;
            found = i;
            if (matches > 1) break;
          }
        }
        if (matches === 0)
          return { ok: false, error: `hunk does not apply in ${fileName} (declared at line ${h.oldStart}) — file content differs from the patch context` };
        if (matches > 1) return { ok: false, error: `hunk is ambiguous in ${fileName} (${matches} exact match positions) — add more context` };
        pos = found;
      } else {
        return { ok: false, error: `insertion position out of range in ${fileName} (after line ${h.oldStart})` };
      }
    }
    lines.splice(pos, oldBlock.length, ...newBlock);
    offset += newBlock.length - oldBlock.length;
  }
  return { ok: true, text: lines.join('\n'), added, removed };
}

interface WriteOp {
  rel: string;
  abs: string;
  text: string;
}

/** Per-file atomic write: temp file in the same dir + rename. */
async function atomicWriteFile(abs: string, text: string, failWriter?: (abs: string) => boolean): Promise<void> {
  if (failWriter?.(abs)) throw new Error(`write failed for ${path.basename(abs)}`);
  const tmp = `${abs}.aiagent-patch-${process.pid}`;
  await writeFileAsync(tmp, text);
  try {
    await renameAsync(tmp, abs);
  } catch (e) {
    await rmAsync(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

export function makeApplyPatchTool(failWriter?: (abs: string) => boolean): Tool {
  return {
    name: 'apply_patch',
    description:
      'Apply changes across one or more files, each written atomically (temp+rename). Two input forms: ' +
      '1) patch = a unified diff (--- a/… / +++ b/… / @@ hunks; new files via --- /dev/null); ' +
      '2) edits = [{path, old_string, new_string}] batch. ' +
      'All operations are validated BEFORE any write; a no-match mid-batch fails the whole call (no silent partial application). ' +
      'Paths are confined to the working directory (no traversal, absolute escape, or symlink escape). File deletion is not supported.',
    parameters: {
      type: 'object',
      properties: {
        patch: { type: 'string', description: 'A unified diff to apply' },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              old_string: { type: 'string' },
              new_string: { type: 'string' },
            },
            required: ['path', 'old_string', 'new_string'],
          },
        },
      },
    },
    readOnly: false,
    async execute(input, ctx) {
      // ── validate ALL, then write (no silent partial application) ──
      const ops: WriteOp[] = [];
      try {
        if (typeof input.patch === 'string') {
          const parsed = parseUnifiedDiff(input.patch);
          if (parsed.error) return { ok: false, output: `patch rejected: ${parsed.error} (no files were modified)` };
          for (const sec of parsed.files) {
            const abs = await resolveSafePath(ctx.cwd, sec.rel); // confinement + symlink check
            let original: string | null;
            if (sec.newFile) {
              if (existsSync(abs)) return { ok: false, output: `patch rejected: new file ${sec.rel} already exists (no files were modified)` };
              original = null;
            } else {
              try {
                original = await readFileAsync(abs, 'utf8');
              } catch {
                return { ok: false, output: `patch rejected: target file not found: ${sec.rel} (no files were modified)` };
              }
            }
            const res = applyHunksToText(sec.rel, original ?? '', sec.newFile, sec.hunks);
            if (!res.ok) return { ok: false, output: `patch rejected: ${res.error} (no files were modified)` };
            ops.push({ rel: sec.rel, abs, text: res.text });
          }
        } else if (Array.isArray(input.edits)) {
          const editOps = (input.edits as { path: string; old_string: string; new_string: string }[]) ?? [];
          if (editOps.length === 0) return { ok: false, output: 'no edits provided' };
          const loaded = new Map<string, { abs: string; text: string }>();
          for (const op of editOps) {
            const abs = await resolveSafePath(ctx.cwd, op.path);
            if (!loaded.has(abs)) {
              try {
                loaded.set(abs, { abs, text: await readFileAsync(abs, 'utf8') });
              } catch (e) {
                return { ok: false, output: `validation failed: ${e instanceof Error ? e.message : String(e)} (no files were modified)` };
              }
            }
            const count = loaded.get(abs)!.text.split(op.old_string).length - 1;
            if (count !== 1)
              return { ok: false, output: `validation failed for ${op.path}: old_string matches ${count}× (need exactly 1) — no files were modified` };
          }
          // apply in memory WITH re-validation: a replacement that invalidates
          // a later op fails the call instead of silently no-op'ing
          for (const op of editOps) {
            const e = loaded.get(await resolveSafePath(ctx.cwd, op.path))!;
            if (!e.text.includes(op.old_string))
              return {
                ok: false,
                output: `partial application PREVENTED for ${op.path}: an earlier edit in this batch invalidated a later edit (would no-op). No files were written — split the batch so later edits match post-edit content.`,
              };
            e.text = e.text.replace(op.old_string, op.new_string);
          }
          for (const [abs, e] of loaded) ops.push({ rel: path.relative(ctx.cwd, abs) || abs, abs, text: e.text });
        } else {
          return { ok: false, output: 'apply_patch requires "patch" (unified diff) or "edits" (batch)' };
        }
      } catch (e) {
        return { ok: false, output: String(e instanceof Error ? e.message : e) };
      }

      // ── write phase: per-file atomic; a mid-batch write failure is reported
      //    EXPLICITLY with exactly which files were and were not modified ──
      const applied: string[] = [];
      try {
        for (const op of ops) {
          await atomicWriteFile(op.abs, op.text, failWriter);
          applied.push(op.rel);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const pending = ops.filter((o) => !applied.includes(o.rel)).map((o) => o.rel);
        return {
          ok: false,
          output:
            `patch PARTIALLY applied — this is NOT a success: wrote [${applied.join(', ') || 'none'}] but NOT [${pending.join(', ')}] (error: ${msg}). ` +
            `The files listed as written were modified on disk; the rest are untouched. Fix the cause and re-apply the remainder explicitly.`,
        };
      }
      return { ok: true, output: `applied patch: ${ops.length} file(s) [${ops.map((o) => o.rel).join(', ')}] — each file written atomically (temp+rename)` };
    },
  };
}
