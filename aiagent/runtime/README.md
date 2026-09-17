# aiagent runtime (Phase 1 — TypeScript)

The Phase 1 runtime for the locked **aiagent prompt v2.5.0**
(see `../prompts/` + `../docs/assembler-spec.md`).

## Layout

```
src/
├── index.ts            CLI: `aiagent` (interactive) · `aiagent exec` (headless)
├── core/
│   ├── events.ts       typed agent event stream (the loop's API)
│   ├── assembler.ts    deterministic prompt assembler (per ../docs/assembler-spec.md)
│   ├── loop.ts         the agentic loop (model ⇄ tools until text-only)
│   ├── permissions.ts  read-only / auto / full modes
│   └── session.ts      JSONL session store (resume/continue; SQLite later)
├── providers/
│   ├── types.ts        model-agnostic provider interface
│   ├── openai.ts       OpenAI-compatible chat completions
│   └── anthropic.ts    Anthropic Messages API
└── tools/
    ├── registry.ts     tool registry + JSON schemas
    ├── exec.ts         shell (sandbox backends: direct now, docker later)
    ├── files.ts        read · write · edit · apply_patch (batch format)
    ├── search.ts       glob · grep (ripgrep when available, JS fallback)
    ├── todo.ts         todo list
    ├── ask.ts          ask_user (interactive only)
    └── smoke.ts        offline smoke test (assembles the real prompt, no API key)
```

## Build & verify (offline — no API key needed)

```
npm install
npm test        # builds + runs node:test suite (assembler determinism, tools, loop w/ mock provider)
npm run smoke   # assembles the real v2.5.0 prompt from ../prompts and prints a preview
```

## Run (needs a key)

```
OPENAI_API_KEY=... node dist/index.js                       # interactive REPL
OPENAI_API_KEY=... node dist/index.js exec "fix the bug"    # headless
node dist/index.js exec "..." --provider anthropic --model claude-sonnet-5
node dist/index.js exec "..." --json                        # NDJSON event stream
node dist/index.js --continue exec "keep going"             # resume last session
```

## Completion gate (Phase 2A)

The model may **request** completion (a text-only turn). The harness decides the
final state from machine-observable evidence only — the model's prose never
decides it. Headless runs always carry a completion contract; the interactive
REPL keeps Phase 1 behavior (a human is in the loop).

**Contract** (harness/task context, never model-defined):
- explicit: `--contract <file.json>` — `{"requirements": [...]}`
- default: derived from mode + workspace — read-only → report only;
  auto/full with a detectable test entry (`package.json` `scripts.test` →
  `npm test --silent`, `pytest.ini`/`test_*.py` → `python3 -m pytest -q`,
  `Makefile` `test:` → `make test`) → verification + report; else report.

```
{"requirements":[{"kind":"verification","id":"tests","command":"npm test --silent"},{"kind":"report"}]}
```

Requirement kinds: `verification` (exact command, must exit 0), `file-state`
(`exists`/`absent`/`contains` — checked against the filesystem now), `report`
(completion text non-empty).

**Gate verdicts** (on the `done` event as `completion: {state, reasons}`):

| state | when |
|---|---|
| `PASS` | every requirement satisfied by observed evidence |
| `FIX_REQUIRED` | verification never ran (but performable), failed (exit ≠ 0), file-state unmet, or empty report — the model can still act |
| `BLOCKED` | required capability unavailable (command missing / network-class error), or an unresolvable permission denial |
| `NEEDS_INPUT` | a human was prompted and declined — resumable by re-approval |

