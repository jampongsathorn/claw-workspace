---
name: scrutinize
description: >
  Outsider-perspective, end-to-end review of a plan, PR, or code change.
  First questions intent — whether the change should exist at all and
  whether a simpler or more elegant approach achieves the same goal — then
  traces the actual code path (not just the diff) to verify the change does
  what it claims. Every finding carries what to change, why, and the
  evidence. Use on /scrutinize and whenever the user asks to review, audit,
  sanity-check, or get a second opinion on a plan, PR, diff, design doc, or
  proposed code change. Read-only: this skill never modifies files.
---

# Scrutinize

Stand outside the change and ask whether it should exist at all, then verify
it actually does what it claims end-to-end.

## Stance

- **Outsider.** Forget who wrote it and why they think it's right. Read the artifact cold.
- **End-to-end, not diff-local.** The diff is the entry point, not the scope. Follow the call graph through real code paths, including the unchanged code on either side of the diff. Bugs hide at the seams.
- **Actionable, concise, with rationale.** Every finding states what to change, why, and what evidence led you there. No filler, no restating the diff back.

## Workflow

Run these in order. Do not skip ahead.

### 0. Scope

- **Non-git artifact (plan, design doc):** scope is the document itself; no fixed point applies.
- **Code review:** **never guess** the fixed point — none given → ask once; "just my changes" → working tree.
  - branch / fork-point → `git diff <point>...HEAD` (three-dot = merge-base comparison)
  - explicit two-state range → `git diff <a>..<b>` (two-dot)
  - working tree → `git diff` + `git diff --cached` (+ `git status --porcelain` for untracked)
- `git rev-parse` the ref first; **empty diff → "nothing to review", stop**.
- **Dirty tree + committed-diff scope → name the excluded uncommitted files.**
- Report line 1: exact scope + command.
- Reading only: **never `stash`, `checkout`, `add`, `reset`, or otherwise mutate the workspace** to establish scope.

### 1. Intent — what is this actually trying to do?

- State the goal in one sentence, in your own words. If you cannot, the artifact is underspecified — say so and stop.
- Ask: **is there a simpler, smaller, or more elegant way to achieve the same goal?** Consider:
  - Doing nothing (is the problem real, load-bearing?).
  - Using something that already exists in the codebase instead of adding new surface.
  - A smaller change that solves 90% of the goal with 10% of the risk.
  - Solving it at a different layer (config vs code, framework vs app, build vs runtime).
- If a better alternative exists, name it explicitly with rationale. This is the most valuable thing you can output — surface it before the line-by-line review.

### 2. Trace — walk the actual code path

- For each behavior the change claims, trace the path end-to-end through the real code, not just the lines in the diff:
  entry point → call sites → branches taken → state mutated → exit / return / side effect.
- For a plan or design doc: trace the proposed flow against the existing system. Where does it touch reality? What does it assume that isn't true?
- Note every place the trace surprises you (unexpected branch, dead code reached, state you didn't know existed). Surprises are signal.
- For multi-file reviews, keep the trace state (claims checked, open claims, surprises) in Notes so context compaction cannot lose your position.

### 3. Verify — does it actually do what it claims?

For each claim the change or plan makes, answer:

- **Does the path you traced actually produce that behavior?** Walk it explicitly: "It claims X. Path: A → B → C. At C, [observation]. Therefore [holds / doesn't hold]." Label each claim **Verified** (you traced and confirmed it) or **Inferred** (it follows, but you did not observe the full path).
- **What inputs or states would break it?** Edge cases, concurrent callers, error paths, partial failures, retries, empty/null/unicode/huge inputs, ordering assumptions.
- **What does it silently change?** Performance, error semantics, observability, contracts for other callers, on-disk or on-wire formats.
- **How is it tested?** Do the tests actually exercise the traced path, or do they pass while skipping it (mocks that hide the bug, asserts on intermediate state, happy path only)?
- **Coverage of the ask.** Spec source: (1) explicit spec/task the user supplied; (2) clearly identified task/spec file in the workspace; (3) the user's originating request in this conversation. Vague request → goal level only. Then: what was asked but is **missing or partial**? What was done that **was not asked for** (scope creep)? What looks implemented but is **wrong**? No reliable source → **Unknown: no originating spec identified** — **Unknown is not a pass**. **Never infer the spec from the implementation.**
- **House standards (code reviews only).** If standards are documented (`AGENTS.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md`), read them and cite violations in the diff; skip what tooling enforces. Undocumented → one line saying so; never manufacture a violation.

### 4. Report

**## Findings** — one tight section per finding, ordered by severity (blocker → major → nit). For each:

- **Finding** — one sentence, specific. Cite `file:line` when applicable.
- **Why it matters** — the consequence, not the principle.
- **Evidence** — the trace step or input that exposes it.
- **Suggested change** — concrete, minimal.

**## Conformance** — ask-coverage + house-standards results, per axis; unrunnable axis → Unknown + one-line reason. **No cross-ranking or merging between sections.** One-line worst-item per axis: evidence, not a verdict.

Close with a one-line verdict: **ship / fix-then-ship / rework / reject** — with the single biggest reason.

## Rules

- **Read-only.** A review request is not authorization to change anything. If you find something worth fixing, report it; fixing is a separate, authorized action.
- **No rubber-stamps.** "LGTM" is not an output. If you genuinely find nothing, say what you traced and what you checked, so the user can judge whether the review covered the surface they cared about.
- **Cite or it didn't happen.** Every claim about the code references a specific path, file, or line. No vague "this might break under load."
- **Distinguish claim from verification.** "The PR says X" and "I traced X and confirmed or refuted it" are different — keep them separate in the output.
- **One simpler-alternative pass is mandatory.** Even on small changes, spend one breath asking whether the whole thing is necessary. Skip only if the user explicitly says "don't question scope."
- **Don't pad with style nits when there's a structural problem.** If step 1 or 2 surfaces a real issue, lead with it; defer nits or drop them.
- **No flattery, no hedging.** "This is a great PR but..." adds nothing. State the finding.
