# The conformance suite, and proof that it can fail

**A suite that cannot fail is indistinguishable from one that can.** So this
directory carries the proof, not just the tests.

## The vectors are the RFC's, not ours

`conformance/rfc8785-vectors.json` holds the test data **published in
RFC 8785 itself**:

- **§3.2.3** — the sort-order test data (the `€` / `\r` / `וּ` / `1` /
  `😀` / `\u0080` / `ö` object and its expected property order)
- **§3.2.2** — the primitive-serialization example (the numbers array and
  the escaped string)
- **Appendix B** — the number serialization samples, **all 24**

**A conformance suite that only tests itself against its own author is not
a conformance suite.** These vectors come from the specification.

## Three implementations, one rule

| implementation | where | RFC 8785 sort | Appendix B (15) | §3.2.2 string |
|---|---|---|---|---|
| `ref/jcs.mjs` | this repo | MATCH | ALL MATCH | MATCH |
| `ref/jcs.py` | this repo | MATCH | **ALL 24 MATCH** (after the fix below) | MATCH |
| `AI-Writings/labs/situation-recorder/recorder.py` | the fleet's reference witness | MATCH | **FAILED 10 of 24** — see below | MATCH |
| `SuperInstance/quilt-claw/witness/ledger.js` | the JS twin | *(not yet ported)* | | |

## The mutation harness, and the hole it found

`tools/mutate.sh` breaks the implementation in specific ways and asserts the
suite notices.

**IT WORKS ON A COPY. Always.** The first version mutated the working tree
in place, and a killed run left the tree MUTATED -- and a later commit
pushed the broken implementation. **A verification harness that can break
the thing it verifies is itself a defect.** It now copies `ref/`, `test/`
and `conformance/` into a temp directory, mutates the copy, and throws the
copy away.

| mutation | before the fix | after |
|---|---|---|
| baseline | 0 fail | 0 fail |
| **M1** sort by code point instead of UTF-16 | 3 fail | 3 fail |
| **M2** wrong integer serialisation | 1 fail | 1 fail |
| **M3** leaf and node prefixes collide | **0 fail — A HOLE** | **1 fail** |
| **M4** the anchor accepts anything | 1 fail | 1 fail |
| **M5** the node uses the leaf prefix | 0 fail | 1 fail |

**M3 found a real hole in this repo's own tests, and it was a security
property.** The original domain-separation test was:

```js
const leaf = leafHash(body);
const node = chainHash(GENESIS, leaf);
assert.notEqual(leaf, node);
```

**That test could not fail.** The two calls take different inputs, so they
differ whatever the prefixes are. Change `LEAF_PREFIX` to `0x01` — so that a
leaf and a node would COLLIDE — and the suite still passed 11/11.

The test now asserts the **prefixes** and, more importantly, asserts the
implementation's **output** against an independently computed hash:

```js
assert.equal(leafHash(body), '0x' + createHash('sha256')
  .update(Buffer.from([0x00])).update(canonicalize(body), 'utf8').digest('hex'));
assert.equal(chainHash(prev, leaf), '0x' + createHash('sha256')
  .update(Buffer.from([0x01])).update(prev, 'utf8').update(leaf, 'utf8').digest('hex'));
```

**Which is the whole point: a test that states the expected value from the
SPEC is falsifiable. A test that compares two calls to the same
implementation is not.**

## The other lesson: the RFC's §3.2.2 example is not a JCS expected-output

RFC 8785 §3.2.2 shows ECMAScript's `JSON.stringify()` output for a parsed
object — to illustrate how far a round-trip can drift from the input. **That
output is NOT JCS's output**, because JCS **sorts** the keys and the example
does not. A conformance suite that treats it as an expected canonical form
will fail for the right reason and the wrong one at the same time.

Two earlier "divergences" found during this verification were **the test
harness, not the implementation** — and both are recorded here, because the
point of a verification pass is not only to find defects but to record which
of its own findings were real.

## Running it

```bash
node --test "test/*.test.mjs"     # 15 tests
tools/mutate.sh                   # every mutation must be caught
```


---

## The hole this repo had in itself

**The first version of this repo listed 15 of RFC 8785's 24 Appendix B
number samples. The three it happened to drop were EXACTLY the three the
Python implementation failed.**

That is the fleet's own defect class reproduced in the file whose entire job
is to be the standard: *a green badge over a truncated test set.* The
generator (`gen_vectors.mjs`) intended to include `1.0` and `-0`, but
`JSON.stringify` writes them as `1` and `0` — **the generator erased, by
construction, the inputs that would have caught the divergence it existed
to catch.**

**The Python implementation was genuinely wrong, and here is the whole of
it:** it formatted numbers with Python's `repr()`. That is not ECMAScript's
`Number::toString`. Six samples failed:

| sample | the bug |
|---|---|
| `295147905179352830000` | the shortest round-trip digits of a large integer are **not** the exact integer value (the double is exactly 295147905179352825856) |
| `999999999999999700000` | same |
| `999999999999999900000` | same |
| `9.999999999999997e-7` | an exponent has **no leading zero** |
| `1e-6` | the plain-decimal band is `-6 < n <= 21`, so it prints `0.000001` |
| `-0.0000033333333333333333` | same band rule |

`ref/jcs.py` now implements ECMA-262 6.1.6.1.20 (Number::toString) properly,
and `test/completeness.test.mjs` asserts the vector list **by count, by the
RFC's own hex representations, and by a digest** — so a future truncation
breaks the build instead of hiding behind it.

**The lesson is the one this whole fleet keeps learning: a suite that only
tests what it already passes is decoration.**
