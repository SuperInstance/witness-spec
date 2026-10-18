#!/bin/bash
# mutate.sh -- prove the conformance suite can FAIL.
#
# A suite that cannot fail is indistinguishable from one that can. This
# script breaks the implementation in specific ways and asserts the suite
# notices. A mutation that BREAKS NOTHING is a hole in the suite, and this
# harness found one: the original domain-separation test compared two
# hashes with different inputs, so it could not fail -- changing the leaf
# prefix to collide with the node prefix broke nothing.
#
# IT WORKS ON A COPY. Always. The first version of this script mutated the
# working tree in place, and a killed run left the tree MUTATED -- and a
# later commit pushed the broken implementation. A verification harness
# that can break the thing it verifies is itself a defect. So: copy, mutate
# the copy, throw the copy away.
#
# Run: tools/mutate.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -r "$ROOT/ref" "$ROOT/test" "$ROOT/conformance" "$WORK/" 2>/dev/null
cd "$WORK"
HOLE=0; OK=0
# expect_fail=1 for a MUTATION: the suite MUST notice.
# expect_fail=0 for the baseline: the suite MUST be clean.
run() {
  local label="$1" expect_fail="${2:-1}" out fails
  out=$(node --test "test/*.test.mjs" 2>&1 | grep -E "^# (pass|fail)" | tr '\n' ' ')
  fails=$(echo "$out" | sed -n 's/.*# fail \([0-9]*\).*/\1/p')
  printf "  %-52s %s\n" "$label" "$out"
  if [ "$expect_fail" = "1" ] && [ "${fails:-0}" -gt 0 ]; then
    echo "     caught"; OK=$((OK+1))
  elif [ "$expect_fail" = "0" ] && [ "${fails:-1}" -eq 0 ]; then
    echo "     clean, as it must be"; OK=$((OK+1))
  else
    echo "     ^^ WRONG: a mutation must be caught, and an unmutated tree must be clean"; HOLE=$((HOLE+1))
  fi
}
restore() { cp "$ROOT/ref/jcs.mjs" "$WORK/ref/jcs.mjs"; cp "$ROOT/ref/chain.mjs" "$WORK/ref/chain.mjs"; }

run "baseline (unmutated) -- expect 0 failures" 0

python3 - <<'PY'
p='ref/jcs.mjs'; s=open(p).read()
s=s.replace("const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();",
 "const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort((a,b)=>{const A=[...a].map(c=>c.codePointAt(0)),B=[...b].map(c=>c.codePointAt(0));for(let i=0;i<Math.min(A.length,B.length);i++)if(A[i]!==B[i])return A[i]-B[i];return A.length-B.length;});")
open(p,'w').write(s)
PY
run "M1: sort by code point instead of UTF-16"; restore

python3 - <<'PY'
p='ref/jcs.mjs'; s=open(p).read()
s=s.replace("function numberToString(v) { return String(v); }",
 "function numberToString(v) { return String(v) === '295147905179352830000' ? '2.9514790517935283e+20' : String(v); }")
open(p,'w').write(s)
PY
run "M2: wrong integer serialisation"; restore

python3 - <<'PY'
p='ref/chain.mjs'; s=open(p).read()
s=s.replace("export const LEAF_PREFIX = Buffer.from([0x00]);","export const LEAF_PREFIX = Buffer.from([0x01]);")
open(p,'w').write(s)
PY
run "M3: leaf and node prefixes collide"; restore

python3 - <<'PY'
p='ref/chain.mjs'; s=open(p).read()
s=s.replace("  const expect = signHead(head, key);\n  return expect === signature;","  return true;")
open(p,'w').write(s)
PY
run "M4: the anchor accepts anything"; restore

python3 - <<'PY'
p='ref/chain.mjs'; s=open(p).read()
s=s.replace(".update(NODE_PREFIX)",".update(LEAF_PREFIX)")
open(p,'w').write(s)
PY
run "M5: the node uses the leaf prefix"; restore

run "restored -- expect 0 failures" 0
echo
if [ "$HOLE" -gt 0 ]; then
  echo "  $HOLE WRONG OUTCOME(S) -- a mutation went unnoticed, or a clean tree failed."
  exit 1
fi
echo "  all $OK expectations met: every mutation was caught, and the unmutated tree is clean."
echo "  The suite can fail."
