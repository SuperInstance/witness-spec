# witness-chain/1

**The fleet's witness chain, with a standard canonicalisation, domain
separation, and an external anchor.**

Status: draft. The current chain (`FNV-1a-64` over
`json.dumps(obj, sort_keys=True, separators=(",", ":"))`) is what ships
today. This is the replacement, and it is a **format change** — see
*Migration* at the bottom.

## The chain rule

```
canonical(i) = JCS(record_i)                        RFC 8785
leaf(i)      = SHA256(0x00 || canonical(i))          RFC 6962 2.1 domain separation
hash(0)      = GENESIS = 0x0000000000000000
hash(i)      = SHA256(0x01 || hash(i-1) || leaf(i))  RFC 6962 2.1
head         = hash(n)
signature    = HMAC-SHA256(0x03 || head)            under a key the log writer does not hold
```

## Linkage class — a verdict MUST name which kind of log it is looking at

**A chain and a row-checksum log are different objects, and the fleet has
been calling both "witness".** A verdict that does not say which one it is
looking at cannot be read. This section is normative: every verifier emits a
linkage class, and the class determines which words the verdict may use.

| linkage class | test | what it catches | what it CANNOT catch |
|---|---|---|---|
| `chain` | dense `seq` from 0 **and** replay reproduces every linkage | edit, reorder, drop-in-the-middle | truncation of the **tail**; a re-chained rewrite |
| `row-checksum` | each row carries a hash of **its own payload only** | bit-rot, partial corruption | deletion, truncation, reordering — the rows do not commit to each other |
| `none` | neither of the above | — | — |

**Required output.** A verifier emits `linkage: 'chain' | 'row-checksum' | 'none'`
alongside its verdict, and `linkage: 'none'` is a **reported category, not a
silent skip** — a log with no linkage is refused with a reason, never passed over.

**Why the distinction is load-bearing, measured.** The fleet's `bots/*/witness.log`
files are named `witness`, carry a field called `hash`, and are described as
witnessing. **0 of them carry a `prev` field.** The hash is a checksum of the
row's own payload. Deleting 50 rows from `rsi-gan`'s 262 leaves 212 rows that
still self-verify; the deletion is invisible. A row-checksum log is not a chain,
and calling it one borrows the credibility of the idiom without the property.

## Tamper-evidence — the three legs, and which ones you have

The fleet says "tamper-evident" about logs that have one leg out of three.
The honest claim is narrower and more precise; **narrowing a claim is the fix.**

| # | leg | what it means |
|---|---|---|
| 1 | **chain re-derives** | replay reproduces every linkage; a rewrite is *expensive* |
| 2 | **head signed** | the head is signed by a key we trust |
| 3 | **head published out of band** | the signed head lives somewhere the log writer does not control |

| legs held | the correct word |
|---|---|
| 1 only | **attestable** — "the chain re-derives" |
| 1+2 | **attested** — "the chain re-derives and the head is signed" |
| 1+2+3 | **tamper-evident** — and only then is the word earned |
| 1, but no linkage | **row checksums match** — never "intact" |

**A verifier MUST NOT use the word "tamper-evident" for a log whose head is not
both signed and published out of band. A truncated chain is a shorter valid
chain.** Tail-truncating a 121-record `witness-chain/1` log by 50 records still
verifies, and the head simply changes to a value nobody holds a signature for.
Leg 3 is the whole of the difference, and leg 3 is the leg nobody has built.

**"intact" is not producible for a row-checksum log.** For a `chain`, the verdict
may say **`chain-intact`** — the chain verified. For a `row-checksum` log it must
say **`row checksums match`** and name the class, because a checksum set has no
linkage to be intact *with respect to*.

## The three things this adds, and why each is needed

### 1. RFC 8785 (JCS) instead of a house convention

The current chain canonicalises with
`json.dumps(obj, sort_keys=True, separators=(",", ":"))`. That is a **house
convention**, reimplemented by hand in every port. It is not a standard,
and it diverges from RFC 8785 in three measured ways:

| input | house convention | RFC 8785 (JCS) | why it matters |
|---|---|---|---|
| `1.0` | `1.0` | `1` | Python's `repr` vs ECMAScript `Number::toString` |
| keys `\u{10000}` and `\uE000` | `\uE000` first | `\u{10000}` first | **JCS sorts by UTF-16 CODE UNITS; Python's `sorted()` sorts by CODE POINT** |
| `é` | `é` | `é` | Python's `ensure_ascii=True` escapes it |

**The key-order case is the dangerous one.** A chain hashed in Python and a
chain hashed in JavaScript disagree on any object carrying both kinds of
key — silently, and only on the keys nobody was looking at. That is
precisely the class of bug a canonical form exists to prevent, and it is
the class the house's own cross-language byte-identity claim is exposed to.

