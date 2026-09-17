# Deep Research: Building an `aiagent` Harness
### A teardown of Claude Code, Gemini CLI, Codex CLI & Hermes Agent — and a blueprint for our own

- **Date:** 2026-09-17
- **Author:** Claw 🦞 (for Jam)
- **Scope:** How the four reference "agent harnesses" actually work, what they all converge on, and a phased plan for prototyping our own harness (`aiagent`).
- **Companion:** `research/aiagent-system-prompt-playbook.md` — teardown of the actual harness system prompts (from asgeirtj/system_prompts_leaks, cloned at `/home/user/sp-leaks`) + a ready-to-use `aiagent` base system prompt draft.
- **Companion:** `research/aiagent-updates-and-platforms.md` — how each harness ships versions (binary, prompt, and platform planes) and the update/platform recipe for `aiagent`.
- **Decision record:** `research/aiagent-decision-framework.md` — the 9 consolidated decisions (settled, pending sign-off) + the `aiagent` v2.5 architecture (four version dimensions, `prompts/` assembly tree, Memory/Notes/Scratch state tiers).

---

## 0. Executive Summary

An **agent harness** is the scaffolding that turns a raw LLM into an agent. Strip away branding and all four reference products are the **same machine wearing different clothes**:

> **A single-threaded loop that: assembles a stable prompt (system prompt + instruction files + tool schemas + history) → calls a model → executes tool calls (shell, file read/write/edit, search, web) with sandbox + approval guardrails → feeds results back → repeats until the model outputs plain text (done) — with context compaction, session persistence, and extension points (MCP / skills / hooks / subagents) bolted around it.**

Four reference points, four philosophies:

| Harness | Vendor | License / Stack | Philosophy |
|---|---|---|---|
| **Claude Code** | Anthropic | Closed (npm bundle) / JS · Agent SDK open | The most feature-complete coding agent: 30 lifecycle hooks, subagents, plan mode, auto-mode classifier, skills, loops (`/goal`, `/loop`, `/schedule`) |
| **Gemini CLI** | Google | Apache 2.0 / TypeScript | Open-source, readable, 1M-token context, ReAct loop, container sandboxing, GitHub Action |
| **Codex CLI** | OpenAI | Apache 2.0 / Rust (90+ crates) | Production LLMOps discipline: stateless ZDR requests, encrypted-reasoning continuity, structured compaction, OS-level sandboxing (Seatbelt / bwrap+Landlock / restricted tokens) |
| **Hermes Agent** | Nous Research | MIT / Python (+ Ink TUI) | The *personal* agent: model-agnostic (30+ providers), messaging gateway across 20+ platforms, self-improving skills, cross-session memory — and a `hermes claw migrate` path **from OpenClaw** |

**Key strategic insight:** the three vendor harnesses (Claude Code, Gemini CLI, Codex) are *coding agents bound to their own models* — the tight coupling is a feature (models are co-trained with the harness). Hermes is the only *model-agnostic personal agent*, and it is the closest relative to our own OpenClaw/Claw setup. For `aiagent`, the winning shape is likely: **Claude/Codex-grade coding core + Hermes-style personal-agent surfaces + OpenClaw-style workspace memory**, all behind a model-agnostic provider layer.

Everything you need to build a credible prototype exists in the public domain: Gemini CLI's loop is readable TypeScript; Codex is readable Rust; Hermes is MIT Python; and OpenAI/Anthropic have published detailed docs on the loop, caching, compaction, and sandboxing.

---

## 1. The Anatomy of an Agent Harness (the shared skeleton)

All four harnesses, independently, converge on these **8 layers**. This is the de-facto spec for `aiagent`.

```
┌────────────────────────────────────────────────────────────────┐
│  8. SURFACES    TUI/CLI · headless exec · IDE (ACP) · cloud    │
│  7. EXTENSIONS MCP servers · SKILL.md skills · hooks · agents  │
│  6. MEMORY     instruction files (AGENTS.md) · session DB      │
│  5. SAFETY     sandbox (OS-level) · approval modes · rules    │
│  4. CONTEXT    prompt cache · compaction · subagent isolation  │
│  3. PROMPT     stable system prompt + instruction cascade     │
│  2. TOOLS      shell · read · write/edit · glob/grep · web    │
│  1. LOOP       model ⇄ tools until text-only output           │
└────────────────────────────────────────────────────────────────┘
```

### 1.1 The agentic loop (layer 1) — deliberately simple

Every harness runs a **single-threaded master loop** (no swarms in the core):

1. **Receive prompt** → send to model with: system prompt + tool definitions + conversation history.
2. **Evaluate & respond** → model returns text **and/or** tool calls.
3. If tool calls: **execute each tool** (guarded by sandbox/permissions), append results as tool-result messages.
4. **Repeat** until the model produces a **text-only response** (= done), or an interrupt/limit/compaction event fires.

- Claude Code: "No complex multi-agent orchestration… A single-threaded master loop… Deliberate simplicity for debuggability." A typical task runs **5–50 iterations**.
- Gemini CLI: a classic **ReAct** loop (reason → act → observe) inside a three-layer structure: `GeminiClient` (orchestrator: hooks, loop detection, compression) → `Turn` (async-generator heart that parses the stream) → `GeminiChat` (history).
- Codex: loop over the **Responses API**; stateless requests; each turn appends to input; ends when the assistant returns a message with no tool calls.
- Hermes: input → build system prompt (once per session) → resolve provider → model call (one of 4 API modes) → if tool calls: dispatch via registry, append results, **goto model call**; else persist & done.

**Lesson:** build the loop first and keep it boring. Sophistication belongs in layers 2–7, not in the loop.

### 1.2 Tools (layer 2) — a small, composable primitive set

The model's "hands" are always a handful of primitives. Convergence is striking:

