# witness-spec

**The fleet's witness log, with a standard canonicalisation, domain
separation, and the external anchor it never had.**

The house's witness machine — `recorder.py` in `AI-Writings`,
`witness/ledger.js` in `quilt-claw`, `ledger.js` and `ledger.rs` across
the fleet — is the fleet's most-repeated idiom and its most-repeated
*blind spot*. Three findings, all measured here:

## 1. The canonicalisation is a house convention, and it diverges

The chain hashes `fnv1a64(json.dumps(obj, sort_keys=True,
separators=(",", ":")))`. Every port reimplements that by hand. It is not a
standard, and it differs from **RFC 8785 (JCS)** in three measured ways:

```
house:  {"x":1.0,...}          ->  "x": 1.0        JCS:  "x": 1
house:  {"\ue000":2,"\ud800\udc00":1}   JCS:  {"\u{10000}":1,"\uE000":2}
house:  "é"                    ->  "é"    JCS:  "é"
```

**The key-order row is the dangerous one.** JCS sorts object keys by
**UTF-16 code units**; Python's `sorted()` sorts by **code point**. They
disagree for any key above U+FFFF against one below. A chain hashed in
Python and a chain hashed in JavaScript would diverge on such an object —
silently, and only on the keys nobody was looking at.

**RFC 8785 is a `MUST` in A2A v1.0 §8.4.1**, so adopting it is also the
interoperable choice.

## 2. The chain has no tamper-evidence at all

This is the finding that matters, and `test/tamper.test.mjs` demonstrates
it rather than asserting it:

> **A hash chain is self-consistent, and self-consistency is not
> tamper-evidence.** Rewrite a record, re-chain it, and the chain verifies
> perfectly.

The test builds a log, edits a record, re-chains it, and shows that
`verify()` returns `ok: true`. The rewrite is **indistinguishable from the
original**. The house's ledger has no external anchor, so it has no
tamper-evidence at all.

The fix is the standard shape (RFC 6962 / Trillian's `LogWitness`): a
periodic **signed tree head** under a key the log writer does not hold.
The same test then shows the rewrite **detected**, because the head
changed and the signature no longer matches.

**And the hash is FNV-1a-64.** That is 64 bits and not collision-resistant.
An attacker rewriting a chain does not need to collide anything — they just
recompute. SHA-256 costs nothing and is already in every runtime here.

**One domain-separation byte** (`0x00` leaf, `0x01` node, RFC 6962 §2.1)
and **one signed head** turn a log that is merely *self-consistent* into a
log that is *tamper-evident*.

## 3. The cross-language byte-identity claim is now checkable against a
standard

`conformance/vectors.json` holds four records chosen to cover exactly the
cases that diverge: a float that must become an integer, a negative zero, a
control character, a non-ASCII character, keys on **both** sides of the BMP
boundary, and a nested array.

**The JavaScript and Python reference implementations reproduce every
canonical form, every leaf hash, every chain hash, the head, and the
signature — byte for byte.** That is measured, not asserted: the Python
twin re-derives the vectors from the spec, and the vectors are what proves
the two agree. They are not transcriptions of each other.

```
$ node test/all.mjs
running 1 test file(s)
# tests 6
# pass 6
```

## The spec

`SPEC.md` — the chain rule, the three additions and why each is needed,
the migration (this **changes every hash**, so it is a format change and
ports must refuse a version they do not implement), and what is **not**
claimed.

## Licence

MIT.
