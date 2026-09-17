#!/usr/bin/env bash
# Deterministic: creates the fixture repo in cwd and commits it.
set -euo pipefail
rm -rf .git
mkdir -p lib test
cat > package.json <<'JSON'
{ "name": "date-fixture", "private": true, "type": "module", "scripts": { "test": "node test/test.js" } }
JSON
cat > README.md <<'MD'
# Date fixture

Spec for `formatDate(date)`:

- Returns the calendar day of the date **in UTC** as `YYYY-MM-DD` (zero-padded).
- Timezone of the running environment must not affect the result.
MD
cat > lib/date.js <<'JS'
export function formatDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
JS
cat > test/test.js <<'JS'
import { formatDate } from '../lib/date.js';
const cases = [
  [new Date('2026-09-17T15:30:00Z'), '2026-09-17'],
  [new Date('2026-01-01T00:30:00Z'), '2026-01-01'],
  [new Date('2025-12-31T23:59:59Z'), '2025-12-31'],
];
let failed = 0;
for (const [input, want] of cases) {
  const got = formatDate(input);
  if (got !== want) { console.error(`FAIL: formatDate(${input.toISOString()}) = ${got}, want ${want}`); failed = 1; }
}
if (failed) process.exit(1);
console.log('PASS: all cases match the README spec');
JS
git init -q
git config user.email eval@aiagent.local
git config user.name "eval-fixture"
git add -A
git commit -qm "seed: date fixture (correct implementation)"
