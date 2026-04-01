# OpenClaw Memory Reference

> Source: Obsidian Vault / AI-Hub — OpenClaw Documentation

## Memory Files (Two Layers)

| File | Type | Purpose | When to Use |
|------|------|---------|-------------|
| `memory/YYYY-MM-DD.md` | Daily log (append-only) | Running context, day-to-day notes | Read today + yesterday at session start |
| `MEMORY.md` | Curated long-term memory | Durable facts, decisions, preferences | Only load in main, private session |

---

## Memory Tools

| Tool | Description |
|------|-------------|
| `memory_search` | Semantic recall over indexed snippets |
| `memory_get` | Targeted read of a specific Markdown file/line range |

---

## When to Write Memory

| Type | Target File |
|------|------------|
| Decisions, preferences, durable facts | `MEMORY.md` |
| Day-to-day notes, running context | `memory/YYYY-MM-DD.md` |
| Someone says "remember this" | Write it to file immediately |

---

## Session Start Checklist

1. Read `SOUL.md`
2. Read `USER.md`
3. Read `memory/YYYY-MM-DD.md` (today + yesterday)
4. If main session: also read `MEMORY.md`

---

## Automatic Memory Flush

When session nears auto-compaction, OpenClaw triggers a silent reminder to write durable memory before context is compacted.

---

## Memory Search Features

- **Hybrid search** (BM25 + Vector): combines keyword + semantic
- **MMR re-ranking**: reduces near-duplicate results
- **Temporal decay**: recent memories score higher (half-life: 30 days default)
- **MEMORY.md is never decayed** (evergreen)

---

## Key Principle

> If you want something to stick, **write it to a file**. Mental notes don't survive session restarts. Files do.
