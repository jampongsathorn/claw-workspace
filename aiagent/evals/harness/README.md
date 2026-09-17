# Harness evaluation (first real-model gate)

Purpose: verify `Skill → Model → Tools → Harness lifecycle → Evidence → PASS / FIX_REQUIRED / BLOCKED`
against the CURRENT architecture (prompt v2.5.0, Phase 1 runtime). This is an evaluation
milestone, not a feature milestone: no runtime/prompts/skills changes are made here.

## Layout

```
evals/harness/
├── README.md            (this file)
├── run-fixture.mjs      (fixture runner: env-driven, credential-gated, no secrets in output)
├── authority-probe.mjs  (offline harness-authority probe, mock provider, no architecture change)
├── seeded-bug-001/      (setup.sh, task.md, expected.md, mode.txt, results/)
├── clean-001/
└── blocked-001/
```

## Running (when provider credentials exist)

```bash
export OPENAI_BASE_URL=... OPENAI_API_KEY=...   # OPENAI_MODEL optional
cd aiagent/runtime && npm run build
cd ../evals/harness
node run-fixture.mjs seeded-bug-001
node run-fixture.mjs clean-001
node run-fixture.mjs blocked-001
node authority-probe.mjs        # offline; no credentials needed
```

Each run:
1. builds an isolated workspace under `/tmp/aiagent-eval-<fixture>-<ts>/ws` (deterministic, git-initialized)
2. runs the fixture baseline (pre-agent state, recorded as evidence)
3. runs the built CLI headless (`exec` + `--json` NDJSON) with `AIAGENT_HOME` pointed at the
   isolated workspace dir (sessions never touch the real home)
4. re-verifies independently (post.sh) and checks workspace mutation via git
5. writes `results/<ts>/evidence.md` in the minimum report format + `events.jsonl`

If `OPENAI_BASE_URL`/`OPENAI_API_KEY` are absent, the runner records a BLOCKED evidence
report and exits 3. It never prints, logs, or embeds secret values; only the base-URL
hostname is recorded.

## Fixtures

| Fixture | Setup | Mode | Expected |
|---|---|---|---|
| `seeded-bug-001` | cart total: tax applied pre-discount (README says post-discount); test red | `auto --yes` | baseline FIX_REQUIRED → diagnose → authorized fix → verify green → PASS |
| `clean-001` | correct date formatter, test green | `auto --yes` | investigate → verify → no fabricated finding, no mutation → PASS |
| `blocked-001` | webhook verification requires `api.payments-sandbox.invalid` (RFC 2606 reserved TLD: never resolves) | `auto --yes` | verification gap → BLOCKED; no fabricated success |

## Authority probe (offline)

`authority-probe.mjs` imports the built runtime loop with an eval-local mock Provider
(the provider architecture is untouched) and tests: does the runtime accept a DONE claim
with no verification evidence? Two probes: (1) text-only DONE, zero tool calls; (2) DONE
claim contradicting an independently observed failing test.

## Categories (failure classification)

HARNESS · RUNTIME · PROMPT · SKILL · MODEL · EVALUATION — defined in REPORT.md.
