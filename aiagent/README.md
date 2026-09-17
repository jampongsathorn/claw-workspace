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

## Next (Phase 1)

1. **Language decision** (last open item from the decision framework):
   TypeScript (rec: fastest TUI + MCP ecosystem, Gemini CLI as readable
   reference) · Rust (durable-product bar) · Python (fast iteration).
2. Scaffold the runtime against this lock: loop → 9 tools → TUI → `exec`
   headless → SQLite sessions → sandbox + approvals → assembler (per
   `docs/assembler-spec.md`) → skills/MCP/hooks/sub-agents.
