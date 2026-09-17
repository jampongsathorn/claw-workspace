/**
 * Session store — append-only JSONL (Phase 1). Durable, resumable, no deps.
 * `node:sqlite` (WAL + FTS5) lands behind this same interface in Phase 1
 * completion (per D6: the storage engine is a capability, not a contract).
 */
import { mkdir, readFile, writeFile, readdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProviderMessage } from '../providers/types.js';
import type { NoteEntry } from './state.js';

export interface TodoItem {
  text: string;
  status: 'pending' | 'in_progress' | 'done';
}

export interface SessionMeta {
  id: string;
  createdAt: string;
  lastAt: string;
  model: string;
  provider: string;
  promptVersion: string;
  stableHash: string;
  cwd: string;
  surface: string;
}

export class Session {
  private constructor(
    public readonly id: string,
    public readonly dir: string,
    public meta: SessionMeta,
    public messages: ProviderMessage[],
    public todo: TodoItem[],
    public notes: NoteEntry[],
  ) {}

  /**
   * Scratch = ephemeral session working state, session-LOCAL (Phase 2F).
   * Lives under the session dir: session B can never see session A's scratch,
   * and child sessions (Phase 2E) get their own. Survives a resume of the SAME
   * session (session-local, per the existing scratchpad contract) but is never
   * auto-injected into context and never promoted unless explicitly promoted.
   */
  get scratchDir(): string {
    return path.join(this.dir, 'scratch');
  }

  static async create(home: string, meta: Omit<SessionMeta, 'id' | 'createdAt' | 'lastAt'>): Promise<Session> {
    const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 8);
    const dir = path.join(home, 'sessions', id);
    await mkdir(dir, { recursive: true });
    const s = new Session(id, dir, { ...meta, id, createdAt: new Date().toISOString(), lastAt: new Date().toISOString() }, [], [], []);
    await s.writeMeta();
    return s;
  }

  static async resume(home: string, id: string | 'latest'): Promise<Session> {
    const base = path.join(home, 'sessions');
    let target = id;
    if (id === 'latest') {
      const entries = (await readdir(base)).filter((e) => !e.startsWith('.')).sort();
      if (entries.length === 0) throw new Error('no sessions to resume');
      target = entries[entries.length - 1];
    }
    const dir = path.join(base, target);
    const meta = JSON.parse(await readFile(path.join(dir, 'meta.json'), 'utf8')) as SessionMeta;
    const messages: ProviderMessage[] = [];
    const log = await readFile(path.join(dir, 'messages.jsonl'), 'utf8');
    for (const line of log.split('\n')) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line);
      if (rec.kind === 'message') messages.push(rec.value as ProviderMessage);
    }
    let todo: TodoItem[] = [];
    try {
      todo = JSON.parse(await readFile(path.join(dir, 'todo.json'), 'utf8'));
    } catch {
      /* no todo yet */
    }
    // Phase 2F: Notes survive resume (task-scoped state, re-injected by the assembler).
    const notes: NoteEntry[] = [];
    try {
      const log = await readFile(path.join(dir, 'notes.jsonl'), 'utf8');
      for (const line of log.split('\n')) {
        if (!line.trim()) continue;
        const n = JSON.parse(line) as NoteEntry;
        if (typeof n.text === 'string') notes.push(n);
      }
    } catch {
      /* no notes yet */
    }
    return new Session(meta.id, dir, meta, messages, todo, notes);
  }

  /** Explicit Notes append (session-scoped active task state; JSONL, append-only). */
  async appendNote(text: string, source: NoteEntry['source']): Promise<NoteEntry> {
    const n: NoteEntry = { ts: new Date().toISOString(), text: text.trim(), source };
    this.notes.push(n);
    await appendFile(path.join(this.dir, 'notes.jsonl'), JSON.stringify(n) + '\n');
    return n;
  }

  /** Explicit Notes clear. Irreversible (JSONL truncation) — documented. */
  async clearNotes(): Promise<void> {
    this.notes = [];
    await writeFile(path.join(this.dir, 'notes.jsonl'), '');
  }

  private async writeMeta(): Promise<void> {
    this.meta.lastAt = new Date().toISOString();
    await writeFile(path.join(this.dir, 'meta.json'), JSON.stringify(this.meta, null, 2));
  }

  /** Append a normalized provider message to the durable log. */
  async appendMessage(m: ProviderMessage): Promise<void> {
    this.messages.push(m);
    await appendFile(path.join(this.dir, 'messages.jsonl'), JSON.stringify({ kind: 'message', value: m }) + '\n');
    await this.writeMeta();
  }

  async appendLog(rec: Record<string, unknown>): Promise<void> {
    await appendFile(path.join(this.dir, 'events.jsonl'), JSON.stringify(rec) + '\n');
  }

  setTodo(todo: TodoItem[]): Promise<void> {
    this.todo = todo;
    return writeFile(path.join(this.dir, 'todo.json'), JSON.stringify(todo, null, 2));
  }

  get file(): string {
    return path.join(this.dir, 'messages.jsonl');
  }
}