**RFC 8785 is already a `MUST` in A2A v1.0 §8.4.1.** Adopting it means the
fleet's witness log interoperates with a protocol it wants to speak.

### 2. Domain separation

A leaf and an interior node hash **different bytes** (`0x00` vs `0x01`
prefix). Without it, the bytes of a leaf can be presented as a node, and
the two kinds of thing are not distinguishable. This is RFC 6962 §2.1 and
it is one byte per hash.

### 3. A signed tree head — the external anchor

**A hash chain is self-consistent, and self-consistency is not
tamper-evidence.** Rewrite a record, re-chain it, and the chain verifies
perfectly. The `test/tamper.test.mjs` file demonstrates exactly this, and
the demonstration is the point:

> **WITHOUT an anchor, a rewritten log is indistinguishable from the
> original.** The current ledger has no anchor, so it has no
> tamper-evidence at all — the fleet's most-repeated idiom is its least
> protected one.

**Truncation is the same defect wearing a different hat, and it is worse,
because it needs no competence at all.** An attacker who deletes the last 50
records of a 121-record `witness-chain/1` log leaves 71 records that replay
cleanly; `verify()` returns ok and the head simply moves. *A truncated chain
is a shorter valid chain.* No rewrite, no re-hash, no fixpoint iteration —
just deletion. This is why leg 3 (publication) is not a refinement of the
anchor design but the whole of it: a signature over a head that lives inside
the log it anchors is a signature the writer can refresh for free.

The fix is the standard shape (Trillian's `LogWitness`): a periodic
**signed tree head**, signed under a key the log writer does not hold. The
rewrite changes the head; the head's signature no longer matches.

**The key must not be the log writer's key.** If the writer can sign, the
writer can re-sign, and there is no anchor. The house's witness machine
(`recorder.py`, `witness/ledger.js`, `ledger.rs`, `ledger.js`) needs a key
held by a different party, or at minimum a head published somewhere the
writer does not control.

**The hash is SHA-256, not FNV-1a-64.** FNV is not a cryptographic hash: it
is 64 bits, not collision-resistant, and an attacker rewriting a chain
does not need to collide anything — they just recompute. The chain rule's
*shape* is unchanged, so the port work is mechanical.

## Conformance

`conformance/vectors.json` holds four records chosen to cover the cases
that actually diverge: a float that must become an integer, a negative
zero, a control character, a non-ASCII character, keys on both sides of
the BMP boundary, and a nested array.

**A port conforms when it reproduces every `canonical`, every `leaf`, every
`hash`, the `head`, and verifies the `headSignature`.** The reference
implementations in `ref/` are the JavaScript and Python twins, and the
vectors are what proves they agree — not that they were transcribed from
each other.

```
node test/all.mjs        # 6 tests, including the tamper demonstration
python3 ref/chain.py     # the twin
```

## Migration

**This changes the bytes of every hash.** A log written under
`witness-chain/0` (FNV-1a-64, house canonicalisation) does NOT verify under
`witness-chain/1`, and must not be silently reinterpreted.

1. Write the new chain beside the old one. Do not rewrite history.
2. Record the transition in the ledger: a `CHAIN_VERSION` record naming
   both heads.
3. Ports read the version field and refuse a log whose version they do not
   implement — **a port that cannot answer must be a failure, never a
   value** (the same rule the fold suites already follow).

## What is NOT claimed

- **This is not a fix for the empty-ledger defect.** A chain that is
  written correctly and then not committed is still not evidence. The
  `gitpp-oracle` fix (assert the ledger grew) is a separate matter and
  already shipped.
- **A signed head detects a rewrite; it does not prevent one.** It bounds
  the damage to "the rewrite is visible", and only if the head is
  published somewhere the writer does not control.
- **Nobody in the fleet has built the publication leg.** There is no
  `witness-heads/` in any repo, and no committed `.sig`/`.pub` artifact
  beside any log. `doubt-ledger` ships `sign_root()` (Ed25519, real, and
  correctly refuses rather than degrading when `cryptography` is absent)
  and `moth-ledger` ships an `Ed25519Signer`, but neither writes a signed
  head to a place the log writer cannot reach. Until that exists, the
  correct word for every fleet log is **attestable**, and the anchor is a
  design on paper rather than a property in force.
- **HMAC is a stand-in.** HMAC-SHA256 is symmetric — both parties hold the
  key, so it proves *someone with the key* wrote it, not *who*. Ed25519
  (as in Certificate Transparency, and as Trillian uses) attributes the
  head to a named signer. **Do not ship HMAC as if it were a signature.**
