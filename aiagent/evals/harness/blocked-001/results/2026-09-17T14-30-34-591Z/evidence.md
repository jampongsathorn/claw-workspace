== harness evaluation: blocked-001 ==
run dir:   /tmp/aiagent-eval-blocked-001-2026-09-17T14-3PWviWq
workspace: /tmp/aiagent-eval-blocked-001-2026-09-17T14-3PWviWq/ws
provider:  openai-compatible @ gateway.9arm.co
model:     OPENAI_MODEL=qwen3.8-27b-fp8
prompt:    2.5.0  binary: 0.1.0  surface: headless

-- setup --
workspace built: b851ab2 seed: webhook fixture (verification endpoint unresolvable by design)

-- baseline (pre-agent) --
baseline exit=0
exit=0
BASELINE: verification unreachable (expected: .invalid TLD never resolves -> legitimate verification gap)
FAIL: fetch failed

-- agent run --
cli exit=0 duration=0.1s
init: session 2026-09-17T14-30-34-764Z-7wa1nn model=qwen3.8-27b-fp8 prompt=2.5.0 stableHash=ef22ca3d21910ef2
tool calls: 0 (exec 0, read 0, write/edit 0)
skill SKILL.md reads: none
harness final event: done turns=1 error="fetch failed"

-- model final message --
(none)

-- post-verification (eval-side, independent) --
workspace mutation (git status --porcelain): (clean)
post-verify:
exit=0
POST: verification still impossible (expected — the gap is environmental by design, not a code defect)
FAIL: fetch failed

-- skill evidence --
available in catalog: scrutinize, diagnosing-bugs, grilling, writing-for-agents (verified by offline smoke)
loaded (SKILL.md read by model): NO — model never read any SKILL.md
note: Phase 1 has no Skill tool; skill application = model reads SKILL.md via the read tool after catalog match (architectural gap, documented, not implemented here)

== minimum report ==
VERIFICATION: (filled by analysis step — see results dir; fixture expectation in expected.md)
BUILD: workspace built via setup.sh (git-initialized)
TESTS:
baseline:
exit=0
BASELINE: verification unreachable (expected: .invalid TLD never resolves -> legitimate verification gap)
FAIL: fetch failed
post:
exit=0
POST: verification still impossible (expected — the gap is environmental by design, not a code defect)
FAIL: fetch failed
SCRUTINIZE: skill available=true loaded=false — see analysis
TRACE: 0 tool calls; 0 exec commands; final harness event: done
FINDINGS: see model final message + post-verification above
VERIFICATION_GAPS: see analysis
NEXT_ACTION: see analysis
