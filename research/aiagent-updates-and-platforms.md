# `aiagent` — Update & Platform Workflows (Deep Research)
### How each harness ships versions (binary side + prompt side) and how each behaves per platform

- **Date:** 2026-09-17
- **Companions:** `research/aiagent-harness-deep-research.md` (architecture), `research/aiagent-system-prompt-playbook.md` (prompt)
- **Data:** official docs/repos + the `system_prompts_leaks` series (cloned at `/home/user/sp-leaks`)

"Version update" happens on **three planes**, and each harness has a different workflow per plane:

1. **Binary/release plane** — how new versions get installed, detected, applied, pinned, rolled back.
2. **Prompt/model plane** — how the system prompt itself evolves across model generations and feature releases.
3. **Platform plane** — how behavior, install, and sandboxing differ per OS/device/surface.

---

## A. Binary/release update workflows

### A.1 Claude Code — the most channel-polished

| Dimension | Workflow |
|---|---|
| Install routes | **Native installer** (curl script: macOS/Linux/WSL; PowerShell + CMD: Windows) · Homebrew (two casks: `claude-code`=stable, `claude-code@latest`=latest) · npm · **WinGet** · **signed apt/dnf/apk repositories** (each with stable + latest channels) |
| Auto-update | **Default ON for native installs** — checks at startup *and periodically while running*; downloads in background; takes effect next launch. npm global can't auto-update if the global folder isn't user-writable (one-time notice + `claude doctor` fixes). |
| Release channels | `latest` (default; every npm publish) and **`stable` (≈1 week old; Anthropic actively withholds releases with major regressions)** — set via `/config → Auto-update channel` or `autoUpdatesChannel` in `~/.claude/settings.json` |
| Version control | **`minimumVersion` floor** (updates may advance, never silently downgrade; managed settings can enforce `requiredMinimumVersion`/`requiredMaximumVersion` org-wide) · `DISABLE_AUTOUPDATER=1` kills checks |
| Diagnostics | `claude --version`, **`/doctor`** (install health, channel, available npm versions, last update result), `/config` |
| Downgrade | Reinstall a specific version via npm/`~/.claude/local/`; switching latest→stable *prompts* whether to allow the downgrade (staying sets `minimumVersion` automatically) |
| Custom launcher | Auto-updater installs new versions under a `versions/` dir and leaves a user's custom launcher script/symlink in place (bugfixed in v2.1.207); with a custom launcher all versions are kept on disk |
| Update command | `claude update` (checks channel, applies or reports up-to-date) |

**Design smell to copy:** channel + floor + doctor + "update never silently downgrades" + package-manager-aware auto-update (`CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE=1` runs `brew`/`winget` upgrades for you).

### A.2 Codex CLI — manual-by-default, route-aware self-update

| Dimension | Workflow |
|---|---|
| Install routes | **Standalone installer first** (`install.sh` macOS/Linux/WSL, `install.ps1` Windows) — downloads the Rust binary, **no Node required** · npm wrapper (launcher; postinstall fetches platform binary; `engines.node >= 16`) · Homebrew cask · winget (lags npm by weeks) · GitHub Release binary + **DotSlash file** (commit a pinned executable to the repo) |
| Auto-update | **OFF by default** — TUI detects a newer release and *offers* the command matching your route; nothing downloads until you run it |
| Update command | **`codex update`** (v0.128.0+) — auto-detects the install route (standalone/npm/brew) and runs the matching upgrade; `codex update --check` for dry run |
| Pinning | `--release 0.152.1` / `$env:CODEX_RELEASE` (installer) · `npm i -g @openai/codex@<version>` (CI images, Dockerfiles) · DotSlash file in repo |
| Rollback | **Only the npm route has real version control** (`npm i -g @openai/codex@0.146.1`); standalone/brew track current release with no clean "previous version" command |
| Diagnostics | `codex --version`, `codex doctor --summary` |
| Gotchas | PATH duplicates (`which -a`), shell hash caches, `brew uninstall --zap codex` **deletes `~/.codex`** (config, credentials, sessions) |

**Design smell to copy:** one `update` verb that detects your route; explicit human confirmation (safety-first product posture); pinning story aimed at CI first.

### A.3 Gemini CLI — channel cadence is the product

