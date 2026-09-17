# `aiagent` Decision Framework — v2.5 (consolidated, 9 decisions)
### All decisions folded and settled from the three research docs — pending Jam's sign-off to freeze prompt v2.5

- **Date:** 2026-09-17
- **Status:** DECIDED-PENDING-SIGNOFF (the base prompt is **not** locked yet)
- **Inputs:**
  - `research/aiagent-harness-deep-research.md` (architecture teardown)
  - `research/aiagent-system-prompt-playbook.md` (prompt teardown + draft)
  - `research/aiagent-updates-and-platforms.md` (update & platform workflows)

---

## 0. The governing principle (adopted verbatim)

**Binary version, model version, prompt version, and platform version are separate dimensions.**

```
aiagent
  binary:   0.8.0        ← the harness code (loop, tools, TUI, assembler)
  prompt:   2.5.3        ← the prompt source tree (prompts/ + manifest)
  model:    5.6          ← the model in use (provider-specific id)
  platform: macos/zsh    ← OS / shell / sandbox mode
  surface:  interactive  ← runtime context: interactive | headless | gateway | ide
```

**Consequence (the rule that makes the architecture work):** *don't rebuild the whole agent prompt every time one dimension changes.* Each dimension has its own version, its own release type, and its own change surface. The assembler resolves (prompt-version × model × platform × surface) into a deterministic final prompt; a change in any single dimension touches only that dimension's module.

This is what the four products' evolution makes clear: Claude Code's prompt grew ×2.25 on the Fable-5 feature release while the *constitution core* stayed 2–3k words; Codex re-tunes core prose per model generation but keeps tool namespaces stable; every harness ships surface variants as one-line deltas.

---

## 1. The nine decisions

### D1 — Action / investigation behavior

**Decision (settled):** *Investigate-first → act when authorized → verify → report.* Not blindly action-first.

**Resolution spec — the four-phase discipline:**

