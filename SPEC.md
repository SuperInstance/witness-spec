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
- **HMAC is a stand-in.** HMAC-SHA256 is symmetric — both parties hold the
  key, so it proves *someone with the key* wrote it, not *who*. Ed25519
  (as in Certificate Transparency, and as Trillian uses) attributes the
  head to a named signer. **Do not ship HMAC as if it were a signature.**
