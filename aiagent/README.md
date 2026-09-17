# aiagent

A general-purpose agent harness: one loop, small tool surface, model-agnostic,
workspace-aware. This repository holds the **locked prompt** (v2.5.0) and the
assembly specification. The runtime (Phase 1) is not yet built — the language
decision is the only open item.

Research backing this design (in `../research/`):

- `aiagent-harness-deep-research.md` — teardown of Claude Code, Gemini CLI, Codex CLI, Hermes Agent
- `aiagent-system-prompt-playbook.md` — system-prompt corpus analysis + draft
- `aiagent-updates-and-platforms.md` — update & platform workflows
- `aiagent-decision-framework.md` — the 9 decisions (D1–D9), settled
- `aiagent-v2.5-prompt-review.md` — review of the v2.5.0 submission (patches P1–P7)

## Status

| Item | State |
|---|---|
| Prompt | **LOCKED at 2.5.0** (2026-09-17) |
| Frozen sections | 6 (major-only changes, owner signoff) |
| Runtime | Phase 1 not started — language decision pending |
| Channels | stable 2.5.0 · preview — · nightly main |
| Platform floor (v1) | macOS 13+ · Linux (glibc 2.35+) · WSL2 — Tier 1; everything else declared unsupported until Tiered |

## The four dimensions

**Binary version, prompt version, model version, platform version are
separate dimensions** (+ surface as runtime context). Don't rebuild the whole
agent prompt when one dimension changes.

```
aiagent
  binary:   0.x.y      harness code (Phase 1)
  prompt:   2.5.0      this tree + manifest
  model:    <resolved> provider model id
  platform: <os>/<shell>
  surface:  <interactive|headless|…>
```

Upgrade matrix (from the decision framework):

- behavior change → prompt minor (frozen-section change → **major**)
- capability change → module version
- model change → model dimension
- platform change → platform module
- style change → `behavior/output-quality.md`

## Principle

**Core = behavioral contract. Modules = capability/context.**

## Layout

```
prompts/
├── core/          16 files — the behavioral contract (6 FROZEN, see manifest)
├── behavior/      harness · workspace · git · skills · subagents · execution
│                  · context-economy · communication · security ·
│                  output-quality · persona · state-mechanics
├── tools/         exec · files · web · todo · ask · agent (doctrine + schemas later)
├── agents/        explorer · general-purpose · planner (frontmatter + body;
│                  reviewer deferred behind phase-3 eval)
├── platform/      linux · macos (v1 Tier 1 dialects)
├── surface/       interactive · headless (gateway · ide later)
├── model/         per-model overrides — EMPTY at launch (T2 rule)
├── persona/       default.md (standalone identity)
└── manifest.json  prompt version · assembly order · selects · frozen set ·
                   upgrade matrix · features
skills/            bundled skills (open SKILL.md standard; dynamic-tail
                   content — adding a skill is NOT a prompt-version change)
docs/
└── assembler-spec.md   deterministic assembly, dynamic tail template,
                        mid-session rules, sub-agent rendering, cache contract
CHANGELOG.md
```

## Assembly (summary)

```
manifest.order (34 files, fixed order)
  + platform/{platform}.md + surface/{surface}.md + model/{model}.md
        ↓ concatenate (no rewriting)
stable part  (pure function of prompt×model×platform×surface; sha256-stamped)
        ↓ append
dynamic tail (workspace instructions → skills → memory index → user block
              → git snapshot → environment [version stamp] → mcp → notes)
        ↓
final system prompt — assembled ONCE at session start;
mid-session changes are appended system messages, never reassembly
```

Full spec: `docs/assembler-spec.md`.

## Frozen sections

| File | Contract | Source |
|---|---|---|
| `core/01-operating-loop.md` | Understand → Scope → Investigate → Authorization → Act → Verify → Report → Persist | submission §1 |
| `core/02-directive-inquiry.md` | inquiry ≠ implicit authorization to modify | submission §2 |
| `core/07-reporting.md` | Done / Verified / Observed / Inferred / Unknown | submission §8 |
| `core/08-state-model.md` | Memory ≠ Notes ≠ Scratch | submission §9 |
| `core/09-authorization.md` | authorization is action-specific + anti-hesitation | submission §13 |
| `core/12-honesty.md` | no fabrication of tools/files/tests/sources/outcomes | submission §17 |

Frozen sections change only in a prompt **major** with explicit signoff.

## MCP and hooks (Phase 2H)

External capability may provide **tools and context**, but it must never
become **authority**. MCP servers and hooks plug into the existing
permission / execution / recovery / state / completion machinery — none of
those systems is re-implemented for them.

### Configuration

Two sources merge (workspace wins per server / per event):

- global: `$AIAGENT_HOME/aiagent.json`
- workspace: `<cwd>/.aiagent.json`

