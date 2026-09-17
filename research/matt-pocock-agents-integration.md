# .agents → aiagent Integration Analysis

Source: `mattpocock/skills` (cloned to `/home/user/matt-pocock-skills`, commit 74ca5fe,
Sep 2026). 38 SKILL.md files across 5 buckets (`engineering/` 18, `productivity/` 7,
`in-progress/` 9, `misc/` 4, `deprecated/` 1), plus meta-architecture: `CLAUDE.md`,
`CONTEXT.md`, `.agents/adr/`, `.agents/invocation.md`, `.out-of-scope/`, `.changeset/`,
`docs/` (one human-facing page per promoted skill). Distributed as a Claude Code plugin
(readonly bundle) or editable files via `skills.sh` (user-owned). Philosophy per README:
"small, easy to adapt, and composable... based on decades of engineering experience."

## Executive Summary

The collection is procedurally rich but architecturally conservative: skills are
**procedural protocols** (phases, checklists, completion criteria), not tool wrappers, and
the real value sits in the **meta-layer** — an explicit model-invoked vs user-invoked
split that prices every skill against two budgets (context load vs cognitive load), a
writing discipline for agent-consumed documents (`writing-for-agents`), and a router
convention. Three skills survive contact with our locked architecture as **wave-1
adoptions** (skill-only change, zero prompt-version change): `diagnosing-bugs`,
`grilling`, `writing-for-agents`. `code-review` does NOT become a second reviewer skill —
its two-axis conformance logic is folded into `scrutinize` as v1.1 (detail in
`## Scrutinize Overlap`). One meta-pattern (phase-boundary decision menu) is a
**behavior-module** candidate for 2.6.0, not core. **Core changes: NONE.** The single
next step is landing the wave-1 bundle, verified by the existing offline smoke.

## Architecture Compatibility

| .agents mechanism | aiagent equivalent | Fit |
|---|---|---|
| SKILL.md (YAML frontmatter: `name`, `description` + body + optional sibling reference files) | Same open standard; `assembler.ts` `parseFrontmatter` + `skillsCatalog` (assembler.ts:140-162) | Direct. Their extra fields (`disable-model-invocation`, `argument-hint`) are ignored by our parser today — harmless |
| Two-tier progressive disclosure: description = always-loaded context pointer; body loads on match | Identical: catalog line `- {name}: {description}` in dynamic tail; "Read a skill's full SKILL.md when the task matches, then follow it" (assembler.ts:161) | Direct. Gap: we load bodies via the generic `read` tool; they use a named Skill tool (see Phase 2) |
| `skills/` = living, user-owned, changeset-released; docs/ = human-facing pages | `aiagent/skills/` (bundled, dynamic-tail content, zero prompt-version cost) + `skills/README.md` catalog table | Direct — same separation of versioned prompt (our `prompts/`, frozen 2.5.0) from living skills |
| `CLAUDE.md`: "AGENTS.md... pushed to the context window of any agent... used incredibly sparingly, usually only for navigation pointers" | Our P7 decision: AGENTS.md carries data only (cascade, 32KiB cap), never policy (core/01-15 carry policy) | Corroborated. Strongest third-party validation of the frozen architecture |
| `CONTEXT.md` domain glossary + `docs/adr/NNNN-*.md` ADRs + `.out-of-scope/` ledger | `MEMORY.md` (durable knowledge), `research/` decision docs, `manifest.json` `upgrade_matrix` | Compatible conventions, not structure. ADR format + out-of-scope ledger are adoptable as `aiagent/docs/` conventions |
| `.claude-plugin/` + marketplace + symlink installer | git + runtime `skillsCatalog` | Not applicable; distribution is out of scope |

**The one structural delta:** their invocation split (`.agents/invocation.md`): a
**model-invoked** skill keeps a description (always-loaded context pointer, agent +
human reachable); a **user-invoked** skill sets `disable-model-invocation: true` —
zero context load, human is the index, no other skill can reach it. Our Phase 1 runtime
has no equivalent: every bundled skill's description is always in the catalog, and no
user-invoked path exists. This is the main architectural import (Phase 2), not a
lock change — it lives in the assembler's dynamic tail and the CLI.