| Dimension | Workflow |
|---|---|
| Install route | npm only (`@google/gemini-cli` + `@google/gemini-cli-core` monorepo packages), run via `npx` without install |
| Release channels (published cadence!) | **`latest`/stable — every Tuesday 20:00 UTC** (promotion of last week's preview + fixes) · **`preview` — every Tuesday 23:59 UTC** (unvetted) · **`nightly` — daily 00:00 UTC** (main branch as-is) |
| Auto-update | Since ~v0.1.16: checks at startup, runs `npm install -g @google/gemini-cli@latest` itself (needs writable global dir; sudo cases fail → manual fallback). Real-world bug history: nightly vs stable semver precedence (`0.1.9-nightly.20250710` compared wrong → fixed by defining *nightly = pre-release of the NEXT version*, hierarchy nightly→alpha→beta→rc) |
| Sandbox image versioning | Docker sandbox image tag (`us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:0.30.0-nightly…`) is **dynamically injected into package.json before each publish** — the CLI knows exactly which sandbox image matches its version |
| Current | 0.60.x, ~368k weekly downloads |

**Design smell to copy:** publishing a *cadence* (Tuesdays) builds trust; pin the auxiliary artifact (sandbox image) to the release version so components can't drift.

### A.4 Hermes Agent — managed layout, tiered platforms, ruthless channel pruning

| Dimension | Workflow |
|---|---|
| Install routes | **curl one-liner** (Linux/macOS/WSL2/Termux — auto-detects Termux, switches to the `.[termux]` bundle) · **PowerShell native Windows** (now Tier 1) · **Docker** (v0.6.0+) · Nix (Tier 2) · **PyPI + Homebrew: deprecated v0.19.0, removed v0.20.0** — channels get *retired*, not maintained |
| Managed layout | Installs into `~/.hermes/hermes-agent` (git-managed checkout) — this is what makes `hermes update` work |
| Update | **`hermes update`** (managed installs) · **Docker: no `hermes update` — pull a new image** (deliberate) · **desktop app (v0.16.0): in-app self-update** · managed **Hermes Cloud** (hosted, updated for you) |
| Diagnostics | `hermes doctor` (green/red report, troubleshooting tree), `hermes backup` / `hermes import` for state migration |
| Platform tiers (official) | **Tier 1:** macOS Apple Silicon · Windows 10/11 native · Linux & WSL2 · Docker — "we strive to never break installations and updates for these" · **Tier 2:** Android Termux · Nix — best effort, "releases may break them" · **Unsupported:** AUR, Intel Macs, pip/uv, brew |
| Release history (shape of velocity) | v0.6.0 Docker → v0.9.0 Termux → v0.10.0 native Windows → v0.14.0 22 messaging platforms + PyPI → v0.16.0 desktop app → v0.19–0.20 channel pruning → v0.21.3 (current, Sep 2026). ~16–20 minor releases/quarter. |

**Design smell to copy:** explicit platform tiers with written breakage policy; state backup/restore as first-class commands; retire bad install channels loudly instead of carrying them.

### A.5 Cross-harness comparison & the recipe for `aiagent`

| | CC | Codex | Gemini | Hermes | → **aiagent rec** |
|---|---|---|---|---|---|
| Auto-update default | **on** (native) | off (offers) | on (npm) | on (`hermes update` manual trigger on managed) | **off by default for a v1 harness** (Codex posture); opt-in flag |
| Channels | latest/stable | (single line) | latest/preview/nightly + cadence | (single line, pruned) | **stable + nightly from day 1**; publish cadence (e.g. weekly stable) |
| Pin/floor | minimumVersion | npm @version, DotSlash | npm tags | (layout) | pin via npm `@version`; **version floor setting** (CC's `minimumVersion` — never silently downgrade) |
| Route-aware update | `claude update` | `codex update` | npm only | `hermes update` | `aiagent update` with route detection |
| Diagnostics | /doctor | codex doctor | (none formal) | hermes doctor | **`aiagent doctor` is non-negotiable** |
| Downgrade | via npm/pin | npm only | npm | layout | npm pin (only clean path) |
| State on uninstall | keep | **zap deletes ~/.codex** | keep | backup/import | **document it; never zap state** |

---

## B. Per-platform workflows

### B.1 Platform matrix (support, install, sandbox, surfaces)

| Platform | Claude Code | Codex CLI | Gemini CLI | Hermes Agent |
|---|---|---|---|---|
| macOS (Apple Silicon) | native installer, brew cask, npm | installer, brew cask, npm | npm | Tier 1 (installer, Docker) |
| macOS (Intel) | supported | supported | supported | **unsupported** (deliberate) |
| Linux | installer + **signed apt/dnf/apk repos** | installer (needs `bubblewrap` for sandbox), npm, brew | npm (+Docker/Podman sandbox) | Tier 1 (installer, Docker) |
| WSL2 | supported (Linux route) | supported | supported | Tier 1 (recommended Windows path) |
| Windows native | **PowerShell/CMD installer, WinGet** | **PowerShell installer, restricted-token sandbox**, winget | npm (best effort) | Tier 1 since v0.14 (PowerShell; bundles **portable Git Bash**) |
| Containers | Docker (community) | Docker/CI pinning | **Docker sandbox image (first-class, version-pinned)** | Tier 1 (official image; update = pull) |
| ARM boards (Pi) | — | — | — | Tier 1 via Docker (aarch64) |
| Android | — | — | — | **Termux (Tier 2)** — auto-detected bundle, mobile-optimized TUI |
| Nix/NixOS | — | — | — | Tier 2 ("breaks often" — their words) |
| Cloud/managed | **Claude Code on the web** | **Codex Cloud** (containers, async) | Cloud Shell | **Hermes Cloud** (Portal-managed) |
| Desktop app | macOS/Windows app | Codex desktop | — | Electron (v0.16, in-app self-update, multi-profile) |
| IDE | VS Code, JetBrains | VS Code ext, app-server | ACP | ACP (VS Code, Zed, JetBrains) |
| Mobile-as-gateway | Slack etc. | — | — | **22+ chat platforms** |

### B.2 Platform differences that reach *into the prompt*

This is the underappreciated part — platforms aren't just install targets, they change what the model is told:

1. **Claude Code's subagent prompts are platform-variant.** The `Explore` agent capture (MITM, macOS native) points at `find`/`grep` via Bash and ships *no* Glob/Grep tools; the repo's note: *"on builds without embedded search (npm/Windows) the same template renders 'Use Glob / Use Grep' guidelines instead, and on Windows the read-only command lists become PowerShell equivalents."* → The harness renders the same agent template with per-OS command dialects.
2. **Environment block is per-platform:** every CC capture's session context includes `Platform: darwin/linux/win32`, `Shell: zsh/pwsh/bash`, `OS Version` — so tool doctrine ("use PowerShell equivalents", quoting rules) keys off real environment facts, not assumptions.
3. **Sandbox signals are per-OS env vars:** Codex sets `CODEX_SANDBOX=seatbelt` on macOS, bubblewrap+Landlock+seccomp on Linux, restricted tokens on Windows, `CODEX_SANDBOX_NETWORK_DISABLED=1` when egress is cut — and the prompt tells the model a sandbox denial means "ask for wider permission, don't retry." (Our draft prompt already carries this rule.)
4. **Gemini auto-detects sandbox per OS** (`GEMINI_SANDBOX=true` → docker → podman → seatbelt in that order); Seatbelt profiles are macOS-only; the prompt's safety section is the same across platforms — sandboxing is purely a harness concern there.
5. **Hermes adapts bundles per platform** (Termux excludes `faster-whisper`/`ctranslate2` deps that don't exist for Android; Windows gets a portable Git Bash so POSIX-shell skills work) — platform deltas are dependency-graph decisions, not prompt decisions.
6. **Surface variants are one-line deltas** (CC interactive vs headless identity; the whole "Claude in Chrome" addendum only appears when the browser MCP is loaded).

### B.3 Recipe for `aiagent`'s platform strategy

- **Phase 1 (launch): macOS + Linux/WSL2**, one installer script + npm. WSL2 *is* the Windows story for v1 (Hermes' exact recommendation before they built native).
- **Sandbox:** Docker-first for portability (Gemini pattern) in phase 1; native bwrap+Landlock on Linux + Seatbelt on macOS in phase 2 (Codex pattern); Windows restricted tokens only if/when native Windows is Tier 1.
- **Platform block in the prompt:** always emit `Platform / Shell / OS / sandbox mode / scratchpad` in the dynamic tail — the model's command dialect then follows facts (this also future-proofs Windows: change the block, not the core).
- **Per-OS tool doctrine:** keep command examples in a small per-platform snippet file (CC's Explore pattern) — e.g. `platforms/linux.md`, `platforms/macos.md`, `platforms/windows.md` swapped into the tool doctrine at assembly time.
- **Mobile:** do **not** build a mobile client; if phone access is wanted, it's a gateway platform (Telegram/Discord) — Hermes' architecture proves a server-side agent + chat gateway beats a phone install for a personal agent.
- **Cloud:** only after local is solid; the three vendor clouds are all "sandboxed container + async job + PR output" — that's a surface, not a new agent.

---

## C. Prompt/model version-update workflow (from the capture series)

Diffing the captures in `/home/user/sp-leaks` across model generations reveals each harness's **prompt release workflow** — what changes when the model or the product changes:

### C.1 Claude Code — five visible release types

| Capture | Words | What changed (vs previous) | Release type |
|---|---|---|---|
| Sonnet 4.6 | 24,694 | Baseline: `Doing tasks / Executing actions with care / Using your tools / Tone and style / Text output / auto memory` | — |
| Opus 4.7 | 24,700 | **Nothing structural** — identical skeleton, same word count. Only model ID/identity moved. | *Model swap, template frozen* |
| Opus 4.8 | 18,638 | **−25% prompt diet**: verbose tone/text sections folded into `Harness` + `Communicating with the user`; `auto memory` → `Memory` (schema tightened). "Lean prompt" era (matches `whenToUseLean` subagent frontmatter). | *Generation retune (shrink)* |
| Opus 5 | 19,625 | Adds `Delivering work` + `Corrections`; new `EndConversation` tool. | *Feature additive* |
| Fable 5 | 44,056 | **×2.25**: `Claude in Chrome browser automation` addendum, `Session context` (nested, replacing flat blocks), `Agents` catalog, `MCP Server Instructions`, `Skills` catalog; new tools `ListAgents`, `SendFeedback`, `ToolSearch`; ~100 MCP tool docs appended. | *Flagship expansion* |
| Fable 5.1 | 44,589 | **+533 words only**: the `Reporting outcomes` honesty section added at the top; small touches. | *Point release (behavior patch)* |

Observations:
- The **tool schema blocks** (per-tool JSON) are the bulk of the growth — the "constitution" core stayed 2–3k words the whole time.
- **Stable core ≠ frozen forever**: each *model generation* gets one retune pass (4.8 shrank, Fable grew); between generations the template is frozen (4.6→4.7 proof).
- **In-band version markers:** the model ID + knowledge cutoff live in the environment block; the `<reasoning_effort>` table (low=10…max) appears for Fable-class models — the prompt advertises its own dial.
- Point releases patch *behavior*, not features (5.1's honesty contract).

### C.2 Codex — same shape, bigger jumps

| Capture | Words | Notes |
|---|---|---|
| GPT-5.4 core | 2,089 | `# General` + `# Working with the user` — minimal core |
| GPT-5.5 core | 3,259 | same skeleton, +56% prose (more behavioral detail) |
| GPT-5.6 core | 2,826 | **restructured**: `General` → `Personality`; adds `Rules for getting work done`, `Destructive actions`, `Using skills` |
| GPT-6-Astra full | 74,438 | full assembly: new `When to ask the user for permission` + `Autonomy and persistence` sections (the polished versions of earlier scattered rules), desktop context, skills catalog, namespaced tools — **and a new `notes` tool**: "For tasks that may span context windows, use `notes` to maintain a concise checkpoint of the goal, decisions, progress, learnings and next steps" (window IDs + item IDs, per-thread note files) |

Observations:
- Codex's core oscillates ±50% between generations — each model gets genuinely re-tuned prose (not template-frozen like CC between gens).
- The `notes` tool is Codex's answer to the long-horizon problem *at the prompt level*: explicit cross-window checkpointing as a tool, not just compaction. Worth stealing for `aiagent` phase 3+ (it complements our compaction state-message: compaction summarizes the past, notes carry forward *your* working state).

### C.3 The derived "prompt release workflow" (what `aiagent` should do)

Five release types, each with a different rule:

1. **Model swap (same template family):** change identity/model-ID/environment block only. *Zero core edits.* (CC 4.6→4.7)
2. **Model generation retune:** one deliberate pass — usually a diet (cut what the stronger model doesn't need) or a restructure. *Eval before/after; word-count delta is a first-order metric.* (CC 4.8; Codex 5.5→5.6)
3. **Feature expansion:** append addenda + tool docs (browser, MCP catalogs). *Core untouched; new content after the stable prefix.* (CC Fable 5)
4. **Point behavior patch:** small section added/edited (e.g. `Reporting outcomes`). *Must pass the eval suite; version-stamp it.* (CC 5.1)
5. **Surface variant:** one-line identity + surface-only affordances. (CC headless)

**Mechanics to implement:**
- Prompts are **versioned files in the repo**: `prompts/core.md` (stable) + `prompts/models/<model>.md` (overrides) + `prompts/platforms/<os>.md` (command dialects) + `prompts/modes/<yolo|plan|headless>.md` (deltas). Assembly = concatenation in fixed order.
- **Prompt version stamp** in the environment block (`harness: aiagent 0.x.y, prompt: p-2026-09-17.3`) — makes field captures/comparisons possible (the leaks repo works *because* captures are attributable).
- **Eval gates per release type:** type 1 = smoke; type 2 = full eval + word-count review; type 3 = feature evals; type 4 = regression suite.
- **The cache rule governs the workflow:** types 1/3/5 are cache-safe (suffix changes only); types 2/4 *intentionally* break the prefix once, at release time — document it in the changelog, same as Codex documents compaction cache resets.

---

## D. Consolidated decisions for `aiagent` (additions to the 4 open questions)

From this research, the update/platform layer implies 5 more decisions:

1. **Auto-update posture:** manual-by-default + `aiagent update` (route-aware) + opt-in auto — Codex posture for v1, CC features (channels/floor/doctor) as we mature.
2. **Channels:** stable + nightly from day 1; weekly stable cadence (Gemini's Tuesday rhythm is a good template); pinning via npm `@version`.
3. **Platform floor for v1:** macOS + Linux/WSL2; Docker-first sandbox; environment block carries platform facts; per-OS command-dialect snippets; Windows-native and Termux/Android explicitly *later* (Hermes tier discipline — publish the tiers).
4. **Prompt versioning:** file-assembled prompt with version stamp + the 5 release types above; eval suite before any type-2/4 change.
5. **Long-horizon state:** add a `notes`/checkpoint tool in phase 3 (Codex pattern) alongside compaction.

---

## E. Sources

**Update workflows**
1. code.claude.com/docs/en/setup — Advanced setup (install routes, channels, minimumVersion, requiredMin/MaxVersion, CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE, signed apt/dnf/apk repos, custom launcher behavior)
2. claudelog.com FAQs — release channels; version revert
3. mac.install.guide/claude-code/update + fast.io Claude Code version guide — native auto-update, per-route update commands, `DISABLE_AUTOUPDATER`
4. blakecrosley.com "Install and Update Codex CLI" — full lifecycle table (install.sh/ps1, npm, brew, winget; `codex update`; pinning via `CODEX_RELEASE`; uninstall gotchas)
5. ofox.ai Codex install guide — Rust core + npm launcher, Node ≥16, DotSlash pinning
6. continuumcode.ai Codex update/pin/rollback — CI pinning policy, no clean downgrade on brew/standalone
7. codex.danielvaughan.com `codex update` — self-update mechanics, `--check`
8. npmjs.com `@google/gemini-cli` — release channel cadence (stable Tue 20:00 UTC / preview Tue 23:59 / nightly daily 00:00)
9. github.com/google-gemini/gemini-cli issues #3729 (nightly semver scheme) & #15362 (auto-update channel bug)
10. aicodingtools.blog Gemini CLI deployment — sandbox image URI injected into package.json at publish
11. hermesatlas.com modes guide — platform tiers (official), Docker update=pull, 1GB/1core sizing, two-gateways-one-data-dir warning
12. blakecrosley.com Hermes practitioner reference — v0.19/0.20 channel pruning (pip/brew retired), Termux bundle details
13. openclawlaunch.com Hermes OS guide + hermesagents.net FAQ — install paths per OS, v0.6→v0.14→v0.16 release milestones, 22 platforms

**Prompt evolution (local analysis of `/home/user/sp-leaks`)**
14. Claude Code captures: `claude-code-{sonnet-4.6, opus-4.7, opus-4.8, opus-5, fable-5, fable-5.1}.md` — word counts, section diffs, tool-set deltas
15. Codex captures: `gpt-5.4.md` (2.1k words) → `gpt-5.5.md` (3.3k) → `gpt-5.6.md` (2.8k) → `gpt-6-astra.md` (74.4k) — restructure + `notes` tool (line ~231)
16. `Anthropic/claude-code/agents/Explore.md` — platform-variant rendering note (npm/Windows → Glob/Grep + PowerShell equivalents)