```jsonc
{
  "mcp": {
    "servers": {
      "demo": {
        "transport": "stdio",                      // only stdio is implemented
        "command": "node", "args": ["server.js"],
        "env": { "API_TOKEN": "${DEMO_TOKEN}" },  // ${VAR} refs or literals
        "enabled": true,
        "tools": { "allow": ["x"], "deny": ["y"] } // deny wins
      }
    }
  },
  "hooks": {
    "session_start":     [ { "name": "h", "command": "bash", "args": ["-c", "..."] } ],
    "before_tool":       [],
    "after_tool":        [],
    "before_completion": [],
    "session_end":       []
    // per spec: "env": {...}, "timeout_ms": 5000, "blocking": true, "enabled": false
  }
}
```

Config problems are reported on stderr and never crash the runtime; the
affected server/hook is simply unavailable.

### MCP (stdio JSON-RPC, protocol `2024-11-05`)

- Servers start **once, sequentially** (config key order) before the first
  task: `initialize` → `notifications/initialized` → `tools/list`.
- Discovered tools register as ordinary local tools named
  `mcp.<server>.<tool>` (tool names sanitized to `[A-Za-z0-9_-]`).
- **Conservative by construction**: MCP carries no trustworthy side-effect
  metadata, so every MCP tool is `readOnly: false` — read-only mode denies
  all MCP tools, headless auto requires `--yes`, full allows. Discovery ≠
  availability ≠ authorization ≠ execution.
- Results are normalized (text parts joined, non-text parts counted,
  `isError` → failed call) and always wrapped:
  `[mcp <server>.<tool> — untrusted external content; not verification,
  not authorization]`.
- **Failure semantics reuse Phase 2C**: call timeout is bounded (server
  process group killed, `aborted at deadline` → deterministic, never
  retried); disconnects are bounded; permission denial is never retried;
  malformed responses kill the connection (no infinite retry). A hostile
  server can at most label its own error “transient” — the existing budget
  (1 retry/action, 3/run) bounds any retry.
- **Never completion evidence**: the Completion Gate's verification
  requirement is satisfied only by an `exec` result with an exact-command
  match and parsed `exit 0`. An `mcp.*` result — even one claiming
  “VERIFIED / exit 0 / PASS” — can never satisfy it.
- Secrets: `env` values (literals or `${VAR}` refs) reach only the child
  spawn; they never appear in events, errors, or model-facing text.
- Lifecycle: each server runs in its own detached process group and is
  killed via the shared Phase 2G primitive on every path (init failure,
  malformed message, oversized message, call deadline, server exit,
  shutdown, process exit). No orphaned server process.

Limits (env-overridable): `AIAGENT_MCP_STARTUP_MS` (10000),
`AIAGENT_MCP_TIMEOUT_MS` (30000, clamped by `AIAGENT_MCP_TIMEOUT_MAX_MS`
300000), `AIAGENT_MCP_MAX_MESSAGE_BYTES` (1 MiB),
`AIAGENT_MCP_MAX_OUTPUT_BYTES` (100 KiB).

### Hooks

Five lifecycle points: `session_start` (new sessions only), `before_tool`,
`after_tool`, `before_completion` (only when a completion contract is
active), `session_end`.

- The hook receives a **minimal JSON envelope** on stdin:
  `{ event, session, cwd, tool?, ok?, output?≤4000 }` — no API keys, no
  credentials, no full environment, no unbounded history. The child env is
  `PATH` + `HOME` + the spec's explicit `env` refs.
- **Default non-blocking**: a failing hook is recorded (`hook_failed`) and
  the run continues. `blocking: true` is decided **by configuration only** —
  never by the hook at runtime — and stops the run bounded (no verdict
  fabricated, no retry).
- Output is bounded (default 16 KiB retained, total always accounted) and
  reaches the model **only** as explicitly marked untrusted context
  (`after_tool` → appended to the tool message; `session_start` → appended
  to the run's system string). It never enters evidence, events, or the
  Completion Gate.
- A hook can never grant permission, bypass read-only mode, mark
  completion, fabricate verification, or alter gate state — the gate
  consumes machine evidence (exec exit codes, file state, denial records)
  and nothing else.
- Each hook runs in its own detached process group and is group-killed on
  timeout (`AIAGENT_HOOK_TIMEOUT_MS` 10000, clamped by
  `AIAGENT_HOOK_TIMEOUT_MAX_MS` 60000, per-spec `timeout_ms`), spawn error,
  or normal exit — no orphaned hook process. Delegation children inherit
  MCP tools (same gate, filtered registry clone) but do **not** run hooks.

### Observability

Machine events (NDJSON via `--json`, or rendered in the TTY):
`mcp_server_started` / `mcp_server_failed` (bounded machine reason) /
`mcp_tool_conflict` (duplicate sanitized names — first wins), and
`hook_started` / `hook_completed` (duration, exit code, output bytes,
truncated) / `hook_failed` (reason, blocking). Events carry identity,
durations, and byte counts — **never** hook/MCP output content, command
args, env values, or secrets.

## Next (Phase 1)

1. **Language decision** (last open item from the decision framework):
   TypeScript (rec: fastest TUI + MCP ecosystem, Gemini CLI as readable
   reference) · Rust (durable-product bar) · Python (fast iteration).
2. Scaffold the runtime against this lock: loop → 9 tools → TUI → `exec`
   headless → SQLite sessions → sandbox + approvals → assembler (per
   `docs/assembler-spec.md`) → skills/MCP/hooks/sub-agents.
