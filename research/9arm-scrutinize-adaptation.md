# `scrutinize` — Understanding & Adaptation to the aiagent Harness

- **Date:** 2026-09-17
- **Source:** [thananon/9arm-skills — skills/engineering/scrutinize/SKILL.md](https://github.com/thananon/9arm-skills/blob/main/skills/engineering/scrutinize/SKILL.md) (repo: 3.2k★ / 424 forks; 65 lines)
- **Adapted artifact:** `aiagent/skills/scrutinize/SKILL.md` (bundled skill, live content — **no prompt-version change**)

---

## 1. What the skill is

A **review protocol**, not a tool wrapper: it tells the agent *how to review* a plan, PR, or code change so that the review has teeth. Its two-part definition: *stand outside the change and ask whether it should exist at all, then verify it actually does what it claims end-to-end.*

The four-step workflow (mandatory order, no skipping ahead):

1. **Intent** — restate the goal in one sentence (can't → artifact is underspecified, stop); then the mandatory *simpler-alternative pass*: do nothing / reuse what exists / 90%-of-goal-10%-of-risk / solve at a different layer. "If a better alternative exists, name it explicitly with rationale. **This is the most valuable thing you can output.**"
2. **Trace** — walk the real code path for every claimed behavior (entry → call sites → branches → state → exit), *including the unchanged code on either side of the diff* — "Bugs hide at the seams." For plans: trace the proposed flow against the existing system; "what does it assume that isn't true?"
3. **Verify** — per claim: does the traced path produce it (walked explicitly: "It claims X. Path: A → B → C. At C, [observation]. Therefore [holds/doesn't hold]"); what inputs/states break it (concurrency, retries, partial failure, empty/null/unicode/huge, ordering); what it silently changes (perf, error semantics, observability, contracts, on-disk/wire formats); and do the tests actually exercise the path or pass while skipping it (mocks that hide the bug, happy-path-only).
4. **Report** — one section per finding, severity-ordered (blocker → major → nit), each with Finding / Why it matters / Evidence / Suggested change, closed by a one-line verdict: **ship / fix-then-ship / rework / reject** + the single biggest reason.

## 2. Why it's strong (the parts worth preserving verbatim)

- **Intent-first review.** Most agent reviews go straight to line-level; this one spends step 1 asking *should this exist* — the highest-leverage review question (scope errors cost 10× line errors).
- **Claim/verification separation.** "The PR says X" vs "I traced X and confirmed/refuted it" as distinct output categories — this is exactly the evidence discipline our core's 5-state reporting contract (Done/Verified/Observed/Inferred/Unknown) encodes.
- **Anti-failure-modes in the rules:** no rubber-stamps (LGTM is not an output — if clean, state what was traced), "cite or it didn't happen" (no vague "might break under load"), no nit-padding when a structural problem exists, no flattery/hedging.
- **A decision-grade verdict** (ship / fix-then-ship / rework / reject) — the user gets an action, not an essay.
- **The "no simpler-alternative pass is mandatory" rule** with a single explicit opt-out ("don't question scope") — the right shape: default-on with one clean escape hatch.

## 3. Adaptation decisions (what changed and why)

The original is good; the adaptation is deliberately small — 4 deltas, all wiring it into our locked architecture:

| # | Change | Rationale (our harness reference) |
|---|---|---|
| A1 | **Read-only as a first rule** ("A review request is not authorization to change anything. If you find something worth fixing, report it; fixing is a separate, authorized action.") + "Read-only" stated in the frontmatter description | The original leaves mutability to the agent's judgment. Our locked contract is explicit: §2 (Inquiry ≠ implicit authorization to modify) + §13 (authorization is action-specific). A review *directive* authorizes investigation, not edits. The catalog description also tells future sessions the skill never mutates — relevant for sub-agent `disallowedTools` planning. |
| A2 | **Verified/Inferred labels** added to step 3 ("Label each claim **Verified** (traced and confirmed) or **Inferred** (follows, but not observed)") | Direct mapping onto our frozen §8 reporting taxonomy (5-state). The original's "therefore [holds / doesn't hold]" already implies it; making it a label means the report is mechanically checkable against the honesty contract. |
| A3 | **Notes checkpoint line** in step 2 (trace state survives compaction) | Our frozen §9 state model + state-mechanics: active task state belongs in Notes. A multi-file trace is exactly the state that dies in compaction if not checkpointed. One line; the skill now behaves correctly across long PRs. |
| A4 | **Description tuned for the catalog** (progressive disclosure): kept the trigger-rich phrasing (that's what drives application), appended the read-only fact | Our `behavior/skills.md` contract: the catalog shows name+description only; the description carries the whenToUse load. The read-only note prevents a future session from treating "review this PR" as license to edit. |

**What was intentionally NOT changed:** the 4-step workflow, the stance, the severity model, the verdict taxonomy, all seven operating rules, and almost all of the prose. A famous skill that's already sharp gets wired in, not rewritten — the same "smallest change" principle the skill preaches.

## 4. Integration path (how it sits in the locked architecture)

```
aiagent/skills/scrutinize/SKILL.md      ← bundled skill (this)
        │  discovered at session start
        ▼
dynamic tail: "### Skills — scrutinize: <description>"   ← catalog line
        │  user: /scrutinize | "review this PR" | "sanity-check this plan"
        ▼
agent reads full SKILL.md → applies the 4-step protocol (read-only)
        │
        ▼  (later, phase 3)
agents/reviewer.md  ← candidate: the reviewer sub-agent's body IS this
                      workflow, with disallowedTools read-only
```

- **No prompt-version change.** Skills are dynamic-tail content (per `assembler-spec.md` §3), not part of the stable part. This is the upgrade matrix paying off: *capability change → module/content version; the locked 2.5.0 core is untouched.*
- **The deferred reviewer sub-agent gets its definition.** The decision framework deferred `reviewer` behind a phase-3 eval gate. `scrutinize` now supplies exactly what that evaluation needs: a concrete, proven review protocol. Phase-3 comparison: *main agent + scrutinize skill* vs *dedicated reviewer sub-agent whose body is this workflow* (isolated context = cheaper on large PRs, summary-return keeps the main loop lean). If the sub-agent wins → 2.6.0 adds `agents/reviewer.md` (T3 feature expansion, catalog change = prompt minor).
- **Proactive triggering is compatible.** The description triggers on review requests ("review, audit, sanity-check, second opinion") — that's semantic relevance, not the keyword-matching our skills contract forbids.

## 5. Verification

- [x] Adapted `SKILL.md` parses as valid open-standard frontmatter (name + description).
- [x] Read-only rule consistent with frozen §2/§13.
- [x] Verified/Inferred labels consistent with frozen §8 taxonomy.
- [x] Notes line consistent with frozen §9 + `behavior/state-mechanics.md`.
- [x] No changes under `prompts/` (lock intact); manifest untouched.
- [ ] Behavioral eval (run against a seeded-bug PR) — happens with the phase-1 runtime.
