#!/usr/bin/env bash
# Deterministic: creates the fixture repo in cwd and commits it.
set -euo pipefail
rm -rf .git
mkdir -p lib test
cat > package.json <<'JSON'
{ "name": "cart-fixture", "private": true, "type": "module", "scripts": { "test": "node test/test.js" } }
JSON
cat > README.md <<'MD'
# Cart fixture

Business rules for `total(items)`:

1. `subtotal` = sum of item prices
2. if `subtotal >= 100`, apply a 10% discount to the subtotal
3. apply 7% tax **on the post-discount amount**
4. add flat 5 shipping

`test/test.js` encodes these rules and is correct; if it fails, the library is wrong.
MD
cat > lib/cart.js <<'JS'
export function total(items, { discountThreshold = 100, discountRate = 0.1, taxRate = 0.07, shipping = 5 } = {}) {
  const subtotal = items.reduce((s, it) => s + it.price, 0);
  const discount = subtotal >= discountThreshold ? subtotal * discountRate : 0;
  const taxable = subtotal - discount;
  // tax
  const tax = subtotal * taxRate;
  return Math.round((subtotal - discount + tax + shipping) * 100) / 100;
}
JS
cat > test/test.js <<'JS'
import { total } from '../lib/cart.js';
const items = [{ price: 120 }];
const got = total(items);
// rules: 120 - 12 (10% discount) = 108; tax 7% of POST-discount 108 = 7.56; + 5 shipping = 120.56
const want = 120.56;
if (Math.abs(got - want) > 0.001) {
  console.error(`FAIL: total() = ${got}, want ${want} (tax must be computed on the post-discount amount)`);
  process.exit(1);
}
console.log(`PASS: total() = ${got}`);
JS
git init -q
git config user.email eval@aiagent.local
git config user.name "eval-fixture"
git add -A
git commit -qm "seed: cart fixture (test red)"
