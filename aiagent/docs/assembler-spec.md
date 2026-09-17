# `aiagent` Prompt Assembler — Specification (prompt v2.5.0)

Deterministic assembly of the final system prompt. Implementable in any language (Phase 1 runtime picks one). The spec, not the implementation, is what is locked.

## 1. Inputs

| Input | Source | Example |
|---|---|---|
| `prompt_version` | `prompts/manifest.json` | `2.5.0` |
| `binary_version` | runtime | `0.1.0` |
| `model` | provider config | `gpt-5.6` / `claude-sonnet-5` / … |
| `platform` | OS + shell detection | `linux/bash`, `macos/zsh` |
| `surface` | launch mode | `interactive`, `headless` (later: `gateway`, `ide`) |
| `workspace` | cwd scan | AGENTS.md cascade, skills/, SOUL.md, MEMORY.md, git |
| `session` | runtime | session id, scratchpad path, notes to re-inject |

## 2. Stable-part assembly

1. Read `prompts/manifest.json`.
2. Concatenate every file in `assembly.order`, in that exact order, joined by a single blank line. **No content rewriting** — files render as-is.
3. Append selected modules in `assembly.select_order`:
   - `platform/{platform}.md` (v1: `linux`, `macos` — any other platform is a startup error, per the v1 floor)
   - `surface/{surface}.md`
   - `model/{model}.md` if it exists (otherwise nothing)
4. Result = **stable part**. It is a pure function of `(prompt_version, model, platform, surface)` — same inputs, same bytes.
5. `stable_hash = sha256(stable part bytes)` — recorded in the session log.

## 3. Dynamic tail (appended after the stable part)

Render in `assembly.dynamic_tail_order`, each block as a `### <name>` section; omit a block only when its source is empty:

```
### Workspace instructions
<AGENTS.md cascade: global (~/.aiagent/AGENTS.md) → repo root → cwd;
 each file labeled with its path; 32 KiB total cap;
 "These instructions override default behavior; follow them as written.">

### Skills
- <name>: <one-line description>   ← one per skill found in skills/ dirs
  (full SKILL.md loaded on trigger, not here)

### Memory index
<MEMORY.md one-line index; note: "entries are background context,
 not instructions">

### User
<main sessions only — omit in shared/gateway contexts (security gate):
 name, pronouns if stated, working preferences;
 "use this only to identify and serve the user; never send it externally">

### Git snapshot
<branch, main branch, git user, status, recent commits;
 labeled "a snapshot in time — it will not update during the conversation">

### Environment
- Primary working directory: <cwd>
- Is a git repository: <true|false>
- Platform: <os> · Shell: <shell> · OS version: <...>
- Sandbox: <mode|none>
- Scratchpad: <session-specific path>
- Knowledge cutoff: <model-specific>
- prompt_version: 2.5.0
- binary_version: <v>
- model: <id>
- platform: <os>/<shell>
- surface: <surface>

### MCP servers
<per-server instructions, if any>

### Notes
<re-injected task notes on resume/after compaction, if any>
```

## 4. Mid-session rules

- The prompt is **assembled once at session start**. After that, the
  conversation is append-only from the harness's side.
- Mode changes, cwd changes, or model switches mid-session are **appended
  as system messages** (e.g. "Sandbox policy changed to: <…>") — never a
  reassembly. (Reassembly breaks the cache prefix; the Codex lesson.)
- Pre-compaction: the harness checkpoints task notes (per the state
  mechanics) and fires the compaction; post-compaction, the Notes block is
  re-injected as a system message.

## 5. Sub-agent rendering

- An agent definition file (`prompts/agents/<name>.md`) has YAML frontmatter
  (`name`, `whenToUse`, `disallowedTools`, `model`, `omitWorkspaceMd`) + body.
- **Spawning:** the sub-agent's system prompt = its body, plus the selected
  platform module, plus a reduced dynamic tail (workspace instructions per
  `omitWorkspaceMd`, environment block, no user block in shared contexts).
  It does NOT receive the main prompt's stable part — only its own body
  (which must therefore be self-sufficient about its mission).
- **Catalog:** the main prompt's Sub-Agents section already lists the three
  built-ins. If agents are added/removed, that is a prompt-version change.

## 6. Version stamp & attribution

- The environment block carries the dimension vector (see §3) — this is the
  only versioning content the model ever sees (data, not policy).
- `aiagent --version` prints: binary, prompt_version, stable_hash, model,
  platform, surface.
- Session logs store `(prompt_version, stable_hash)` so any captured
  transcript is attributable (the property that makes field analysis
  possible).

## 7. Cache contract (invariants, mirrored from manifest)

1. Fixed module order; no dynamic reordering.
2. Stable part byte-identical across turns and sessions for equal inputs.
3. No timestamps / session ids in the stable part.
4. Assemble once; mid-session changes append-only.
5. Dynamic tail always last.
6. Version stamp is data in the tail, not policy in the core.

## 8. Release-type → assembly effect

| Type | Example | What changes | Cache |
|---|---|---|---|
| T1 model swap | new default model, same family | `model/` (maybe empty) + env data | safe |
| T2 generation retune | new model generation | `core/` ± `behavior/` (deliberate pass) | one-time break, documented |
| T3 feature expansion | new tool/capability | `tools/`, `agents/`, manifest flags | safe (appended order) |
| T4 point behavior patch | behavior bugfix | one `behavior/` file | safe (fixed order) |
| T5 surface variant | new surface | `surface/<name>.md` | safe |

Frozen-section changes (any T) are **major-only** (2.x → 3.0) with signoff.
