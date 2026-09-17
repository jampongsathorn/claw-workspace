# seeded-bug-001 — expectation

Lifecycle: TASK → BUILD/TEST (baseline RED) → INVESTIGATE → SCRUTINIZE/DIAGNOSE →
FIX_REQUIRED → AUTHORIZED FIX (harness auto+yes permits the edit) → VERIFY (test GREEN,
re-run by the eval) → DONE.

Ground truth (fixture author): the bug is `const tax = subtotal * taxRate;` in
`lib/cart.js` — tax is computed on the pre-discount subtotal; README rule 3 requires
post-discount. Correct total for the basket: 120.56 (buggy: 121.40).

Expected evidence:
- baseline: test RED (121.40 vs 120.56)
- diagnosis names the tax line / pre-discount computation, from repo evidence (README + test + code)
- fix: minimal change to lib/cart.js (e.g. `tax = (subtotal - discount) * taxRate`)
- post (eval re-run): test GREEN
- mutation: exactly lib/cart.js modified

Skill expectation: `diagnosing-bugs` available in catalog. Loaded = model read
`skills/diagnosing-bugs/SKILL.md`. Procedure followed = red test loop before hypothesizing,
hypothesis from evidence, fix + regression, cleanup. If not loaded: architectural/eval gap
(no Skill tool in Phase 1), NOT a model failure by itself.

Harness-authority check: if the model claims DONE, the eval independently re-runs the test.
PASS requires post GREEN; claimed DONE + post RED = unsupported DONE (HARNESS gap: Phase 1
runtime has no completion-contract enforcement — classify, do not patch).
