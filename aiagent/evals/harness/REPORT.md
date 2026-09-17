# Harness evaluation — Round 4 (Phase 2B rerun: preflight with real credentials)

Date: 2026-09-17 (Asia/Bangkok) · Runtime commit under test: `cb5d9c2` (Phase 2A completion gate)
Runner: `run-fixture.mjs` (unchanged) · Fixtures: unchanged

## STATUS: **BLOCKED** (NETWORK — single remaining blocker)

Round 4 preflight (real credentials supplied via env-only, as ordered):

| precondition | result |
|---|---|
| provider identity | custom (OpenAI-compatible wire protocol; runtime adapter `openai`, unmodified) |
| protocol | OpenAI-compatible |
| endpoint configured | `gateway.9arm.co` /v1 (value in env only; never printed beyond this hostname-level record) |
| credentials present | **YES** (25-char key, env-only; not printed, logged, persisted, or committed) |
| model configured | `qwen3.8-27b-fp8` (env-only) |
| endpoint reachable | **NO** — TLS handshake cut at egress: `SSL_ERROR_SYSCALL` in 0.076–0.105 s (three single-attempt probes, 8–10 s timeouts, no retries) |
| proxy vars in env | none (curl's normal proxy path would have used them; this is direct egress policy) |
| control host | `github.com` → **200 in 0.30 s** — network stack + allowlist functional |
| prompt hash | `ac58441bc07ac44a` ✓ (locked v2.5.0, byte-identical) |

Attribution: the cut occurs at the TLS handshake, **before any HTTP request or
auth exchange** — the (now-present) key cannot affect it. Per-host egress
allowlist, unchanged since round 2. Therefore: **EVALUATION blocker (F1) is
cleared; NETWORK blocker (F2) remains and is now the sole blocker.** Per the
milestone order ("If the endpoint is unreachable … STOP. Do not modify code.
Report BLOCKED."), no fixture was run this round.

Round-3 report (no-credentials block + gate context) remains in git history
(`e314774`); the completion-gate context section below it still applies to the
next unblocked run.

---

# (Round 3 record, superseded-status only) Harness evaluation — Round 3 (Phase 2B: real-model E2E attempt)

Date: 2026-09-17 (Asia/Bangkok) · Runtime commit under test: `cb5d9c2` (Phase 2A completion gate)
Runner: `run-fixture.mjs` (unchanged this round) · Fixtures: unchanged from round 1

## STATUS: **BLOCKED** (EVALUATION + NETWORK)

Real-model E2E **could not be executed** in this environment. Two independent
blockers, both outside the runtime:

1. **EVALUATION — provider credentials absent from the environment.**
   `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL` were all unset in this
   session's environment (verified by name-only scan; values never persisted
   anywhere, per the env-only rule). The runner's credential gate therefore
   stopped each fixture before the model run — by design, no workaround, no
   local mock (mock-gateway e2e was already proven in Phase 2A and is not a
   substitute for this milestone).

2. **NETWORK — egress to OpenAI-compatible gateways is cut at the TLS layer.**
   Re-verified this round (single probe per host, 8 s timeout, no retries):

   | probe | result |
   |---|---|
   | DNS `gateway.9arm.co` | resolves (2606:4700:…/Cloudflare) |
   | HTTPS `gateway.9arm.co` | `SSL_ERROR_SYSCALL` in 0.05 s — connection cut |
   | HTTPS `api.openai.com` (control for any reachable OpenAI-compatible endpoint) | `SSL_ERROR_SYSCALL` in 0.04 s — connection cut |
   | HTTPS `github.com` (control) | **200 in 0.36 s** — network stack + egress allowlist work |

   Attribution: DNS works, non-allowlisted hosts are cut at TLS handshake,
   allowlisted hosts succeed → **per-host egress allowlist**, same root cause
   as round 2. Not a runtime defect (round 2 already showed the runtime emits
   a clean `error "fetch failed"` → `done(error)` for this).

   Consequence: even with credentials, the model leg of this milestone cannot
   run until the gateway host is on the egress allowlist (or an equivalent
   reachable OpenAI-compatible endpoint is provided via env).

## ENVIRONMENT (reported before runs, per milestone order)

```
PROVIDER:       openai-compatible (runtime adapter: openai)
BASE_URL:       missing (unset in this session's environment)
MODEL:          missing (would default to gpt-5.6 if a base URL existed)
API_KEY:        missing
PROMPT_VERSION: 2.5.0
PROMPT_HASH:    ac58441bc07ac44a  (verified: matches locked v2.5.0 render, byte-identical)
BINARY_VERSION: 0.1.0
PLATFORM:       linux/bash (x86_64)
SURFACE:        headless (exec mode)
```

Prompt hash check passed (== `ac58441bc07ac44a`) → the stop condition on prompt
divergence was **not** triggered.

## FIXTURES (all three executed; all stopped at the credential gate)

| fixture | runner exit | completion gate state | evidence |
|---|---|---|---|
| seeded-bug-001 | 3 (BLOCKED, no credentials) | n/a — no model run, no completion request | `seeded-bug-001/results/2026-09-17T14-53-15-318Z/evidence.md` |
| clean-001 | 3 (BLOCKED, no credentials) | n/a — no model run, no completion request | `clean-001/results/2026-09-17T14-53-15-368Z/evidence.md` |
| blocked-001 | 3 (BLOCKED, no credentials) | n/a — no model run, no completion request | `blocked-001/results/2026-09-17T14-53-15-404Z/evidence.md` |

Secret scan of the three new evidence dirs: clean (no key patterns).

## Completion-gate context for the NEXT real-model run (post-2A)

- All three fixture workspaces get a **derived contract** (headless default):
  - seeded-bug-001, clean-001: `package.json scripts.test` present →
    `verification {command: "npm test --silent"}` + `report`. The model must
    actually run `npm test` (exact command) for the gate to see exit 0;
    claiming success without running it → `FIX_REQUIRED`.
  - blocked-001: **no** `scripts.test` → derived contract is `report` only.
    With the derived contract, an *honest* verification-gap report would gate
    to PASS (the report requirement is met); the fixture's designed
    `BLOCKED` outcome is reachable only with an **explicit contract**
    requiring the live call, e.g.
    `{"requirements":[{"kind":"verification","id":"live-call","command":"bash test/verify.sh"},{"kind":"report"}]}` —
    then the model's observed `ENOTFOUND` (capability-class) yields
    `BLOCKED`. The runner does not currently pass `--contract` for fixtures;
    this is an evaluation-config decision for the unblocked round, not a
    runtime change. Recorded, not acted on, per milestone order.
- Gate verdicts will be machine-observable in two places on the next run:
  the `done` event's `completion` field (persisted in `events.jsonl`) and
  the CLI exit code (0 PASS / 10 FIX_REQUIRED / 11 BLOCKED / 12 NEEDS_INPUT),
  which the runner already prints (`cli exit=N`).

## FINDINGS

- **F1 — EVALUATION (round 3; CLEARED in round 4):** provider credentials
  were absent from the session environment; runner correctly refused to run
  without them. Round 4: real credentials supplied env-only → preflight
  passed. Env-only rule honored throughout all rounds (no secrets written,
  printed, or committed).
- **F2 — NETWORK (carried from round 2, re-verified this round):** egress
  allowlist cuts `gateway.9arm.co` (and `api.openai.com`) at TLS; control
  `github.com` returns 200. Smallest blocker for the model leg.
- **F3 — HARNESS (new, minor, documented only — NOT fixed per milestone
  order):** `run-fixture.mjs` does not print the `done` event's `completion`
  (gate verdict) field in `evidence.md`. The data IS captured: the full event
  stream (including `completion`) is persisted in `events.jsonl`, and the
  gate-authority CLI exit code is printed. No impact on this round (no model
  run ⇒ no verdict). Candidate one-line runner improvement for the unblocked
  round; deferred, not applied.
- **F4 — RUNTIME (carried, locked, untouched):** tautological init `platform`
  ternary at `core/loop.ts:56`. Out of scope for 2A and 2B by explicit order;
  to be fixed as a separate job.
- **F5 — RUNTIME (carried, noted):** CLI EPIPE crash when the stdout consumer
  closes early (pipe to `head`). Unaffected by the runner (consumes all
  stdout). Out of scope.

## MODEL / SKILL BEHAVIOR

**UNKNOWN — not measurable this round.** No model turn occurred, so nothing
can be said about lifecycle discipline, verification discipline, diagnosis,
fix behavior, or skill adherence. Per the milestone's own rule, infrastructure
failures are not attributed to the model. Skill catalog state is unchanged
and offline-verified (smoke: scrutinize, diagnosing-bugs, grilling,
writing-for-agents present in the dynamic tail). Phase 1 limitation stands:
no Skill tool — "skill loaded" means the model reads `SKILL.md` via the
`read` tool; that cannot be observed without a model run.

## UNBLOCK OPTIONS (for the model leg)

1. Add `gateway.9arm.co` (or the chosen gateway host) to the sandbox egress
   allowlist, and provide `OPENAI_BASE_URL`/`OPENAI_API_KEY`/`OPENAI_MODEL`
   in the run environment (env-only, as before).
2. Point the env at any reachable OpenAI-compatible endpoint.
3. Run the committed commands on Jam's machine:
   `cd aiagent/evals/harness && node run-fixture.mjs seeded-bug-001` (etc.),
   with the three env vars set — the runner and fixtures are self-contained.

## BOUNDARY (honored this round)

No prompt, frozen-core, scrutinize, Wave 1 skill, completion-gate, runtime,
fixture, or expectation changes. No Skill invocation / sub-agents / recovery
loops / MCP / new providers added. F4 and F5 untouched. No secrets anywhere.
One evaluation-artifact commit (this report + the three evidence dirs); no
code changes.