1. **Investigate** (always allowed; read-only). Map before touching: scoped search, targeted reads, reproduce reported failures empirically. (Gemini: "Prioritize empirical reproduction… to confirm the failure state." Codex: "reach first for `rg`.")
2. **Act when authorized.** Modification actions proceed when inside the task's implied authorization (Codex: "can you… / I want… / help me…" = instructions to act; authorization persists across turns). **Hard-to-reverse / outward-facing** actions (push, send, delete, publish, spend): do all authorized work first, present a **concrete reviewable result**, make approval the **final step** (Codex's permission contract). Reversible/sandboxed actions: just do them.
3. **Verify**, bounded. Run the tests/build/lint *appropriate to the change*; once passing, broaden only if new changes or failures justify it — no thrashing (Codex's bounded-verification rule). "Validation is the only path to finality" (Gemini).
4. **Report** — the honesty contract: claims rest on observed results; failures in the first sentence; partial work named as partial (Claude Code "Reporting outcomes").

Plus the **Directive vs Inquiry guard** (Gemini): a request phrased as a *how/why* question (no instruction to do) → investigate and explain, **no file modifications** until a Directive issues. This is what distinguishes "investigation-first" from "blindly action-first": the phase gate is *authorization*, not hesitation.

**Rationale:** pure action-first (Codex) suits a trusted coding product; a personal+coding hybrid agent living in the user's workspace needs the investigation guard + inquiry guard, while keeping Codex's anti-hesitation rules inside the act phase.

### D2 — Anti-AI-slop layering

**Decision (settled):** Keep it, but as an **output-quality layer** — never core agent logic.

**Resolution spec — two layers:**
- **Core (stable, cache-friendly):** 6 lines of structural style only — main point first; plain words, active voice; no filler/preambles/postambles; brevity target (≤3 lines between tool calls in TUI); lists only for genuinely parallel content; no self-praise-by-contrast.
- **`behavior/output-quality.md` (tunable module):** the phrase/style blacklist ("delve", "leverage", "it's worth noting", "Bottom Line:", "X, not Y" framing, invented compound labels…). This module is **surface-tunable** (interactive vs gateway may differ) and **churns freely** — slop evolves faster than safety rules.

**Rationale:** Codex bakes the blacklist into its core because it is a single-surface chat product and the core is re-tuned per generation anyway. A multi-surface harness must not let a churning style list live in the byte-stable prefix — it would break the cache on every style tweak. Blacklist as a module = style updates become type-4 point releases that touch one file.

### D3 — Launch sub-agents

**Decision (settled):** Ship **explorer + general-purpose + planner**. **reviewer deferred** until evaluation shows the need.

**Resolution spec:**
- Definitions live in `prompts/agents/*.md` with the corpus frontmatter format (`name`, `whenToUse`, `disallowedTools`, `model`, `omitWorkspaceMd`).
- **explorer** — read-only search specialist; `disallowedTools: [agent, edit, write, apply_patch, mutating-exec]`; `omitWorkspaceMd: true`; must specify search breadth (quick/medium/very thorough) when invoked.
- **general-purpose** — multi-step executor; full tools minus re-delegation ("you are already the dedicated agent — do the work directly").
- **planner** — architect; read-only; outputs goal/non-goals → step plan → risks/rollback → verification plan → open questions (Antigravity's plan template).
- **Reviewer gate (eval-defined):** build a small diff-review eval (known-bug diffs, 10–20 items) in phase 3. Add the reviewer agent **only if** it beats single-pass self-check + planner-verification on that eval. No speculative features.

**Rationale:** the corpus-consensus minimum is these three (they appear in both Claude Code and Gemini CLI); reviewer is the only one with no corpus precedent as a *built-in*.

### D4 — Persona architecture

**Decision (settled):** **Workspace mode: `SOUL.md` is the source of truth. Standalone mode: minimal inline identity.**

**Resolution spec:**
- The assembler has a **persona resolver** with two modes:
  - **Workspace run** (detects `SOUL.md`/`IDENTITY.md`/`USER.md` in the workspace): core carries only a 1-line identity + a *reference directive*: "This workspace defines your persona and working identity in `SOUL.md` (read at session start). It is authoritative over default behavior. `USER.md` describes your user — use it only to identify and serve the user, never send it externally." No persona content inlined → stable core stays small; persona edits don't touch the prompt version.
  - **Standalone run** (no workspace files): inline minimal identity block (name, role, 3–4 defaults) from `prompts/persona/default.md`.
- **Security gate (carried from our AGENTS.md):** persona + `USER.md` + `MEMORY.md` blocks load **only in main-session surfaces**; never in shared/gateway contexts with other people present.

**Rationale:** single source of truth for identity (the workspace already *is* our persona system); keeps the prompt's stable core small and cache-friendly; standalone runs still work anywhere.

### D5 — Update posture

**Decision (settled):** **Approval-required by default; opt-in auto-update.** (Both channels supported, auto off at v1.)

**Resolution spec:**
- `aiagent update` — route-aware self-update (Codex pattern): detects install route (installer script / npm / brew), offers or runs the matching upgrade; `--check` for dry run.
- **Default:** on startup + periodic while running, *check only* and surface "aiagent 0.9.0 available (you are on 0.8.0) — run `aiagent update`." Nothing downloads until the user says so (Codex posture — the safety-first default for a harness that executes shell commands).
- **Opt-in:** `"autoUpdate": true` in config → background update, effective next launch, with restart prompt (Claude Code posture).
- **Version floor:** `minimumVersion` setting — updates may advance, never silently downgrade (Claude Code).
- **`aiagent doctor`** — install health, channel, versions, last update result, PATH duplicates, sandbox availability (Claude Code `/doctor` + Codex `codex doctor --summary` + Hermes `hermes doctor`).
- **No silent state destruction:** uninstall docs explicit; never delete state dirs (the `brew uninstall --zap codex` warning is the anti-pattern).

**Rationale:** v1 personal harness, single operator, independent prompt releases → explicit control beats convenience at first; the auto path is already built, so flipping it on later is a config change.

### D6 — Release channels

**Decision (settled):** **stable / preview / nightly**, with **prompt version tracked independently of binary version.**

**Resolution spec:**
- Channels (Gemini's cadence as the template):
  - `nightly` — daily, main-branch as-is, assume unvalidated
  - `preview` — weekly (e.g. Tuesday 23:59 UTC), unvetted-but-candidate
  - `stable` — weekly (e.g. Tuesday 20:00 UTC), promotion of last preview + fixes; **stable can withhold a release that regresses** (Claude Code's curated-feed rule)
- **Two independent semver lines in one repo:**
  - binary `0.x.y` (harness code)
  - prompt `2.x.y` (prompt source tree, per the 5 release types below)
  - a release can move *either or both*: binary-only fix → 0.9.0 + prompt 2.5.3; prompt behavior patch → 0.9.0 + prompt 2.5.4. The manifest records which prompt versions a binary was tested against.
- Pinning: npm `@version` per line; `aiagent --version` reports the full dimension vector (binary, prompt-src, prompt-resolved-hash, model, platform, surface).

**Rationale:** the leaks repo proved prompts evolve on their own clock across model generations; a single combined version number would force coupling we've shown doesn't exist.

### D7 — Platform compatibility floor

**Decision (settled):** **Explicit floor for v1: macOS 13+ (Apple Silicon + Intel), Linux (glibc 2.35+; Ubuntu 22.04 / Debian 12 / Fedora 39 / Arch), WSL2 (Ubuntu/Debian).** Shells: zsh, bash (POSIX dialect). Runtime: Node ≥ 20 (TS path) — or drop-in equivalent if Rust path is chosen later. **Windows native, Android/Termux, Nix = declared unsupported/Tier-2 at v1.**

**Resolution spec (Hermes tier discipline — publish the tiers):**
- **Tier 1 (v1):** the floor above. "We strive to never break installs/updates here."
- **Tier 2 (declared, best-effort, later):** Windows native (WSL2 is the recommended path until then), Termux.
- **Unsupported at v1:** everything else — say so in docs.
- **Anti-leak mechanism:** the stable core contains **no OS-specific commands or paths**. Platform facts enter via (a) the environment block in the dynamic tail (`Platform / Shell / OS / sandbox mode / scratchpad`) and (b) `prompts/platform/<os>.md` command-dialect snippets swapped in by the assembler (Claude Code's Explore-agent pattern: same template, per-OS command lists).
- Sandbox per platform: Docker-first (v1, portable); native bwrap+Landlock (Linux) + Seatbelt (macOS) in v1.x; Windows restricted tokens only when Windows becomes Tier 1.

**Rationale:** Hermes' tiers + Claude Code's per-platform prompt rendering give us both the policy (declared tiers) and the mechanism (dialect modules + env block).

### D8 — Prompt assembly & versioning (the architectural centerpiece)

**Decision (settled):** Adopt the modular prompt tree with a **deterministic assembler**, **prompt version stamp**, and **eval gates**. Stable core stays cache-friendly; model/platform/feature differences are modules.

**Resolution spec:**

```
prompts/
├── core/            identity · honesty · scope/authority · safety · verification
│                    (the constitution — byte-stable, the cache prefix)
├── behavior/        context-economy · engineering-standards · git ·
│                    output-quality (slop blacklist) · memory-rules ·
│                    skills-rules · subagent-contract · state-model
├── tools/           per-tool doctrine + schemas (largest module; feature-gated)
├── agents/          subagent definitions (frontmatter + body): explorer,
│                    general-purpose, planner
├── platform/        linux.md · macos.md · (windows.md later) — command dialects
├── surface/         interactive.md · headless.md · gateway.md · ide.md (deltas)
├── model/           per-model overrides (EMPTY at launch; first entry only
│                    when an eval shows a model-specific gap)
├── persona/         default.md (standalone identity) + resolver rules
└── manifest.json    ordered assembly spec · prompt version · feature flags ·
                     tested-against binary versions · channel

manifest.json ──► deterministic assembler ──► final system prompt
                                    │
                    (fixed module order; no timestamps in stable part;
                     stable part assembled ONCE at session start)
                                    ▼
                    prompt version stamp (in the environment block:
                    binary / prompt-src / prompt-resolved-hash /
                    model / platform / surface)
                                    ▼
                    eval gates (per release type, §3)
```

**Assembly invariants (the rules that make caching work):**
1. **Order is fixed and manifest-declared.** No dynamic reordering, ever.
2. **Stable part = byte-identical across turns and across sessions** for a given (prompt-version, model, platform, surface). No timestamps, no random content, no session ids in it.
3. **Assembly happens once at session start.** Mid-session changes (mode switch, cwd change, model switch) are **appended as system messages**, never reassembled (Codex's append-only lesson — reassembly breaks the prefix).
4. **Dynamic tail last:** AGENTS.md cascade → memory index → user block → git snapshot → environment block (with version stamp) → skills catalog → MCP instructions → session-start state.
5. **Deterministic:** same inputs → same output bytes; the resolved content hash is recorded in the session (and is what `aiagent --version` and any field capture reports).

**Rationale:** this is the direct institutionalization of the four-dimension principle — each dimension is a module (or a resolver input), each has its own change surface, and the cache contract is an assembly invariant rather than a hope.

### D9 — Long-horizon state: the three-tier model

**Decision (settled):** First-class separation of **Memory / Notes / Scratch** — decided now architecturally, implemented in phase 3 (tool + hooks), with the *prompt rules* for all three in v2.5.

| Tier | What it is | Lifetime | Lives where | Load into prompt |
|---|---|---|---|---|
| **Memory** | Durable *knowledge*: who the user is, preferences, project context, references | Months; curated | `memory/*.md` (typed frontmatter) + `MEMORY.md` index | index in dynamic tail; files on recall (Claude Code / Hermes pattern; our existing convention) |
| **Notes** | *Active task state*: goal, decisions, progress, learnings, next steps, open questions | Per task/thread | `notes/<thread-or-task>.md` (Codex `notes` tool pattern) | re-injected after compaction & on resume; checkpoint written **before** compaction (PreCompact hook) and at milestones |
| **Scratch** | Temporary working files (intermediate outputs, scripts, dumps) | Session | session-specific scratchpad dir | path in environment block; **no permission prompts** inside it (Claude Code scratchpad rule) |

**Rules the prompt must carry (v2.5):**
- "Do not store active task state in memory — that's what notes are for. Do not store durable facts in notes — write them to memory when they outlive the task." (mirrors Gemini's "never save transient session state" + Codex's notes tooling)
- Compaction contract extended: "before context compaction, the harness checkpoints your task notes; after compaction/resume, notes are re-injected — continue from notes, don't re-derive."
- Scratch: "use the scratchpad for anything temporary; never commit or reference scratch paths in deliverables."

**Rationale:** the Codex `notes` finding showed the three are genuinely different concerns (durable knowledge vs active state vs throwaway work); conflating them is exactly how personal agents get bloated MEMORY.md files full of dead task state.

---

## 2. Resulting architecture (consolidated)

```
                              aiagent
        ┌───────────────────────┴───────────────────────┐
        │                                               │
  Stable Core (byte-stable prefix)            Dynamic Assembly
  identity / honesty (reporting outcomes)     AGENTS.md cascade
  scope & authority (D1 four-phase)           memory index + user block
  safety / verification                       git snapshot + env block
  6-line style principles                     skills catalog + MCP
        │                                     ┌─────────────────────┐
        │   prompts/ tree (D8)                │ model/   (per-model)│
        │   core · behavior · tools           │ platform/ (dialect) │
        │   agents · persona                  │ surface/ (mode)     │
        │                                     └─────────────────────┘
        └───────────────────────┬─────────────────────────────────────┘
                                ▼
                    deterministic assembler (manifest)
                                ▼
                 versioned prompt (stamp: binary/prompt/
                 model/platform/surface)  + content hash
                                ▼
                   evaluation gates (5 release types)
                                ▼
                       Agent Runtime (the loop)
                    + sandbox + approvals + hooks
                                │
     ┌──────────────────────────┼──────────────────────────┐
     ▼                          ▼                          ▼
 explorer              general-purpose              planner
 (read-only)           (executor)                   (architect)
     │                          │                          │
     └──────────┬───────────────┴──────────────────────────┘
                ▼
          reviewer  — only if the phase-3 eval earns it (D3)

  State tiers (D9):   Memory (durable) · Notes (task) · Scratch (session)
  Dimensions (D5/D6): binary 0.x.y · prompt 2.x.y · model · platform
  Channels (D6):      stable / preview / nightly · floor + doctor (D5)
```

---

## 3. Release types → module map (from the updates/platforms analysis)

| Release type | Trigger | Modules touched | Eval gate | Cache effect |
|---|---|---|---|---|
| **T1 model swap** | new default model, same family | `model/` (maybe empty) + env block | smoke | safe (suffix) |
| **T2 generation retune** | new model generation | `core/` ± `behavior/` (deliberate pass; word-count delta is a first-order metric) | **full eval suite** | intentional one-time break, changelog-documented |
| **T3 feature expansion** | new tool/capability | `tools/` + maybe `agents/` + `manifest` flags | feature evals | safe (appended) |
| **T4 point behavior patch** | bug in behavior (e.g. honesty rule) | one `behavior/` file | regression suite | safe (module is after earlier stable modules — order fixed) |
| **T5 surface variant** | new surface | `surface/<name>.md` | smoke | safe |

Prompt version bumps: T1 = patch (or no bump), T2 = minor, T3 = minor, T4 = patch, T5 = patch. Binary releases ride independently (D6).

---

## 4. Base-prompt delta: draft (playbook §4) → v2.5

What changes in the drafted base prompt when these decisions are applied — **noted for the freeze, not frozen:**

1. **New top section: `## Working method`** (D1) — the four-phase discipline (investigate → act-when-authorized → verify-bounded → report-honest) + the Directive/Inquiry guard. Replaces the draft's scattered autonomy/scope wording.
2. **`## Writing style` split** (D2) — core keeps 6 structural lines; phrase blacklist moves out to `behavior/output-quality.md` (assembled after core).
3. **New section: `## State (memory / notes / scratch)`** (D9) — three-tier rules + compaction-checkpoint contract. Replaces the draft's memory-only section; scratchpad rule added to the environment block.
4. **Persona resolver** (D4) — draft's static identity line becomes conditional: reference-directive in workspace mode, inline block standalone.
5. **Version stamp** (D8) — environment block gains `harness: aiagent · binary · prompt · model · platform · surface` lines.
6. **Sub-agent section** (D3) — unchanged contract; the three definitions become `prompts/agents/` files.
7. **Everything else** (honesty contract, authorization model, context economy, engineering standards, git, safety/injection rules, skills, compaction) — carried over unchanged from the playbook draft.

---

## 5. Sign-off checklist & next step

| # | Decision | Settled as |
|---|---|---|
| D1 | Action/investigation | investigate-first → act when authorized → verify → report (+ Directive/Inquiry guard) |
| D2 | Anti-slop | core = 6 structural lines; blacklist = tunable `behavior/output-quality.md` |
| D3 | Launch sub-agents | explorer + general-purpose + planner; reviewer only if phase-3 eval earns it |
| D4 | Persona | workspace: SOUL.md source of truth (reference, not inline); standalone: inline minimal |
| D5 | Update posture | check+offer by default; `aiagent update`; opt-in auto; version floor; doctor |
| D6 | Channels | stable / preview / nightly + **independent prompt semver** |
| D7 | Platform floor | macOS 13+ / Linux glibc 2.35+ / WSL2 (Tier 1); tiers published; no platform leak into core |
| D8 | Prompt assembly | `prompts/` tree + deterministic assembler + version stamp + eval gates; 5 assembly invariants |
| D9 | Long-horizon state | Memory / Notes / Scratch as three first-class tiers |

**Next step (on your sign-off):** freeze the base prompt as **`aiagent prompt v2.5.0`** — i.e. apply the §4 deltas to the playbook draft, lay down the `prompts/` tree + `manifest.json` skeleton with v2.5.0 stamped, and write the T1–T5 release-type checklist into the repo. That artifact is the lock; Phase-1 scaffolding (the loop) starts against it.
