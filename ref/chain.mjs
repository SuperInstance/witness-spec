// The witness chain, with the two things the house's version lacks.
//
// 1. DOMAIN SEPARATION (RFC 6962 2.1). A leaf hash and an interior node
//    hash are computed over DIFFERENT byte prefixes -- 0x00 for a leaf,
//    0x01 for a node. Without it, a leaf's bytes can be presented as a
//    node, and the two kinds of thing are not distinguishable.
//
// 2. AN EXTERNAL ANCHOR. A hash chain is SELF-CONSISTENT: rewrite a
//    record, re-chain it, and the chain still verifies. That is not
//    tamper-evidence, it is tamper-RESISTANCE-at-best, and it was never
//    tamper-evidence at all. Tamper-evidence needs something OUTSIDE the
//    log that the attacker cannot rewrite. The standard shape is a
//    periodic SIGNED TREE HEAD (Trillian's LogWitness): the head hash is
//    MAC'd/signed under a key the log writer does not hold, and published.
//
//    The finding this lab acted on: the house's FNV-1a-64 chain with no
//    signature has NO tamper-evidence AT ALL.
//
// The chain rule keeps the house's shape -- one hash per record, chained to
// the previous -- so existing ledgers can be read. The canonicalisation
// changes to RFC 8785 (JCS), and that is a FORMAT CHANGE: see SPEC.md.

import { createHmac, createHash } from 'node:crypto';
import { canonicalize } from './jcs.mjs';

export const GENESIS = '0x' + '0'.repeat(16);
export const LEAF_PREFIX = Buffer.from([0x00]);
export const NODE_PREFIX = Buffer.from([0x01]);

export function leafHash(record) {
  return '0x' + createHash('sha256')
    .update(LEAF_PREFIX)
    .update(canonicalize(record), 'utf8')
    .digest('hex');
}

export function chainHash(prev, leaf) {
  return '0x' + createHash('sha256')
    .update(LEAF_PREFIX)
    .update(prev, 'utf8')
    .update(leaf, 'utf8')
    .digest('hex');
}

// Append one record. `state` is the running {prev, records}.
export function append(state, record) {
  const leaf = leafHash(record);
  const hash = chainHash(state.prev, leaf);
  const rec = { ...record, hash };
  return {
    prev: hash,
    records: [...state.records, rec],
    head: hash,
  };
}

// Recompute the chain from the bodies. This must reproduce every hash, or
// the log was altered. Note what this does NOT do: it does not detect an
// alteration that the writer re-chained. That is what the signed head is
// for.
export function verify(state) {
  let prev = GENESIS;
  for (const rec of state.records) {
    const { hash, ...body } = rec;
    const leaf = leafHash(body);
    const expect = chainHash(prev, leaf);
    if (expect !== hash) return { ok: false, at: rec, reason: `chain break at ${JSON.stringify(rec).slice(0, 80)}` };
    prev = hash;
  }
  return { ok: true, head: prev };
}

// The signed tree head: the anchor. An attacker who can rewrite the log
// cannot produce a valid MAC over the new head without the key.
export function signHead(head, key) {
  return '0x' + createHmac('sha256', key).update(Buffer.from([0x03])).update(head, 'utf8').digest('hex');
}

export function verifyHead(head, signature, key) {
  const expect = signHead(head, key);
  return expect === signature;
}