| Capability | Claude Code | Gemini CLI | Codex CLI | Hermes |
|---|---|---|---|---|
| Shell execution | `Bash` (persistent shell, background jobs, `KillShell`) | `run_shell_command` (PTY or spawn, interactive optional) | `shell` / unified exec (sandboxed) | terminal toolset |
| Read file | `Read` | `read_file` | (apply_patch context / read) | file read |
| Write file | `Write` | `write_file` | via `apply_patch` | file write |
| Edit file | `Edit` (string match) | `edit` | `apply_patch` (unified diff) | file edit |
| Find files | `Glob` | `glob` | built-in | glob |
| Search content | `Grep` (ripgrep) | ripgrep (vendored binary) | ripgrep | grep |
| Web fetch | `WebFetch` | `web_fetch` (private-IP blocked) | (browser/skills) | web toolset (Firecrawl) |
| Web search | `WebSearch` | Google Search grounding | — | web search |
| Task/todo | `TodoWrite`, `Task*` (planning tools) | `save_memory` | — | todo |
| Ask user | `AskUserQuestion` | confirmation prompts | approval prompts | ask |
| Subagents | `Task` (spawn isolated agent) | — (Task via extensions) | parallel worktrees (experimental) | `/bg` background sessions |
| Plan mode | `EnterPlanMode` / `ExitPlanMode` | — (plan via prompt) | read-only mode | — |
| Notebooks | `NotebookEdit` | — | — | — |
| External | **MCP tools** (deferred schemas, ToolSearch) | **MCP** (stdio/SSE/HTTP) | **MCP** (stdio+HTTP) | **MCP** |

Notes:
- **Bash is the Swiss-army knife.** Claude Code's system prompt pushes `Bash` + `ripgrep` over file-by-file reading for large codebases. Every harness gives the model an unrestricted-ish shell *behind* a sandbox.
- **Codex's `apply_patch`** (unified-diff edits) and **Claude's string-match `Edit`** are the two dominant edit paradigms. `apply_patch` scales to multi-file edits in one call.
- **MCP is universal** — all four support it. It is the standard for *live* external capabilities (JSON-RPC over stdio/HTTP, now governed under the Agentic AI Foundation, Linux Foundation).

**Lesson for `aiagent` MVP:** ship exactly `shell, read, write, edit, glob, grep, web_fetch, todo, ask` + MCP client. That ~9-tool surface reproduces ~95% of what users get from the big four.

### 1.3 Prompt assembly (layer 3) — stable, layered, cache-friendly

The prompt is assembled from a **fixed cascade**, in a strict order that never changes mid-session:

