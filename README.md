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

## 2. The chain is ATTESTABLE, not tamper-evident

This is the finding that matters, and `test/tamper.test.mjs` demonstrates
it rather than asserting it:

> **A hash chain is self-consistent, and self-consistency is not
> tamper-evidence.** Rewrite a record, re-chain it, and the chain verifies
> perfectly.

The test builds a log, edits a record, re-chains it, and shows that
`verify()` returns `ok: true`. The rewrite is **indistinguishable from the
original**. The house's ledger has no external anchor, so it has no
tamper-evidence at all.

**Truncation is the same defect, and it is cheaper to exploit.** Delete the
last 50 records of a 121-record `witness-chain/1` log and the remaining 71
replay cleanly — `verify()` returns ok, and the head just moves. *A
truncated chain is a shorter valid chain.* No re-hash, no fixpoint
iteration, no competence required.

The fix is the standard shape (RFC 6962 / Trillian's `LogWitness`): a
periodic **signed tree head** under a key the log writer does not hold.
The same test then shows the rewrite **detected**, because the head
changed and the signature no longer matches.

**And the hash is FNV-1a-64.** That is 64 bits and not collision-resistant.
An attacker rewriting a chain does not need to collide anything — they just
recompute. SHA-256 costs nothing and is already in every runtime here.

**One domain-separation byte** (`0x00` leaf, `0x01` node, RFC 6962 §2.1) and
**one signed head, published out of band**, turn a log that is merely
*self-consistent* into a log that is *tamper-evident*.

Publication is not a detail of the anchor design; it **is** the anchor. A
signature over a head stored inside the log it anchors is a signature the
writer can refresh for free after every rewrite and every truncation.

## 2a. The three legs, and a verdict that says which it has

A log earns the word *tamper-evident* only when all three hold:

| # | leg | who in the fleet has it |
|---|---|---|
| 1 | **chain re-derives** — replay reproduces every linkage | every chained log |
| 2 | **head signed** by a key we trust | `doubt-ledger` (`sign_root`, optional), `moth-ledger` (`Ed25519Signer`, opt-in, not on the write path) |
| 3 | **head published out of band** — where the log writer does not control it | **nobody. zero repos.** |

Leg 1 alone is **attestable**. Legs 1+2 are **attested**. Only 1+2+3 is
**tamper-evident**. As of this commit the fleet is at leg 1 everywhere, so
the correct word is *attestable* — narrower, and true.

### Linkage class — `chain` vs `row-checksum` vs `none`

A chain and a row-checksum log are **different objects**, and the fleet has
been calling both of them "witness". `SPEC.md` makes this normative: every
verdict emits a linkage class, and the class decides the words it may use.

| linkage class | catches | cannot catch |
|---|---|---|
| `chain` | edit, reorder, drop-in-the-middle | tail truncation; a re-chained rewrite |
| `row-checksum` | bit-rot, partial corruption | deletion, truncation, reordering |
| `none` | — | — (refused with a reason, never silently skipped) |

This is load-bearing, measured: **`bots/*/witness.log` are row-checksum
logs wearing a chain's name.** Ten of them, **0 carrying a `prev` field**.
Delete 50 rows from `rsi-gan`'s 262 and the surviving 212 still self-verify.
A verdict on one of those may say *"row checksums match"* and must name the
class — **it may not say "intact"**, because a set of independent row
checksums has no linkage to be intact with respect to. A `chain` verdict may
say **"chain-intact"**, meaning precisely: the chain verified.

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