**Headless exit codes** (harness authority, not the model's claim):
`0` PASS · `10` FIX_REQUIRED · `11` BLOCKED · `12` NEEDS_INPUT.

Regression tests: `src/test/completion.test.ts` (authority probes A–E).

## Bounded recovery (Phase 2C)

When a tool call fails, the harness classifies the failure from **machine
evidence only** (exit codes, output signatures, permission decisions — never
model prose) and may auto-retry **the same action with the same input** for
genuinely transient failures. The model remains responsible for all strategy;
the harness never invents a different action.

**Failure classes** (`core/recovery.ts`, first matching rule wins):
`permission_denied` · `repeated_identical` (loop-detected) · `malformed_request`
(unknown tool / usage error) · `deterministic` (nonzero exit, timeout/kill,
plain tool error) · `missing_capability` (exit 127 / ENOENT / command not
found) · `unavailable_dependency` (DNS / network-down signatures) ·
`transient` (ECONNRESET / ECONNREFUSED / ETIMEDOUT / EHOSTUNREACH / fetch
failed) — the only class that is auto-retried.

**Recovery budget** (harness-owned; the model cannot influence it):
- `maxRetriesPerAction = 1` (default): one identical re-execution is the
  minimal transient-vs-deterministic experiment; a third identical execution
  is where loop detection takes over. No action executes > 2× by the harness.
- `maxTotalRetries = 3` (default, per run): caps retry-farming across many
  different actions in one run.
- Reset per `runLoop` invocation (task/run boundary). A resume is a new run.
- Overridable via `runLoop({ recovery: { … } })` (tests/evals); not a CLI flag.

**Events** (machine-observable, NDJSON): every failed attempt emits a
`tool_result` with a structured `failure` field
(`classification, retryable, attempt, retriesUsed, exitCode`); `retry` and
`recovery_exhausted` events mark the budget transitions. Session history keeps
only the final result per tool-call id (provider protocol).

**Preserved semantics:** permission denials are never retried; identical-action
loop detection (3×) is unchanged and still ends the run; the Completion Gate
(Phase 2A) is the sole completion authority — recovery only feeds it evidence
(`R1–R8` in `src/test/recovery.test.ts`).

## Skill lifecycle (Phase 2D)

The `skill` tool gives the model a controlled discover → select → load → use
lifecycle over the existing catalog (bundled `skills/` + workspace
`skills/`, open SKILL.md standard). **Skills provide capability/context, not
authority** — the permission gate, recovery budget, and Completion Gate are
completely unaware of skills.

- **DISCOVER** — `skill {action:"list"}`: names + descriptions + paths only
  (progressive disclosure; no full content). Event: `skill_discovered`.
- **SELECT + LOAD** — `skill {action:"load", name}`: always reads the actual
  on-disk SKILL.md (no embedded/stale copy; `skill_loaded` carries a content
  hash so staleness is machine-detectable). Events: `skill_selected`,
  `skill_loaded {name, path, contentHash, chars}`.
- **USE** — model works from the loaded content (session history); prose
  claims of use are never treated as evidence.
- **Failures** — `skill_load_failed {name, reason: not_found | read_error}`:
  no fabricated content, no silent substitution; passes through the Phase 2C
  classifier (deterministic → never auto-retried).
- **Dedup** — one logical load per run; a repeated request returns a pointer
  (`SKILL ALREADY LOADED`), not a duplicate payload.
- **Authority** — loaded content is wrapped as CONTEXTUAL GUIDANCE and cannot
  authorize actions, override core rules, or change completion semantics
  (verified by `S5` with a hostile skill). NO_SKILL (loading nothing) is a
  valid outcome. Regression: `S1–S9` in `src/test/skill.test.ts`.

## Delegation / sub-agents (Phase 2E)

The `agent` tool delegates a sub-task to an existing sub-agent definition
(`prompts/agents/*.md` + workspace `.agents/`). **A sub-agent provides
capability and delegated work — not authority, not completion, not truth.**

Lifecycle (all machine-observable events in the main stream):
`agent_discovered` (metadata only: name + purpose — no full prompt) →
`agent_selected` → `agent_spawned` (parent/child session ids, rerun info) →
`agent_started` → `agent_result {status: SUCCESS|FAILED|BLOCKED|NEEDS_INPUT,
turns, toolCalls, denials, retries, result, reasons}` (+ `agent_failed` /
`agent_blocked` / `agent_needs_input` when not SUCCESS) → `agent_completed`.
Events are harness-generated from tool-provided stages — model prose ("I
delegated this") never creates them.

Isolation & authority:
- **Fresh child session** (distinct id + home dir; inspectable separately)
  with an **explicit child context**: agent prompt + delegated task + optional
  delegated context — never the parent conversation, scratch state, or secrets.
- **Same PermissionGate** — delegation never escalates permission
  (read-only parent ⇒ child writes DENIED; verified A6/A8).
- **Filtered child registry** — the `agent` tool is never present in a child
  (no nested delegation); definition `disallowedTools` are enforced
  (conservative: `exec:mutating` strips `exec`).
- **Child contract = deterministic report-only** (Phase 2A gate reused —
  no second completion system): PASS→SUCCESS, FIX_REQUIRED→FAILED,
  BLOCKED→BLOCKED, NEEDS_INPUT→NEEDS_INPUT.
- **Phase 2C recovery reused per child run** (its own budget; no second
  retry system; the delegation itself is never auto-retried — `retries` in
  `agent_result` is the machine count).
- **Double-run prevention:** the same logical (agent, task, context) returns
  an `ALREADY RUN` pointer; re-execution requires an explicit `reason`,
  recorded on `agent_spawned`/`agent_completed` (`rerunOf`, `rerunReason`).
- **Result boundary:** child results enter the parent as unverified tool
  output; `agent_completed ≠ task_completed`, child SUCCESS never forces
  parent PASS (A9 + security test).
- NO_AGENT (not delegating) is always valid. Regression: `A1–A14` in
  `src/test/delegation.test.ts` + A15 real-CLI e2e.

## Context / state economy (Phase 2F)

The three state classes are operational and machine-observable:
**Memory ≠ Notes ≠ Scratch.** Context is deliberately selected, scoped,
persisted, and re-injected — never blindly accumulated.

- **Memory** (durable, home-scoped): one fact per file + derived index
  (`~/.aiagent/memory/`), progressive disclosure — the dynamic tail carries
  the index (one line per fact), content loads on demand via `memory read`.
  Entries are individually addressable, inspectable, deletable. Stored claims
  are wrapped as untrusted background context (timestamp + source) — never
  instructions, never authorization, never gate evidence.
- **Notes** (active task state, session-scoped): `notes.jsonl` in the session
  dir; the `notes` tool (list/append/clear, session-local like `todo`).
  Re-injected **once** as an explicit `### Active task notes` section at
  start and on resume — never duplicated into historical messages.
- **Scratch** (ephemeral, session-local): a dir **under the session dir**
  (previously shared per-cwd) — session B and child sessions can never see
  it; it survives a resume of the same session (existing contract), is never
  auto-injected, and is never promoted without an explicit operation.

State tools: `memory {list|read|write|delete}` and `notes {list|append|clear}`
(scratch uses the existing file primitives — no duplicate file tools).
`memory write/delete` are routed through the **same PermissionGate** (read-only
mode → DENIED). **Promotion** (scratch/notes → memory) requires an explicit
`promoteFrom`/`promoteRef` AND harness verification that the referenced source
contains exactly the written content — model prose ("I'll remember this")
creates nothing. Events: `state_read` / `state_written` / `state_promoted` /
`state_cleared` (id/counts/bytes only — never content, no secrets) +
`context_rebuilt` (resume) + `context_pruned`.

Context construction (dynamic tail, only when present): core prompt +
environment + durable memory index + active task notes + current task.
Context budget: deterministic char-based budget (`AIAGENT_CONTEXT_BUDGET`,
default 200k) over the request messages — prunes oldest TOOL RESULTS first
(honest "NOT in the current context" markers), then older assistant text;
NEVER the system prompt (core/authorization/security/completion/state), the
current task, user messages, or the active exchange. The session log and the
completion gate's evidence always keep the full history — pruning affects the
request only. Parent/child: Phase 2E children get state tools re-bound to
their OWN session/home; child state never leaks to the parent; delegated
output never auto-writes parent Memory (explicit parent op, provenance
recorded). Regression: `C1–C19` + stress in `src/test/state.test.ts` +
C20 real-CLI e2e (write → resume → reconstruct).

## Execution & tool hardening (Phase 2G)

Execution is a bounded, observable lifecycle — the harness owns every
termination path, and the machine states below are evidence, not prose:
`completed` (exit code is the evidence) · `timed_out` · `cancelled` ·
`killed` (signal) · `failed` (spawn error), each carried as `exec`
evidence on the tool result: `{state, exitCode, signal, durationMs,
timedOut, cancelled, stdoutBytes, stderrBytes, stdoutTruncated,
stderrTruncated}`. The `tool_result` stream event carries the same `exec`
block, so a run is reconstructable from events alone (ran / started /
duration / timeout / cancel / exit / truncated — no secrets).

**Process lifecycle.** Each exec runs in a detached POSIX process group
(`bash -c`, so the model's full shell syntax is available). EVERY
termination path — success, timeout, cancellation, spawn error — sends
SIGKILL to the whole group, so no orphaned descendants survive
(backgrounded children included). Long-lived daemons must self-detach
(`setsid`) to outlive an exec; the harness will not keep them alive.
`cancelled` is injectable programmatically (`runShell(...).cancel()`) and
partially-returned output is explicitly marked "NOT a completed result" —
it is never mistaken for success.

**Timeouts.** Harness ceiling; the model's `timeout_ms` is clamped into
`[1, AIAGENT_EXEC_TIMEOUT_MAX_MS]` (default 120s / 600s;
`AIAGENT_EXEC_TIMEOUT_MS` sets the default). A timeout kills the group at
the deadline, reports `timed_out` with the real `durationMs`, and is
classified `deterministic` — never auto-retried, never PASS.

**Output limits.** Each stream is byte-accounted from the start
(`AIAGENT_EXEC_MAX_OUTPUT_BYTES`, default 100 KiB): the full byte COUNT is
always reported, retention is capped, multi-byte sequences are decoded
once at the end (no chunk-boundary corruption), and truncation is explicit
in the model-facing output with a "re-run with narrower scope" note.
Unbounded raw output never enters the session.

**Mutation classification (`core/mutation.ts`).** Every exec command is
conservatively classified `read_only | mutating | unknown`; the verdict is
stored in the exec evidence. Composition is split on `;` `|` `||` `&&`
(top-level); command substitution, subshells, heredocs, backgrounding,
path-qualified binaries, and unknown commands are NEVER `read_only`.
Redirection to anything but `/dev/null`/fd aliases is `mutating`.
Tables cover `git`/`npm`/`tar`/`sed`/`perl`/`curl`/`wget` conservatively:
`sed`/`perl` are never `read_only` (their `w` command can write), shell
invocations (`bash`, `sh -c`, …) are `mutating` (arbitrary code). Known
limits: quoted `;`/`|` are treated as structure (→ unknown), and the
classifier is advisory evidence — the PermissionGate remains the
authorization authority.

**Child-agent exec (`exec:mutating`).** A definition's `exec:mutating`
restriction no longer strips exec entirely: the child keeps exec but every
command is classified first — `mutating`/`unknown` commands are DENIED
(harness boundary, not prompt; denial classified `permission_denied`,
never retried, counted in the child's machine digest); `read_only`
commands run through the same gate. Parent-level gating stays
tool-level; per-command auto-mode gating is deferred.

**File tools: confinement + real apply_patch.** `read`/`write`/`edit`/
`apply_patch` resolve every path against the working directory
(`resolveSafePath`): absolute escapes, `..` traversal, and symlink
escapes are rejected. `apply_patch` accepts a bounded **unified diff**
(`patch`) or a validated edit batch (`edits`). The diff parser is
deterministic and rejects: empty/binary patches, file deletion,
count mismatches, context that does not apply, ambiguous hunks (multiple
exact matches), and any unsafe target path — always with "no files were
modified". Each file is written atomically (temp + rename); if a write
fails mid-batch the result is `ok:false` with an explicit
"PARTIALLY applied — wrote [A] but NOT [B]" report. Silent partial
application is impossible by construction.

**Recovery / completion integration.** Additive only, 2C semantics
unchanged: `cancelled after …` output classifies `deterministic`
(cancellation is a harness decision, not a flaky network);
`denied:` exec output classifies `permission_denied` (definition-level
exec boundary). The completion gate: timed-out/cancelled verification →
`FIX_REQUIRED` (inconclusive, no exit code), truncated + non-zero →
`FIX_REQUIRED`, partial patch → unsatisfied file-state → `FIX_REQUIRED`,
unresolved denial → `BLOCKED`/`NEEDS_INPUT`. Only a clean exit-0
satisfies a verification requirement.

**Concurrency.** The tool loop stays strictly sequential (one tool call
in flight; budgeted retries are in-loop). A designed-but-deferred
concurrency model is documented in the Phase 2G report.

Regression: `G1–G22` in `src/test/exec.test.ts` (real traced paths:
timeout/cancel/process-group cleanup, huge stdout/stderr, truncation
marker integrity, unicode/binary, mutation table, permission denials,
patch success/malformed/unsafe/partial, recovery & completion
integration, child exec limits, budget exhaustion) + G25 real-CLI e2e
(mock model, real harness: PASS→exit 0, timeout→exit 10, read-only
denial→exit 11).

## Scaffold state (honest)

- ✅ loop · 9 tools · deterministic assembler (manifest-driven, stable hash) ·
  provider adapters (openai-compatible + anthropic) · permission modes ·
  JSONL sessions with resume · loop detection · max turns · headless + REPL
- ⏳ non-streaming calls (streaming = next)
- ⏳ JSONL store now; `node:sqlite` behind the same interface next
- ⏳ sandbox backend: `direct` only now; Docker backend per D5/D7 next
- ⏳ Ink TUI, MCP client, hooks, sub-agent spawning, compaction — Phase 1 completion / Phase 2+
- apply_patch uses a batch `{path, old_string, new_string}[]` format now;
  full unified-diff parser is a follow-up