## Adopt

New components added to aiagent (skills are dynamic-tail content → zero prompt-version
change). Each with documented deltas, per the `9arm-scrutinize-adaptation.md` A1-A4 format.

| Pattern/Skill | Destination | Reason |
|---|---|---|
| `diagnosing-bugs` skill | `aiagent/skills/diagnosing-bugs/SKILL.md` | The only protocol in the collection whose central discipline ("Phase 1: Build a feedback loop — **This is the skill**"; "No red-capable command, no Phase 2") matches our frozen verification contract (core/01 Verify step, §8 Observed/Inferred/Unknown, §17). No tracker dependency. Deltas: drop HITL script pointer; fix phase is a separately authorized action (frozen §13) — diagnosis itself is read-only |
| `grilling` skill | `aiagent/skills/grilling/SKILL.md` | Design-tree + frontier-round interview with numbered questions and recommended answers; "Finding facts is your job, never the user's" (agent looks up, user decides). This is the structured missing link between frozen §2 (inquiry must never become implicit authorization) and frozen §13 (action-specific authorization): it converts under-specified inquiries into explicit decisions before acting |
| `writing-for-agents` skill + `SKILL-MECHANICS.md` sibling | `aiagent/skills/writing-for-agents/{SKILL.md, SKILL-MECHANICS.md}` | The half of our M2 skill_manage loop we lack: the loop says "Propose/update skill → Verify skill → Persist" but defines no writing/verification criteria. This skill IS the criteria: information hierarchy (in-file step → in-file reference → disclosed reference), completion criteria (clarity + demand), leading words, positive-over-negation prompting, pruning (single source of truth, environment-as-source, no-op test, sediment). SKILL-MECHANICS.md is a disclosed reference (loaded only when the skill is applied) — the exact progressive-disclosure pattern our assembler already renders |
| ADR convention | `aiagent/docs/adr/NNNN-slug.md` (Context/Constraint → Decision → Invariants) | Our decisions currently live in `research/` prose + `manifest.json`; the ADR shape (evidence: `.agents/adr/0002-ship-as-a-claude-code-plugin.md` — constraint, rejected escape hatches, decision, invariants it creates) makes each decision independently citable and invariant-checkable |
| Out-of-scope ledger | `aiagent/docs/out-of-scope/*.md` | Every rejected pattern/feature request recorded with reason + prior-request reference (evidence: `.out-of-scope/question-limits.md` rejects a grilling question cap and explains *why*, citing issue #44). Anti-sediment for the skill system; this document's Reject table seeds it |

## Adapt

Existing aiagent components extended (module/skill changes; prompt minor at 2.6.0 where
a prompt module is touched; skill-only otherwise):

| Pattern/Skill | Existing aiagent component | Adaptation |
|---|---|---|
| `code-review` (two-axis, fixed point, smell baseline) | `aiagent/skills/scrutinize/SKILL.md` | v1.1 (implemented at reduced scope after design review — see outcome note in `## Scrutinize Overlap`): step 0 scope/fixed point (never guess, dot-form rule, dirty-tree scope reported, non-git no-op, read-only); ask-coverage + house-standards conformance inside Verify (source ladder, Unknown is not a pass, never inferred from the implementation); report adds a `## Conformance` axis kept separate from `## Findings` with **no cross-axis reranking**. Fowler-12/`SMELLS.md` deferred. Sub-agent parallel execution deferred to Phase 2 |
| `ask-matt` Phase boundaries (continue / clear / handoff / subagent / compact; "compact... the default, at the bottom of the tree rather than the first reach"; each ticket "sized to fit in a single fresh context window") | `prompts/behavior/context-economy.md` | 2.6.0 module addendum: the five-option decision menu at phase boundaries + "self-contained slices make the last context disposable". Current module covers read-economy and post-compaction reconstruction but not the boundary decision itself |
| Invocation split (model-invoked vs user-invoked) + named Skill tool | `runtime` assembler `skillsCatalog` + CLI | Phase 2: frontmatter field honored by catalog (user-invoked skills omitted from model-visible catalog, listed in CLI `/skills`); first-class `skill(name)` tool so composition says "Call the Skill tool with 'tdd'" (their `.agents/invocation.md`: "Naming the tool is what gets it fired") instead of a bare `/name` mention. Until then, Phase 1's catalog sentence ("Read a skill's full SKILL.md when the task matches") already makes composition work via `read` |
| "Follow the advice in the writing-for-agents skill" (their domain-modeling file-governance section; implement skill's "Use /tdd where possible") | `prompts/behavior/skills.md` | 2.6.0 module addendum: one named pointer line — when creating/updating a skill, apply the `writing-for-agents` skill before persisting (makes it the Verify step of the M2 loop). One line; the skill body stays out of core context |
| Bucket discipline (engineering/productivity/in-progress/deprecated + per-bucket README + promoted-set invariant) | `aiagent/skills/README.md` | Deferred: with ≤5 skills, bucket folders add cognitive load without buying index value (their own router rule exists to cure user-invoked proliferation). Keep the flat README table; revisit when skills > 10 |

## Promote to Generic Behavior

Evaluated, deliberately NOT auto-promoted (core = behavioral contract only):

| Pattern | Destination | Reason |
|---|---|---|
| Phase-boundary decision menu (continue/clear/handoff/subagent/compact) | `behavior/context-economy.md` module, 2.6.0 | A context-management preference, not a behavioral contract: it changes *how much* context to spend, not *what honesty/authorization requires*. Module per the upgrade matrix (capability/context change) |
| "Facts are the agent's job, never the user's" (grilling) | Stays in `skills/grilling/` — no promotion | Already contracted by frozen core/01 ("Investigate when useful") + core/02 (inquiry is not authorization). The skill supplies the *mechanics* (dispatch lookup, don't block the frontier); the contract already exists. Promoting would duplicate frozen core |
| "Show ranked hypotheses to the user before testing; don't block if AFK" (diagnosing-bugs Phase 3) | Stays in `skills/diagnosing-bugs/` | A debug-phase checkpoint, not a general communication rule. Promotion would leak one skill's procedure into the core contract — exactly what the modules=capability principle forbids |
| "Expected values must come from an independent source of truth" (tdd anti-pattern) | Stays in `skills/tdd/` (Optional) | Test-correctness detail; frozen §8 (Verified/Inferred) + §17 (never fabricate outcomes) already contract the general principle |
| "Stop and say so explicitly. List what you tried" (diagnosing-bugs, when no loop can be built) | Stays in `skills/diagnosing-bugs/` | Frozen §8 (Unknown) + §17 (never fabricate outcomes) already contract this; the skill makes it procedural (what to ask the user for: access, redacted artifact, instrumentation permission) |

## Optional Skills

Available for later waves; not bundled now (context-load discipline: every bundled
description is a permanent catalog line):

| Skill | Reason |
|---|---|
| `tdd` (+ `tests.md`, `mocking.md` references) | Wave 2. Pre-agreed-seams rule ("No test is written at an unconfirmed seam") is the keeper; bundle when test-first work on a real project starts. `codebase-design` glossary (module/interface/depth/seam/leverage/locality) travels with it as a disclosed reference — "a reference to consult, not a session to run" |
| `handoff` | Wave 2, needs user-invocation support first. Format is portable (temp dir, "suggested skills" section, "Do not duplicate content already captured in other artifacts... Reference them by path", redaction, argument = next session's focus) and maps cleanly onto our Notes + session-resume architecture |
| `research` | Our deep-research practice + explorer subagent already cover it; the one line worth stealing later is "Follow every claim back to the source that owns it" → `agents/explorer.md` module addendum (2.6.0) |
| `to-spec` / `to-tickets` | Spec template (Problem/Solution/User Stories/Implementation Decisions/Testing Decisions/**Out of Scope**/"Do NOT include specific file paths... They may end up being outdated very quickly") and vertical-slice rules ("tracer bullet", "sized to fit in a single fresh context window", blocking edges, expand-contract for wide refactors) are good, but they presume a build pipeline we don't have yet. Bundle when multi-session feature work becomes routine; local-file variant (`.scratch/<feature>/issues/NN-slug.md`) fits our workspace |
| `wait-what`, `to-questionnaire` | User-invoked micro-skills (60 words / 470 words); zero value until the invocation split exists (Phase 2). `wait-what` is the cheapest demonstration of the user-invoked pattern when it lands |
| `domain-modeling` | CONTEXT.md/ADR maintenance discipline; the *concept* is adopted (ADR convention, above); the skill itself only earns a slot once we maintain a real CONTEXT.md for a real project |
| `prototype`, `improve-codebase-architecture`, `wizard`, `resolving-merge-conflicts`, `pr` | Situation-specific; adopt on first real need. `pr`'s "Merge Danger: one-way/two-way door + blast radius" is a strong 3-line idea for any future commit-reporting behavior, noted for 2.6.0 review |

## Reject / Do Not Import

| Pattern | Reason |
|---|---|
| Issue-tracker integration (`setup-matt-pocock-skills`, `triage` state machine, label vocabulary, GitHub/Linear wiring) | Our workspace is personal, not a team tracker repo; hard-dependency skills whose output is *wrong* (not just fuzzy) without the config (their ADR 0001) cannot be safely trimmed. They themselves reject niche trackers (`.out-of-scope/mainstream-issue-trackers-only.md`) — consistent with refusing tracker surface we don't use |
| `ask-matt` as a router skill | A router exists to cure memory load from *user-invoked* skills they can't remember ("You don't remember every skill, so ask"). We have 1 model-visible skill; a router is overhead. Its **flow map** (main flow + on-ramps + phase boundaries) has value and is partially salvaged: phase boundaries → context-economy module; the map itself lands in `skills/README.md` prose only when user-invoked skills exist |
| `agents/openai.yaml`, `policy.allow_implicit_invocation`, Claude-Code frontmatter fields | Harness-specific mechanics. The *concept* (invocation split) is adopted; the *fields* will be ours (assembler + CLI), defined in Phase 2 |
| `teach` | A different product: multi-session courseware (HTML lessons, MISSION.md, learning records, communities). Out of scope for this harness's task loop |
| `misc/*` (`migrate-to-shoehorn`, `scaffold-exercises`, `setup-pre-commit`, `git-guardrails-claude-code`) | Tool-specific or hook-based. The guardrails concept is already owned by the harness layer: `permissions.ts` gates before execution — the correct layer, per "harness owns lifecycle" |
| `in-progress/*` (`loop-me`, `claude-handoff`, `implement-spec`, `setup-ts-deep-modules`, `writing-beats/fragments/shape`, `retro` — partial) | Beta status ("public on purpose, feedback wanted, not shipped") or Matt's personal article pipeline. `retro`'s deterministic-checks idea is retained as a Phase 3 eval candidate, not imported |
| Repo style rules (no em-dashes; changesets; plugin version sync) | Their repo's maintenance discipline, not agent behavior. Their own placement confirms this: the rule lives in `CLAUDE.md` prose, not in any skill |
| Plugin/marketplace/symlink distribution | Our distribution is git + bundled `skills/` directory; no second distribution channel needed |

## Scrutinize Overlap

**What `scrutinize` already covers** (skills/scrutinize/SKILL.md, 36cfc98):
intent-first scope validity ("should exist at all"; mandatory simpler-alternative pass:
do nothing / reuse existing / 90%-goal-10%-risk / different layer); end-to-end trace
through *unchanged* code ("Bugs hide at the seams"); per-claim verification with
**Verified/Inferred** labels; breakage-input analysis (concurrency, retries, partial
failure, empty/null/unicode/huge, ordering); silent-change analysis (performance, error
semantics, observability, contracts, on-disk/on-wire formats); test-path verification
("do the tests exercise the traced path or pass while skipping it?"); severity-ordered
findings (Finding/Why it matters/Evidence/Suggested change); verdict
(ship / fix-then-ship / rework / reject) with single biggest reason; read-only stance;
no rubber-stamps; cite-or-it-didn't-happen.

**What `code-review` adds** (skills/engineering/code-review/SKILL.md):
1. **Fixed-point diff mechanics** (§1): pin the comparison point (SHA/branch/tag),
   `git diff <point>...HEAD` three-dot, `git rev-parse` + non-empty check *before*
   reviewing — "A bad ref or empty diff should fail here, not inside two parallel
   sub-agents."
2. **Standards axis**: conformance to the repo's *documented* coding standards, plus a
   fixed 12-item Fowler smell baseline (Mysterious Name, Duplicated Code, Feature Envy,
   Data Clumps, Primitive Obsession, Repeated Switches, Shotgun Surgery, Divergent
   Change, Speculative Generality, Message Chains, Middle Man, Refused Bequest), each
   "what it is → how to fix", bound by "The repo overrides" and "Always a judgement
   call... never a hard violation."
3. **Spec axis**: against the originating issue/spec — (a) required but missing/partial,
   (b) behavior not asked for (scope creep), (c) looks implemented but wrong — each
   finding quoting the spec line.
4. **Axis separation principle** ("Why two axes"): "Code that follows every standard but
   implements the wrong thing → Standards pass, Spec fail... Reporting them separately
   stops one axis from masking the other"; aggregate verbatim, "Do not merge or rerank
   findings."
5. **Parallel sub-agent isolation** (§4): the two axes run in separate contexts so
   neither pollutes the other — a context-hygiene mechanic that depends on sub-agents.

**Is the difference meaningful?** Yes, and it is orthogonal by construction.
`scrutinize`'s center of gravity is **"is this the right thing, and does it actually
work?"** (design validity + runtime truth). `code-review`'s is **"does this follow house
rules and match the ask?"** (conformance + spec fidelity). They fail on different
axes: scrutinize passes a well-built change that solves the wrong problem; code-review
passes a change that does the right thing in the repo's wrong way. Overlap is partial
and bounded: scrutinize's intent step ≈ Spec-axis scope detection (~50%: both catch
"behavior that wasn't asked for"); evidence discipline (cite, claim-vs-verification)
is shared wording with different emphasis.

**Is a second reviewer protocol justified?** **No as a separate skill; yes as a
scrutinize v1.1 extension.** A second bundled reviewer would create competing triggers
in the catalog — both descriptions fire on "review/audit/second opinion" — which is
exactly the pointer defect `writing-for-agents` names ("Synonyms that rename a single
branch are one branch written twice"). One reviewer surface, two conformance axes added
on top of the existing four-step workflow:

- step 0 (new): pin fixed point + verify diff non-empty (code-review §1);
- step 2.5 (new, Conformance): Standards check (cited repo standards + smell baseline
  from disclosed reference `scrutinize/SMELLS.md`, loaded only when the review target is
  code) + Spec check (fidelity to the originating ask);
- report: existing `## Findings` (severity-ordered, verdict as today) + new
  `## Conformance` (per-axis, no cross-axis reranking, one-line worst-per-axis summary);
- parallel sub-agent execution of the two conformance axes: deferred to Phase 2 (first
  consumer of D3 sub-agents, alongside `grilling`'s fact-finding dispatch).

This is a skill_manage-style evolution (M2 loop: propose → verify → persist) requiring
Jam's sign-off at execution time; it touches `skills/` only — no prompt-version change.

**Design review outcome (2026-09-17, reduced scope implemented):** verdict SIMPLIFY.
Kept: fixed-point Step 0 (with no-guess rule, dot-form selection — three-dot for
fork-point, two-dot for explicit range, working-tree form; dirty-tree scope explicitly
reported; exact scope+command in report line 1; empty diff → stop; non-git no-op;
never stash/checkout/add/reset to establish scope), ask-coverage as a Verify
sub-question (missing/partial/scope-creep/wrong), 2-line house-standards check
(documented standards cited; tooling-enforced skipped; nothing documented → one line,
never manufactured), `## Conformance` reported per axis with no cross-ranking, singular
verdict retained. Changed: conformance lives inside Verify, not an independent
lifecycle step; no-spec path reports `core/07-reporting.md` Unknown and Unknown is
explicitly not a pass; the originating spec comes from a 4-rung source ladder (explicit
spec → workspace task/spec file → originating request → vague = goal level only) and is
**never inferred from the implementation** (circularity prohibition). Removed:
`SMELLS.md` / Fowler-12 baseline (deferral trigger: 2+ real reviews where salient-only
smell naming misses design smells a checklist would catch); issue/PR/commit-message
spec sources (no tracker in this architecture). Implemented as a single skill-only
commit; verified by `npm test` + offline smoke (stable hash `ac58441bc07ac44a`
unchanged) + read-only dry runs (non-git plan doc; dirty tree without spec).

## Core Changes

`NONE`.

Every candidate pattern was checked against the frozen sections: investigation-first
loop (core/01), directive/inquiry with no implicit authorization (core/02), reporting
Done/Verified/Observed/Inferred/Unknown (core/07), state model (core/08),
action-specific authorization (core/09), honesty/never-fabricate (core/12). The
collection's behavioral claims — look facts up yourself, stop and say so explicitly,
no rubber-stamps, cite evidence, don't theorize without a red signal — are either
already contracted by these sections or are procedural mechanics that belong in skills.
No recommendation in this document requires a core edit.

## Phase 1 Changes

`NONE` required.

Wave-1 skills are dynamic-tail content (assembler.ts:219): the catalog renders from
frontmatter, bodies load via the existing `read` tool under the catalog's existing
instruction. Validation of the adopted set reuses the existing offline smoke: assert the
three new skills appear in the catalog, the stable hash stays `ac58441bc07ac44a`
(unchanged by construction — skills never enter the stable part), and the
`SKILL-MECHANICS.md` disclosed reference is present on disk.

## Phase 2 Candidates

Ordered by dependency and leverage:

1. **Skill tool + invocation split** (assembler `skillsCatalog` + CLI): honor a
   `disable-model-invocation` equivalent (user-invoked skills leave the model-visible
   catalog, appear in CLI `/skills`); add a first-class `skill(name)` tool so skill
   composition is named ("Call the Skill tool with 'tdd'") instead of a `read` + prose
   mention. Unlocks wave-2 user-invoked skills and removes per-skill permanent context
   load for human-only skills.
2. **Sub-agents** (D3: explorer, general-purpose, planner) — first consumers:
   `grilling`'s "dispatch a sub-agent to find it" fact lookups and `scrutinize` v1.1's
   parallel Conformance axes.
3. **`handoff` skill + runtime `/handoff` command** (user-invoked; temp-dir doc;
   suggested-skills section; reference-don't-duplicate; redaction) — pairs with existing
   session resume for long work.
4. **`tdd` skill** + `codebase-design` glossary as its disclosed reference.
5. **`to-spec`/`to-tickets` local-file planning flow** when multi-session builds become
   routine (spec template + vertical-slice + blocking-edges rules).
6. **`wait-what` / `to-questionnaire`** micro-skills (cheapest user-invocation demos).
7. Unchanged from the existing Phase 2 scope: streaming, Docker sandbox, Ink TUI,
   SQLite session store.

## Phase 3 Candidates

1. **Reviewer sub-agent gate** (already planned, `manifest.json` features.reviewer):
   now with a concrete protocol — run `scrutinize` v1.1 (intent/trace/verify +
   conformance axes) as a reviewer sub-agent vs single-pass self-check; the eval
   compares verdict agreement + finding recall. Winner decides whether
   `agents/reviewer.md` enters 2.6.0.
2. **`retro`-style session retrospective** (in-progress, with deterministic checks) as a
   self-improvement eval: feed its findings into the M2 loop's "Observe gap →
   determine whether recurring" gate.
3. **`writing-for-agents` as the M2 Verify step**: no skill proposal persists without
   passing its pruning/leading-word/no-op/completion-criteria checklist — turning the
   skill from reference into the verification half of our self-improvement contract.
4. **`codebase-design` + DESIGN-IT-TWICE** (parallel sub-agents designing radically
   different interfaces, compared on depth/locality/seam) as the planner sub-agent's
   upgrade path for architecture tasks.

## Recommended Next Step

**Land the wave-1 skill bundle as a skill-only change:** add
`aiagent/skills/diagnosing-bugs/`, `aiagent/skills/grilling/`,
`aiagent/skills/writing-for-agents/{SKILL.md, SKILL-MECHANICS.md}` — adapted from the
cloned originals with documented deltas (A1-A4 format per
`research/9arm-scrutinize-adaptation.md`), update `aiagent/skills/README.md`'s catalog
table, and extend the offline smoke to assert the three new catalog entries and an
unchanged stable hash (`ac58441bc07ac44a`). Zero prompt-version change, zero core
change, fully verifiable offline against the existing Phase 1 runtime.

## Evidence

**Adopt: diagnosing-bugs** — `skills/engineering/diagnosing-bugs/SKILL.md`:
"## Redact... Redact every secret first: write `<REDACTED>` in its place" (matches our
security posture); "## Phase 1: Build a feedback loop — **This is the skill**";
"Completion criterion: a tight loop that goes red" with the four-item checklist
(Red-capable: "it must be able to *catch this specific bug*"; Deterministic; Fast;
Agent-runnable); "If you catch yourself reading code to build a theory before this
command exists, **stop: jumping straight to a hypothesis is the exact failure this
skill prevents.** No red-capable command, no Phase 2."; Phase 3: "Generate **3–5
ranked hypotheses** before testing any... **Show the ranked list to the user before
testing.**... Don't block on it"; Phase 5: "If no correct seam exists, **that itself is
the finding**"; "## When you genuinely cannot build a loop — Stop and say so
explicitly. List what you tried."

**Adopt: grilling** — `skills/productivity/grilling/SKILL.md`: "Map this as a **design
tree**: every decision branches into the decisions that hang off it"; "The **frontier**
is every decision whose prerequisites are already settled... Ask the whole frontier in
one round: number each question and give your recommended answer"; "Finding *facts* is
your job, never the user's... dispatch a sub-agent to find it; don't ask the user for
anything you could look up yourself... The *decisions* are the user's: put each to them
and wait."; "The session is done when the frontier is empty... Do not act on it until
the user confirms." (The last line is our frozen §13 in miniature — no adaptation risk.)

**Adopt: writing-for-agents** — `skills/productivity/writing-for-agents/SKILL.md`:
"the same levers make each one predictable, since the agent takes the same *process*
every run"; "A **context pointer**... The pointer's *wording*, not its target, decides
when the agent reaches the material"; "The two loads" (context load vs cognitive load,
"the human is the index"); information hierarchy rungs 1-3 (in-file step / in-file
reference / disclosed reference) + "Branching is the cleanest disclosure test: inline
what every branch needs, and push behind a pointer what only some branches reach";
"**Completion criterion**... **Clarity**... **Demand**: how much it requires";
"**Leading word**... it accumulates a distributed definition and anchors a whole region
of behaviour in the fewest tokens, by recruiting priors the model already holds"
(examples: "fast, deterministic, low-overhead" → *tight*; "a loop you believe in" →
*red*); "**Negation** is the failure mode... Prompt the **positive**"; pruning rules:
"single source of truth", "The **environment** is a source of truth too", "the default
fate is **sediment**", "Hunt **no-ops** sentence by sentence... The test... is
model-relative... settle it by running the document, not by debate."
`SKILL-MECHANICS.md`: "**Model-invoked**... permanent context load in exchange for
discoverability. A model-invoked skill whose content is all reference is also one home
for shared reference"; "**User-invoked**... Zero context load, but it spends cognitive
load"; "Pick model-invocation only when the agent must reach the skill on its own, or
another skill must"; router: "one user-invoked skill that names the others and when to
reach for each."

**Adopt: ADR + out-of-scope** — `.agents/adr/0002-ship-as-a-claude-code-plugin.md`
(structure: constraint → rejected escape hatches with test results → Decision →
"Invariants this creates" → dated Update); `.out-of-scope/question-limits.md` ("## Why
this is out of scope... ## Prior requests — #44"); `CLAUDE.md`: "Whenever you add,
rename, remove, or change how a user-reachable skill fits the flows, re-read `ask-matt`'s
`SKILL.md` and update it... a new skill it never mentions, or a stale one it still
routes to, is a router that lies."

**Adapt: code-review → scrutinize** — `skills/engineering/code-review/SKILL.md`
citations in `## Scrutinize Overlap` (fixed-point §1, smell baseline list + "The repo
overrides"/"Always a judgement call", Spec axis (a)(b)(c), §4 parallel sub-agents with
per-axis briefs and "Under 400 words", "## Why two axes... Reporting them separately
stops one axis from masking the other", §5 "Do **not** merge or rerank findings").

**Adapt: context-economy** — `skills/engineering/ask-matt/SKILL.md` "## Phase
boundaries": "At the **boundary** between two of them you have five options, and picking
between them is the fuzziest decision in this whole map: Continue... **`/clear`**...
**`/handoff`** writes a portable markdown file. Narrow... Subagent... **`/compact`**...
The **default**, at the bottom of the tree rather than the first reach."; "## Context
hygiene": "Keep steps 1–3 in **one unbroken context window**... **`/clear`ing context
between each** [ticket]. Each ticket is self-contained, so the last one's context is
disposable."; "The limit on this is the **[smart zone]**: the window (~150k tokens...)"

**Adapt: invocation/Skill tool** — `.agents/invocation.md`: "Dependencies are expressed
as an explicit instruction to **call the Skill tool** with the named skill... Naming the
tool is what gets it fired: most harnesses expose skill invocation as a tool the model
calls, and spelling that out gets a higher hit rate than dropping a `/name` into prose";
"`skills/engineering/implement/SKILL.md` (70 words): "Use /tdd where possible, at
pre-agreed seams... Once done, use /code-review to review the work." — a composition
skill; `skills/productivity/grill-me/SKILL.md` (22 words, body = "Call the Skill tool
with 'grilling'.") — an alias entry point.

**Reject: tracker integration** — `skills/engineering/triage/SKILL.md`: hard dependency
on per-repo config ("The mapping should have been provided to you. If not, tell the user
to run `/setup-matt-pocock-skills`"); `.agents/adr/0001-explicit-setup-pointer-only-for-
hard-dependencies.md`: "Without the mapping, output is wrong, not just fuzzy";
`.out-of-scope/mainstream-issue-trackers-only.md`: "Each new backend is permanent
maintenance surface."

**Reject: teach** — `skills/productivity/teach/SKILL.md`: "The user has asked you to
teach them something. This is a stateful request... MISSION.md... ./lessons/*.html: A
lesson is a single, self-contained HTML output... Fluency vs Storage Strength...
desirable difficulty: Using retrieval practice... Spacing" — courseware product, not
task-loop behavior.

**Misc layering** — `skills/misc/git-guardrails-claude-code/SKILL.md`: "Set up Claude
Code hooks to block dangerous git commands... before they execute" — pre-execution
gating is our `runtime/src/core/permissions.ts` + `loop.ts` permission gate's existing
job (harness layer), confirming skills must not own lifecycle.

**AGENTS.md corroboration** — `skills/engineering/domain-modeling/SKILL.md` (file
governance section): "CLAUDE.md/AGENTS.md: these files are pushed to the context window
of any agent working in this repo. They should be used incredibly sparingly, usually
only for **navigation pointers** to other files."
