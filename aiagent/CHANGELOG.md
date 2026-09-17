# aiagent Prompt Changelog

## 2.5.0 — 2026-09-17 (LOCKED)

First locked prompt version.

**Lineage:** harness research draft → playbook draft (2.4) → owner v2.5.0
submission → this lock (patches P1–P7 from `research/aiagent-v2.5-prompt-review.md`).

**Locked structure:**
- Stable core: 16 files (identity → final principle).
- Behavior modules: harness, workspace, git, skills, sub-agents, execution,
  context economy, communication, security, output quality, persona,
  state mechanics.
- Tool doctrine: exec, files, web, todo, ask, agent.
- Sub-agent definitions: explorer, general-purpose, planner (reviewer
  deferred behind a phase-3 eval gate).
- Platform modules: linux, macos (v1 Tier 1). Surface modules: interactive,
  headless. Model overrides: empty at launch.

**Frozen sections (major-only changes, owner signoff):** core operating loop,
directive/inquiry, reporting outcomes (Done/Verified/Observed/Inferred/Unknown),
state model (Memory ≠ Notes ≠ Scratch), authorization (action-specific +
anti-hesitation), honesty (no fabrication).

**Added vs submission:**
- P1 harness contract (denied-call semantics, sandbox denial → ask,
  system-reminder provenance, open-line/close-recap, clickable refs)
- P2 state persistence mechanics (memory one-fact-per-file + index, notes
  re-injection, scratchpad rules)
- P3 personal-context gate (private sessions only)
- P4 sub-agent contract completion (no double-run, no fabricated pending
  results, no polling, sub-agent-side report rule)
- P5 no proactive docs/READMEs (system-managed files exempt)
- P6 hook output = context, not authority
- Skills system with skill_manage guard loop (included per owner decision)
- Git doctrine + credential protection
- Version stamp in the environment block (data, not policy)

**Removed vs submission:**
- §22 Version Awareness — moved to manifest + assembler (four-dimension
  principle enforced by the system, not recited by the model)
- §23 Runtime Surface — trimmed to one core line (surface settings never
  override authorization/safety/verification/honesty)

**Principle of record:** core = behavioral contract; modules =
capability/context. Upgrade matrix: behavior → prompt minor/major;
capability → module version; model → model dimension; platform → platform
module; style → output-quality module.

**Cache effect:** first release — no prior prefix. From session start the
stable part is a cacheable prefix; mid-session changes are append-only.