1. **System prompt** (base identity + tool-use policy + safety rules) — Claude Code's is ~2,900 tokens base, ~24k with tool schemas; it explicitly tells the model *which tool to reach for first* (grep before read, Read before Edit, etc.).
2. **Instruction file cascade** (project → home), e.g.:
   - Claude Code: `CLAUDE.md` (enterprise → user `~/.claude/CLAUDE.md` → project → subdirs)
   - Codex: `AGENTS.md` / `AGENTS.override.md` from `$CODEX_HOME` then **git root down to cwd**, 32 KiB cap, plus `config.toml` developer instructions
   - Gemini CLI: `GEMINI.md`
   - Hermes: persona (SOUL-like) + memory + skills, assembled **once per session**
   - (Our own repo: `AGENTS.md` + `SOUL.md` + `USER.md` + `TOOLS.md` — the OpenClaw convention, which Codex's `AGENTS.md` standard has now made near-universal.)
3. **Environment context** (cwd, git branch/state, OS) — Codex appends a *new* message if cwd changes rather than rewriting, to protect the cache prefix.
4. **Tool schemas** (deterministic order — reordering MCP servers silently kills cache hits).
5. **Conversation history** (grows every turn).

**Prompt caching is the single biggest cost lever.** OpenAI/Anthropic both cache on *exact prefix match* (≥1,024 tokens). Cached input ≈ 0.1× price, TTFT up to 80% faster. Consequences every harness engineers around:
- Stable content (instructions, tools, schemas) **first**; volatile content (timestamps, session state) **last or in later messages**.
- **Never rewrite history.** Codex encodes mid-session config changes (sandbox policy, approval mode, cwd) as *new appended messages*.
- Deterministic tool ordering; `prompt_cache_key` for routing stickiness (OpenAI); Anthropic caches CLAUDE.md for the session.

**Lesson:** treat the prompt prefix as sacred. Any feature that reorders or rewrites it is a tax.

### 1.4 Context management (layer 4) — the long-horizon problem

History grows unboundedly; the window doesn't. Four complementary techniques, all in use:

| Technique | Claude Code | Gemini CLI | Codex | Hermes |
|---|---|---|---|---|
| **Prompt caching** | ✅ (auto) | ✅ token caching | ✅ (aggressive, documented playbook) | ✅ prompt stability principle |
| **Compaction** | auto-compact at exhaustion; `PreCompact`/`PostCompact` hooks | `ChatCompressed` events, automatic | **`/responses/compact` endpoint → structured compaction items the model was *trained on***; auto at `auto_compact_limit`; manual `/compact` | `/compress` |
| **Subagent isolation** | `Task` tool: fresh context, only a 1–2k-token summary returns | via Task extension | parallel agents in git worktrees | `/bg` background sessions |
| **Loop detection** | maxTurns on subagents | `LoopDetectionService`, `LoopDetected` event, `MaxSessionTurns` | max turns | — (turn caps) |
| **Deferred tool loading** | ToolSearch (MCP schemas on demand) | — | — | progressive disclosure |
| **Big windows** | 200k (1M on some models) | **up to 1M tokens (Gemini 3)** | 1M on GPT-5.x Codex | provider-dependent |

Codex's compaction is the most interesting: instead of a human-readable summary, the API returns a **structured compaction item with encrypted content** that preserves the model's latent understanding, and the Codex models are fine-tuned to work from compacted context. This is available to *anyone* via the Responses API, not just Codex.

**Lesson:** MVP = threshold-based summarization compaction + turn caps + a `PreCompact`-style hook to save state. Upgrade later to API-native compaction if using OpenAI models.

### 1.5 Safety (layer 5) — sandbox first, then ask

The consensus threat model: the model is *well-intentioned but fallible*; prompts (and tool output!) can be *poisoned*. Defense in depth:

1. **OS-level sandbox around tool execution** (the strongest, all-but-ubiquitous):
   - **Codex (most rigorous):** macOS = `sandbox-exec` (Seatbelt, deny-by-default SBPL, parameterized writable roots, network off by default in full-auto); Linux = `codex-linux-sandbox` helper = **bubblewrap + Landlock + seccomp**; Windows = restricted tokens. Sandboxes the *child process tree*, not the agent itself. Env vars signal sandbox state (`CODEX_SANDBOX`, `CODEX_SANDBOX_NETWORK_DISABLED`). Anti-debug + core-dump + `LD_*`/`DYLD_*` env sanitization.
   - **Gemini CLI:** Seatbelt profiles on macOS (`permissive-open` default, `restrictive-closed`, `*-proxied`) + **Docker/Podman container image** cross-platform + network proxy for egress control.
   - **Claude Code:** OS sandboxing for Bash + hook-based policy + an **auto permission mode** where a *separate classifier model* approves/denies actions (sees messages + tool calls + CLAUDE.md, but not tool results).
   - **Hermes:** layered tool approval (permission modes, `/permission`, per-command approve/deny).
2. **Approval modes** (coarse autonomy dial):
   - Claude: `default` (ask) · `acceptEdits` (auto file edits) · `plan` (read-only, propose) · `dontAsk` (headless hard-deny) · `auto` (classifier) · `bypassPermissions` (isolated envs only).
   - Codex: read-only/suggest · auto (sandboxed; **on denial → ask for escalation**) · full access.
   - Gemini: per-tool confirmation (`shouldConfirmExecute`) + sandbox choice.
   - Hermes: `/permission [mode]`, `/approve`/`/deny`.
3. **Deterministic policy layer (hooks)** — Claude Code is the reference: ~30 lifecycle events (`SessionStart`, `UserPromptSubmit`, `PreToolUse` (can block/modify!), `PostToolUse`, `PostToolBatch`, `Stop`, `SubagentStop`, `PreCompact`, `PermissionRequest`, `WorktreeCreate/Remove`, `CwdChanged`, …) with three handler types: **command** (shell), **prompt** (one LLM verdict), **agent** (spawn a verifier subagent). Hooks are *guaranteed* execution — the model can't skip a hook, which is what makes them a real policy layer.
4. **Sandbox denial → escalation loop:** Codex detects "Operation not permitted" patterns, and instead of failing, prompts the user to re-run with wider permissions.

**Lesson for MVP:** Docker container execution (portable, matches Gemini) *or* bwrap+Landlock on Linux (matches Codex, lower overhead) + 3 approval modes + a `PreToolUse`-style blocklist hook. Network off by default in auto modes.

### 1.6 Memory & continuity (layer 6)

- **Instruction files** (above) = durable "who we are / how this repo works" memory.
- **Session persistence & resume:** Codex stores sessions in SQLite; Claude Code & Gemini CLI support resume/checkpointing; Hermes = SQLite `SessionDB` (WAL + **FTS5** full-text index) + `/resume`, `/sessions` picker, cross-session recall with LLM summarization.
- **Long-term personal memory:** Hermes goes furthest — *frozen-snapshot* persistent memory (curated, cached in prefix) + pluggable providers (Honcho, mem0, supermemory) + periodic "nudges" to curate. Our OpenClaw convention (daily `memory/YYYY-MM-DD.md` + curated `MEMORY.md`) is exactly the same pattern, and Hermes ships `hermes claw migrate` to adopt OpenClaw workspaces.
- **Codex's ZDR trick:** every request is self-contained (stateless server-side); continuity of the model's *reasoning* is preserved by returning `reasoning.encrypted_content` blobs that the client stores and echoes back. The server never retains data, but the model "remembers."

**Lesson:** SQLite + FTS5 from day 1; resume-by-session-id; instruction-file cascade; (optional later) encrypted-reasoning blobs if using OpenAI.

### 1.7 Extensions (layer 7) — MCP + Skills + Hooks + Subagents

The 2026 extension stack has standardized:

- **MCP (Model Context Protocol)** — *live* capabilities (JSON-RPC server processes: DBs, GitHub, browsers…). All four harnesses are MCP clients; Codex and Hermes can even run *as* MCP servers so other agents can call them.
- **Agent Skills (SKILL.md)** — open spec (Anthropic, Dec 2025; now de-facto cross-vendor, adopted by Codex, Gemini CLI, ChatGPT, and Hermes via `agentskills.io`): a folder with a `SKILL.md` (YAML frontmatter: name + description; body: instructions) + optional scripts/resources. *Static procedure* ("how to do this job"), progressive disclosure: name+description in the prefix, full content loaded only on trigger. Not a protocol — the agent just reads the file and acts with its existing tools. **This is exactly our OpenClaw `skills/` format.**
- **Hooks** (Claude's killer feature) — deterministic interception of lifecycle events.
- **Subagents** — spawn an isolated loop (own context window, own system prompt); only the *summary* returns to the parent. Claude Code's `Task` tool is the reference implementation; it's how one main agent avoids context bloat on large tasks. Codex does parallel *worktree* agents; Hermes does `/bg` background sessions.

**Lesson:** implement the *file conventions* (AGENTS.md cascade + SKILL.md skills) in phase 1 (they're just files), MCP client in phase 2, hooks + subagents in phase 3. Skills compatibility is nearly free and instantly portable.

### 1.8 Surfaces (layer 8) — one core, many faces

| Surface | Claude Code | Gemini CLI | Codex | Hermes |
|---|---|---|---|---|
| Interactive TUI/CLI | ✅ | ✅ (Ink) | ✅ (Ratatui) | ✅ + new Ink TUI |
| Headless / CI | `-p` print mode | `-p` + `--output-format json/stream-json` | `codex exec` | `hermes chat -q` / batch runners |
| IDE integration | VS Code / JetBrains | ACP (`--experimental-acp`) | app-server JSON-RPC + VS Code ext | **ACP** (VS Code, Zed, JetBrains) |
| GitHub Action | ✅ | ✅ (`@gemini-cli` PR review/triage) | Cloud Codex + GitHub integration | — |
| Cloud/sandboxed execution | Claude Code on the web | — (Cloud Shell) | **Codex Cloud** (isolated containers) | — (Docker image) |
| Messaging | — (desktop/slack via SDK) | — | — | **20+ platforms** (Telegram, Discord, Slack, WhatsApp, Signal, SMS, Teams, Matrix, iMessage…) via one gateway |
| Scheduling | `/loop`, `/schedule` (cloud) | — | — | built-in **cron** |
| SDK for building on top | **Agent SDK (TS/Python)** — same loop as the product | core package is importable | `codex-rs` crates + Python/TS SDKs | Python library + `environments/` (RL/Atropos training!) |

**Lesson:** design the core to be surface-agnostic (event stream in, prompt in → events out). TUI and headless `exec` from day 1; ACP adapter when we need editors; a gateway when we need chat platforms.

---

## 2. Per-Harness Deep Dives

### 2.1 Claude Code (Anthropic)

**What it is:** the most feature-complete closed-source coding agent; the de-facto benchmark. Distributed as a bundled npm package; the loop is reproducible via the open **Agent SDK** (TypeScript/Python), which exports the same execution loop with programmatic control (`canUseTool` callbacks, permission modes, hooks, MCP config).

**Loop details:**
- Single-threaded master loop; middleware-style pipeline per tool call: **PreToolUse hooks → permission check → tool executes → PostToolUse hooks → system reminders injected**.
- Loop ends on: text-only response (normal), Escape interrupt, context exhaustion → auto-compaction, `maxTurns` on subagents, or a **Stop hook that blocks termination** (yes, hooks can force Claude to keep working — great for "don't stop until tests pass").
- **Permission modes:** `default` / `acceptEdits` / `plan` / `dontAsk` / `auto` / `bypassPermissions`. **Auto mode** is the notable innovation: a *separate classifier model* (sees messages, tool calls, CLAUDE.md — deliberately *not* tool results, to limit poisoning surface) approves/denies non-trivial actions.

**Tools (v2.1.x, extracted):** `Task` (subagent spawn), `TaskOutput`, `Bash` (+`KillShell`), `Glob`, `Grep`, `Read`, `Edit`, `Write`, `NotebookEdit`, `WebFetch`, `WebSearch`, `TodoWrite`, `AskUserQuestion`, `Skill`, `EnterPlanMode`/`ExitPlanMode`, `ToolSearch` (deferred MCP discovery), plus a 2026 agent-team set (`TeamCreate`, `TaskCreate/Update/List`, `SendMessage`, `TaskStop`) and any MCP tools.

**System prompt anatomy:** base identity + **explicit tool-selection policy** ("use Grep, not Bash-for-grep; Read before Edit…") + task management rules + git safety + tone. The prompt is doing as much work as the model — it's the cheapest way to steer behavior.

**Skills & subagents:** `SKILL.md` progressive disclosure (only names+descriptions in the prefix). Subagents (`Task`) get a fresh context + own system prompt; **only a condensed summary (1–2k tokens) returns to the parent** — this is the single best context-economy trick in the industry.

**Hooks:** ~30 events (see §1.5), three handler types (command/prompt/agent). Config in `.claude/settings.json` (project) + `~/.claude/settings.json` (user). This is the reference "deterministic policy layer" design.

**Loops taxonomy (Anthropic, June 2026):** turn-based (you prompt), **goal-based** (`/goal` — runs until a checkable stop condition), **time-based** (`/loop` local interval, `/schedule` cloud cron), **proactive** (composed; no human in loop). Worth stealing the *taxonomy* even if not the features.

**Steal:** hook system design, subagent summary-return, auto-mode classifier idea, plan mode, todo/planning tools, loop taxonomy.
**Watch out:** closed source → you're reverse-engineering docs, not reading code; the feature velocity is relentless (don't try to match all of it).

### 2.2 Gemini CLI (Google)

**What it is:** Apache-2.0 open-source terminal agent in TypeScript (monorepo: `@google/gemini-cli` front-end + `@google/gemini-cli-core` engine). The **most readable full harness implementation** — the fastest way to learn the architecture is to read its source.

**Loop details (three layers):**
1. **`GeminiClient`** (outer orchestrator): `sendMessageStream()` is an AsyncGenerator that fires **BeforeAgent hooks** → runs turns → checks every event against a **LoopDetectionService** → fires **AfterAgent hooks** (which can stop, block, clear context, or *inject continuation turns*).
2. **`Turn`** (heart): consumes the model stream, parses `thoughts` / `content` / `functionCall` parts; yields a typed event union: `Content`, `Thought`, `ToolCallRequest`, `ToolCallResponse`, `ToolCallConfirmation`, `ChatCompressed`, `Finished`, `Retry`, `Error`, `UserCancelled`, `LoopDetected`, `MaxSessionTurns`, `Citation`, `ContextWindowWillOverflow`, `ModelInfo`, `AgentExecutionStopped/Blocked`.
3. **`GeminiChat`**: history management → `generateContentStream` to the Gemini API.
- Tool execution: `CoreToolScheduler` validates params → calls the tool's `shouldConfirmExecute` (→ user confirmation prompt) → `execute()` → result formatted as `functionResponse` part → recorded in history.

**Context:** runs on the Gemini 3 family (Flash/Pro mix) with **up to 1M-token context** — the agent can hold a large slice of a codebase at once; plus token caching, automatic **chat compression** (with `ContextWindowWillOverflow` early warning), and **conversation checkpointing** (resume long sessions).

**Sandbox:** Seatbelt on macOS (profiles: `permissive-open` default → `restrictive-closed`; `*-proxied` routes egress through a proxy) + **Docker/Podman** cross-platform via a published sandbox image (`us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox`); `SANDBOX_MOUNTS`, `SANDBOX_ENV`, UID/GID mapping, custom flags.

**Surfaces:** interactive TUI; `gemini -p "..."` headless with `--output-format json|stream-json`; official **GitHub Action** (`@gemini-cli` for PR review & issue triage); ACP support; extensions; MCP (stdio/SSE/HTTP).

**Steal:** the three-layer client/turn/chat decomposition (cleanest to imitate), typed event union (great API for TUI *and* headless consumers), checkpointing, 1M-window strategy, GitHub Action.
**Watch out:** single-vendor models; TypeScript engine (fine for a prototype).

### 2.3 Codex CLI (OpenAI)

**What it is:** Apache-2.0, **Rust** (`codex-rs` Cargo workspace, ~90 crates) — the most *production-engineered* harness. Crate-per-concern with an explicit rule: `codex-core` is a **last resort**; prefer specialized crates (`sandboxing`, `exec`, `tui`, `mcp-server`, `app-server`, `state`, `hooks`, `skills`, `memories`, `model-provider`, `network-proxy`, …). That discipline is itself a lesson.

**Loop details:**
- Built on the **Responses API** (multi-endpoint: ChatGPT auth → `chatgpt.com/backend-api/codex/responses`; API key → `api.openai.com/v1/responses`; `--oss` local models via Ollama/LM Studio; Azure supported).
- **Stateless by design** (Zero-Data-Retention compliant): every request carries the full input; continuity of reasoning via `reasoning.encrypted_content` blobs the client stores/echoes.
- **Cache discipline (documented playbook):** append-only history; mid-session changes (sandbox policy, approval mode, cwd) appended as *new* messages; deterministic tool ordering; `prompt_cache_key` for routing; `auto_compact_limit` tuned high enough to avoid premature resets; anti-patterns: timestamps in system prompt, MCP reconnect churn, model switches.
- **Compaction:** `/responses/compact` returns *structured compaction items* (not prose summaries) — models are trained to reason from them; auto at threshold, manual `/compact`.
- **Instructions:** `AGENTS.md` cascade — `$CODEX_HOME` (`AGENTS.override.md`, `AGENTS.md`) → git/project root → cwd; 32 KiB cap; `project_doc_fallback_filenames` lets you point at other filenames. (This is the standard our own `AGENTS.md` already follows.)

**Safety:** the benchmark. macOS **Seatbelt** (deny-by-default SBPL generated from `SandboxPolicy`; `.git`/`.codex` kept read-only even in write modes); Linux **bubblewrap (filesystem view) + Landlock + seccomp** in a `codex-linux-sandbox` helper; Windows **restricted tokens**. Network **off by default** in full-auto. Denial detection → permission-escalation prompt. Env sanitization, anti-debug, core-dump off.

**Modes & tools:** approval modes (read-only → auto-with-sandbox → full access); `apply_patch` unified-diff editing (multi-file in one call); shell; MCP (stdio+HTTP); **image input** (screenshots/wireframes → code); **`codex exec`** headless for CI; **parallel agents in git worktrees** (experimental); **Codex as an MCP server**; `codex` is also an app-server (JSON-RPC) for IDE/desktop integration.

**Surfaces:** Ratatui TUI (composer, diff viewer, approval flow, session picker); `codex exec`; Cloud Codex (OpenAI-hosted sandboxes, async GitHub-integrated jobs); VS Code extension.

**Steal:** sandbox architecture (esp. denial→escalation), cache-preserving append-only config changes, structured compaction, crate-per-concern monorepo discipline, headless `exec`, AGENTS.md cascade.
**Watch out:** Rust raises the build bar; deep OpenAI-API coupling (Responses API, encrypted reasoning).

### 2.4 Hermes Agent (Nous Research)

**What it is:** MIT-licensed, **Python** (with a Node/Ink TUI) — "the agent that grows with you." The only *personal-agent* reference here, and the one architecturally closest to our own OpenClaw world: model-agnostic, multi-surface, memory-first, skills-first. Notably it ships **`hermes claw migrate`** — a first-class migration path *from OpenClaw workspaces* (i.e., from a workspace shaped exactly like ours).

**Loop details:**
```
1. Receive input        → CLI / TUI / gateway / cron / ACP / web
2. Build system prompt  → persona + memory + skills + tools  (ONCE per session)
3. Resolve provider     → API key + endpoint for chosen model
4. Call model           → one of 4 API modes, auto-detected:
                          chat_completions | codex_responses |
                          anthropic_messages | bedrock_converse
5. Parse response       → tool calls? dispatch via registry → append → GOTO 4
                          else final message → display → persist
6. Persist              → SQLite SessionDB (WAL + FTS5 index)
```

**Model-agnostic is the headline:** 30+ providers (Nous Portal with 300+ models, OpenRouter, Anthropic, OpenAI, Bedrock, any OpenAI-compatible endpoint including local). The 4-mode provider adapter is the right abstraction for a model-agnostic harness — it normalizes the two protocol families (chat-completions-style vs Anthropic-messages-style) plus OpenAI's Codex responses path.

**Surfaces:** classic CLI + new **Ink TUI** (JSON-RPC `tui_gateway`, subagent observability overlay, voice mode); **messaging gateway** — one process serving Telegram, Discord, Slack, WhatsApp, Signal, DingTalk, SMS, Mattermost, Matrix, Webhook, Email, Home Assistant, Feishu/Lark, WeCom, Weixin, iMessage, QQBot, IRC, Teams, Google Chat, LINE, SimpleX…; **IDEs via ACP** (VS Code, Zed, JetBrains); web UI; **built-in cron scheduler**; batch runners.

**Skills (the "killer feature"):** `agentskills.io`-compatible `SKILL.md` with **3-level progressive disclosure** (name → description → full body+resources); conditional activation; **`skill_manage` tool → autonomous skill creation after complex tasks and self-improvement during use** (the agent writes its own playbooks); a skills hub for sharing. This is "self-improvement" implemented as *file-based learning artifacts the agent owns* — no fine-tuning required.

**Memory (3 mechanisms):** (1) **frozen-snapshot persistent memory** — curated, stable, sits in the cached prefix (exactly our `MEMORY.md` pattern); (2) **cross-session recall** — FTS5 session search + LLM summarization (our `memory/YYYY-MM-DD.md` pattern); (3) **pluggable providers** — Honcho / mem0 / supermemory. Plus periodic "nudge" turns that make the agent curate memory (our heartbeat pattern).

**Other:** self-registering tool registry + **toolsets** (bundle tools by domain, e.g. `--toolsets "web,terminal,skills"`); layered tool approval (`/permission`, `/approve`/`/deny`); **profiles** (isolated multi-instance agents); `COMMAND_REGISTRY` pattern for slash commands; skin engine (theming as data); `/context` visualization (per-category token breakdown); RL/Atropos training integration (`environments/` — the agent as a training-data pipeline, very Nous).

**Steal (most of this, honestly):** provider-adapter design (4 modes), frozen-memory-in-prefix + FTS5 recall, SKILL.md progressive disclosure *and* `skill_manage` self-improvement, gateway surfaces, profiles, toolsets, `/context` token accounting.
**Watch out:** Python + the sheer scope (20+ chat platforms is a big maintenance surface); "personal agent" ergonomics ≠ "coding agent" ergonomics (no apply_patch-grade diff UX, no Seatbelt-grade sandbox — layered approvals instead).

---

## 3. Comparison Matrix

| Dimension | **Claude Code** | **Gemini CLI** | **Codex CLI** | **Hermes Agent** | **→ `aiagent` target** |
|---|---|---|---|---|---|
| Vendor | Anthropic | Google | OpenAI | Nous Research | Jam |
| License | Closed (SDK open) | Apache 2.0 | Apache 2.0 | MIT | — |
| Language | JS (bundled) | TypeScript | Rust (90+ crates) | Python (+Ink) | **TS or Python** (prototype) |
| Loop | Single-threaded, middleware pipeline | ReAct, 3-layer (Client→Turn→Chat) | Single-threaded over Responses API | Single-threaded, 6-step | Single-threaded + event stream |
| Model binding | Claude only | Gemini only (1M ctx) | OpenAI codex models (+local `--oss`) | **Any (30+ providers, 4 modes)** | **Model-agnostic layer** |
| Instruction files | `CLAUDE.md` | `GEMINI.md` | `AGENTS.md` (cascade, 32KB cap) | persona+memory+skills | **`AGENTS.md` cascade** (we already have one!) |
| Core tools | 20+ (Task, Bash, Glob, Grep, Read, Edit, Write, Web*, Todo, Plan…) | read/write/edit/shell/web_fetch/glob + Google Search | shell, apply_patch, MCP, images | terminal/files/web + toolsets | shell, read, write, edit, glob, grep, web, todo, ask |
| Sandbox | OS sandbox + hooks + auto-classifier | Seatbelt / Docker / Podman + proxy | **Seatbelt / bwrap+Landlock+seccomp / restricted tokens** | layered approvals | **bwrap+Landlock (Linux) or Docker** + 3 modes |
| Approval | 6 modes incl. plan & classifier-auto | per-tool confirm + sandbox | read-only / auto(escalate) / full | `/permission` modes | read-only / auto / full |
| Context mgmt | cache + auto-compact + subagents | cache + auto-compress + checkpoints + 1M | cache (playbook) + **structured compaction** + encrypted reasoning | `/compress`, FTS5 recall, frozen prefix | cache + threshold compaction + resume |
| Memory | CLAUDE.md; session resume | GEMINI.md; checkpointing | AGENTS.md; SQLite sessions | **3-mechanism memory + self-curation** | AGENTS.md + SQLite FTS5 + MEMORY.md pattern |
| Skills | ✅ SKILL.md | ✅ (extensions) | ✅ | ✅ + **self-creation (skill_manage)** | ✅ SKILL.md-compatible (we have `skills/`) |
| MCP | ✅ (deferred schemas, ToolSearch) | ✅ stdio/SSE/HTTP | ✅ stdio/HTTP + **server mode** | ✅ | ✅ client (+server later) |
| Hooks | **~30 events, 3 handler types** | Before/AfterAgent hooks | `hooks` crate | command registry | Pre/PostToolUse + Stop to start |
| Subagents | ✅ Task (summary return) | via extensions | ✅ worktrees (experimental) | ✅ `/bg` sessions | ✅ later (summary return) |
| Headless | `-p` | `-p` + JSON out | **`codex exec`** | `chat -q`, batch | `aiagent exec` |
| Surfaces | CLI, IDE, GH Action, web, SDK | CLI, GH Action, ACP | TUI, exec, cloud, IDE, SDK | CLI, TUI, **20+ chat platforms**, ACP, cron, web | CLI + exec first; gateway/ACP optional |
| Standout trick | classifier auto-mode; hooks can force continuation | 1M context + checkpointing; clean event union | denial→escalation; ZDR + encrypted reasoning | self-improving skills; OpenClaw migration | pick 1–2 per phase |

---

## 4. What This Means for `aiagent` — Design Decisions & Blueprint

### 4.1 Decisions to make first (ask Jam)

| # | Decision | Options | Claw's recommendation |
|---|---|---|---|
| D1 | **Language** | TypeScript · Rust · Python | **TypeScript** for the prototype (fastest to TUI + MCP ecosystem + Gemini CLI is a readable reference). Rust only if `aiagent` is meant to be a durable product; then fork `codex-rs` patterns or start from `astral-code` (an open, provider-neutral Rust clone of Codex). Python if we want Hermes-style rapid iteration + easy reuse of `skills/` scripts. |
| D2 | **Model strategy** | single-vendor (best quality) · model-agnostic (flexible, what we need for a personal agent) | **Model-agnostic provider layer** (Hermes's 4-mode adapter pattern) with per-model system-prompt variants. Start wired for 1–2 models. |
| D3 | **Positioning** | pure coding harness (Claude/Codex class) · personal agent (Hermes class) · hybrid | **Hybrid, coding-first:** a terminal coding agent that lives in *our* OpenClaw workspace (AGENTS.md/SOUL.md/skills/memory) and can be spawned by Claw via ACP — the existing "Claw orchestrates → Claude Code codes" pattern, but with our own coder. |
| D4 | **Default model(s)** | Claude · GPT-codex · Gemini · local | Start with whatever Jam's keys cover; provider layer makes this cheap. |
| D5 | **Sandbox** | Docker (portable, Gemini-style) · bwrap+Landlock (native, Codex-style) · none (trust mode only) | **bwrap+Landlock on Linux** with a Docker fallback; network off in auto mode. |
| D6 | **Scope of MVP** | see §4.2 | 9 tools + loop + TUI + exec + SQLite sessions. ~2–4 weeks part-time. |

### 4.2 Phased build plan (each phase = a runnable product)

**Phase 1 — The Loop (days 1–5):** *Goal: a prompt in, a working terminal agent out.*
- Agent loop: prompt → model call → tool dispatch → append → repeat until text-only. Typed event stream (Gemini's union: `content | thought | tool_call | tool_result | done | error | retry | loop_detected | max_turns`).
- Core 9 tools: `shell` (PTY-capable), `read`, `write`, `edit` (string-match), `apply_patch` (unified diff), `glob`, `grep` (ripgrep), `todo`, `ask_user`.
- Minimal TUI (Ink/React or a ratatui port): streaming text, tool-call cards, approval prompts, Esc to interrupt.
- Headless: `aiagent exec "task"` + `--output-format json|stream-json` (CI from day 1).
- Session persistence: SQLite (WAL) — every message/tool call; `--resume <id>` / `--continue`.
- **Reference code to copy:** gemini-cli `GeminiClient`/`Turn`/`GeminiChat`; hermes loop steps.

**Phase 2 — Context & Safety (week 2):** *Goal: long sessions that stay cheap and safe.*
- Prompt assembly: stable system prompt + `AGENTS.md` cascade (home → repo root → cwd, size cap) + environment context (cwd, git branch, OS) + deterministic tool schemas. **No timestamps in the prefix. Append-only config changes.**
- Prompt-cache aware: log `cached_tokens` per turn (the `prompt_cache_key` equivalent per provider); a `/context` command showing per-category token breakdown (Hermes).
- Compaction: threshold (e.g., 80% of window) → summarize into a structured "state" message (task, decisions, files touched, open questions); `PreCompact`-style hook to dump the full transcript to disk first.
- Sandbox: wrap every `shell`/exec call — Linux bwrap+Landlock(+seccomp), macOS Seatbelt, Docker fallback; env sanitization; network off by default.
- Approval modes: `read-only` / `auto` (sandboxed; **denial → ask to escalate**, Codex pattern) / `full`. Allow/deny rule files per command pattern.
- Turn caps + loop detection (N identical tool calls → stop and report).
- **Reference:** codex-rs `sandboxing/`, `safety` tests; gemini-cli Seatbelt profiles; OpenAI prompt-caching playbook.

**Phase 3 — Extensions (week 3–4):** *Goal: it grows with us.*
- **Skills:** load `SKILL.md` (YAML frontmatter) from `skills/` dirs; progressive disclosure (names+descriptions in prefix, body on trigger); **`skill_manage`** tool so the agent can create/update skills after hard tasks (Hermes's self-improvement loop). Our existing `skills/` folder becomes the content.
- **MCP client:** stdio + HTTP servers from a config file; deterministic tool ordering; (later) deferred schema loading / tool search.
- **Hooks:** config-driven lifecycle hooks — `PreToolUse` (block/modify — the one safety feature that must exist before any "auto" mode), `PostToolUse` (auto-format, audit log), `UserPromptSubmit` (inject date/branch), `Stop` (completion gate: "tests must pass").
- **Subagents:** `task` tool → isolated loop, fresh context, **only summary returns** (Claude pattern); `maxTurns` guard.
- **Memory:** FTS5 over sessions (cross-session recall command) + frozen `MEMORY.md`-style snapshot in the cached prefix (our OpenClaw pattern, Hermes mechanism #1).

**Phase 4 — Surfaces (week 5+, optional):** *Goal: meet Jam where Jam is.*
- **ACP adapter** (Agent Client Protocol) → VS Code / Zed / JetBrains, and — the killer integration — **Claw spawning `aiagent` via ACP** to replace the current Claude-Code-via-ACP delegation (our `AGENTS.md` already documents this pattern; the only change is `agentId: "claude"` → `"aiagent"`).
- Gateway (one or two chat platforms to start — Telegram or Discord), cron/schedule, GitHub Action, `aiagent` as an MCP server.

### 4.3 Non-negotiables (learned from the teardown)

1. **Loop stays single-threaded & dumb.** All intelligence lives in the prompt + tools + policy, so behavior is debuggable.
2. **The prompt prefix is sacred** — stable order, no dynamic content up top, append-only changes, deterministic tool schema ordering. (Every vendor documents this; every prototype breaks it.)
3. **Small tool surface, well-described.** The system prompt must *steer tool choice* explicitly (grep before read; read before edit; bash for bulk ops).
4. **Sandbox before autonomy.** Auto mode is only as good as the sandbox + `PreToolUse` hook beneath it.
5. **Summary-return subagents** are the #1 context-economy trick.
6. **File-based memory & skills** (AGENTS.md / SKILL.md / MEMORY.md) are the #1 portability trick — our workspace already speaks the language.
7. **Events, not prints.** The core emits a typed event stream; TUI, headless JSON, and future gateways are just consumers.
8. **Session resume from SQLite day 1** — it's the difference between a demo and a tool you live in.

### 4.4 Risks & open questions

- **Compaction quality** is the long-session quality cliff — plan an eval (long task, measure recall/consistency before/after compaction). OpenAI's structured compaction is only available on their models; for others, our state-message format must be excellent.
- **Prompt injection via tool output** (web content, repo files, git output) — the auto-mode classifier deliberately hides tool results from the approver for this reason; our `PreToolUse` hook + sandbox are the cheap version.
- **MCP context bloat** — a single server (e.g. GitHub) can add tens of thousands of tokens of schemas; defer schemas or curate servers.
- **Scope creep** — Hermes is a 20-platform monster; Claude Code ships features monthly. The MVP scope in §4.2 is deliberately ~10% of any of them.
- **Naming/branding** — "aiagent" is generic; consider the binary name before it's in package registries (e.g. `claw-agent`, `jam-cli`… Jam's call).

### 4.5 Where we stand (integration with this workspace)

- This repo **is already a half-built agent workspace** for the OpenClaw "Claw" agent: `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `MEMORY.md`, `memory/`, `skills/` (10 skills), `.openclaw/`.
- The existing pattern in `AGENTS.md` — *Claw plans → Claude Code (ACP) codes → Claw reviews* — is the exact slot `aiagent` fills: a local, model-agnostic, workspace-aware coding harness Claw can spawn with `approve-all` and inspect afterward.
- Two concrete shortcuts: (a) `hermes claw migrate` shows OpenClaw workspaces map cleanly onto a modern harness — we can borrow its memory/skills mapping without adopting the product; (b) `astral-code` (open Rust, provider-neutral Codex fork) and gemini-cli (open TS) give us two working reference implementations to lift patterns from, license-compatible with our goals.

---

## 5. Sources

**Claude Code**
1. Anatomy of a Claude Code Session — codewithmukesh.com (loop, tools, permission modes, subagents, auto-mode classifier)
2. Claude Code Docs — Agent SDK: "How the agent loop works" (turns, permission-mode table, context window table) — code.claude.com & platform.claude.com
3. Anthropic blog — "Loop engineering: Getting started with loops" (turn/goal/time/proactive taxonomy, `/goal`, `/loop`, `/schedule`)
4. Claude Code Docs — "Intercept and control agent behavior with hooks" (~30 hook events table)
5. zep-us/claude-system-prompt — extracted Claude Code system prompts (v2.1.2 / v2.1.34 tool lists: Task*, Bash, Glob, Grep, Read, Edit, Write, WebFetch, WebSearch, ToolSearch, AskUserQuestion, Skill, PlanMode…)
6. kirshatrov.com — "Reverse engineering Claude Code" (mitmproxy capture of system prompt + tool definitions)
7. pixelmojo.io — Claude Code hooks: 3 handler types (command/prompt/agent), 12+ lifecycle events

**Gemini CLI**
8. google-gemini/gemini-cli (GitHub, Apache 2.0) + "Inside the Agentic Loop" deep dive (GeminiClient → Turn → GeminiChat; event-union table; Before/AfterAgent hooks)
9. medium.com/@mathieu.veron — Gemini CLI explaining its own ReAct loop (CoreToolScheduler, shouldConfirmExecute, functionResponse)
10. google-gemini.github.io/gemini-cli/docs/cli/sandbox.html + deepwiki (Seatbelt profiles, Docker/Podman, proxy, env vars)
11. agent-safehouse.dev — Gemini CLI sandbox analysis (tool table, host interactions, sandbox mechanisms)
12. techjacksolutions.com — Gemini CLI 2026 guides (ReAct loop, MCP config, 1M context, GitHub Action, checkpointing)

**Codex CLI**
13. zenml.io LLMOps database — "Building Production-Ready AI Agents: OpenAI Codex CLI Architecture and Agent Loop Design" (stateless ZDR, prompt caching, compaction, AGENTS.md cascade, config.toml, endpoints)
14. aihola.com — "How OpenAI's Codex CLI Actually Works Under the Hood" (encrypted reasoning, `/responses/compact`, `--oss`)
15. github.com/openai/codex discussions #1174 "Codex CLI is Going Native" (SandboxPolicy → seatbelt args → helper binary; process-tree sandboxing)
16. agent-safehouse.dev — Codex CLI sandbox analysis (bwrap+Landlock+seccomp, Windows restricted tokens, env vars, anti-debug, env sanitization)
17. deepwiki.com/openai/codex (crate map: codex-core/tui/exec/cli; sandboxing implementation; denial detection + retry/escalation)
18. developers.openai.com — Prompt caching guide + Prompt Caching 201 cookbook (exact-prefix, 1024-token minimum, prompt_cache_key, stable-prefix playbook, compaction interaction)
19. codex.danielvaughan.com — "Prompt Caching in Codex CLI" (auto_compact_limit, anti-patterns, workflow strategies)
20. propagated.ai — "How Codex CLI Manages Context" (append-only config changes, statelessness/ZDR rationale)

**Hermes Agent**
21. dev.to/truongpx396 — "Hermes Agent: Deep Dive & Build-Your-Own Guide" (6-step loop, 4 API modes, self-registering tool registry, toolsets, 3-level skill disclosure, `skill_manage`, 3 memory mechanisms, provider adapters, surfaces, build checklist)
22. github.com/NousResearch/hermes-agent + website docs (CLI/TUI reference, slash commands, `hermes claw migrate`, profiles, Docker, ACP, skills auto-load, install scripts)
23. fastino.ai — "Hermes Agent: The Complete Guide" (MIT license, model-agnostic 30+ providers, CLI/TUI/gateway surfaces)
24. hermesatlas.com project page (README: gateway platforms, closed learning loop, FTS5, skills self-improvement, agentskills.io compatibility)

**Cross-cutting standards**
25. devtoollab.com / atlan.com / betterclaw.io — "Agent Skills vs MCP" (SKILL.md open spec Dec 2025; progressive disclosure; MCP under Agentic AI Foundation/Linux Foundation; skills adopted by Codex, Gemini CLI, ChatGPT; decision matrix)
26. github.com/oines/astral-code — open provider-neutral Rust "Claude-ish" harness (codex-rs fork: crate map, multi-platform sandbox, app-server, SDKs) — useful reference implementation
27. github.com/asgeirtj/system_prompts_leaks — captured system prompts across vendors (context for how much the prompt does the work)

---

*Next step (on Jam's go): scaffold Phase 1 in a `novel-projects/aiagent/` (or top-level `aiagent/`) directory — language decision (D1) is the only blocker; Claw's default recommendation is TypeScript + Ink, provider layer from day 1.*
