# Bundled skills

Skills shipped with the harness (loaded in addition to workspace `skills/`).
Format: the open SKILL.md standard — a folder with `SKILL.md` (YAML
frontmatter: `name`, `description`) plus optional scripts/resources.
Progressive disclosure: name + description appear in the session catalog;
the full body loads only when the skill is applied.

| Skill | Purpose |
|---|---|
| `scrutinize` | Outsider-perspective end-to-end review of plans/PRs/diffs (adapted from thananon/9arm-skills; see `../../research/9arm-scrutinize-adaptation.md`). v1.1: Step 0 scope/fixed-point (never guess, dot-form rule, dirty-tree scope reported, read-only, non-git no-op); ask-coverage + house-standards conformance inside Verify (source ladder, Unknown is not a pass, never inferred from the implementation); report adds a `## Conformance` axis, never cross-ranked with `## Findings` (see `../../research/matt-pocock-agents-integration.md`) |
| `diagnosing-bugs` | Diagnosis loop for hard bugs/perf regressions: build a tight red feedback loop before theorising, then reproduce, minimise, hypothesise, instrument, fix, clean up (adapted from mattpocock/skills; see `../../research/matt-pocock-agents-integration.md`) |
| `grilling` | Relentless interview (design tree, frontier rounds, recommended answers) to sharpen a plan/decision before acting; facts are the agent's job, decisions the user's (adapted from mattpocock/skills) |
| `writing-for-agents` | Writing reference for agent-consumed docs: context pointers, the two loads, information hierarchy, completion criteria, leading words, pruning; includes `SKILL-MECHANICS.md` disclosed reference for skill frontmatter/invocation (adapted from mattpocock/skills) |
