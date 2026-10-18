// The tamper-evidence demonstration.
//
// THE POINT: a self-chained hash log is NOT tamper-evident. Rewrite a
// record, re-chain it, and the chain still verifies -- because the attacker
// recomputed the chain. The house's ledger has no external anchor, so
// nothing detects it.
//
// What detects it is a SIGNED TREE HEAD: a MAC under a key the log writer
// does not hold. The rewrite changes the head; the head's signature no
// longer matches.
//
// This test is the difference between a claim and a demonstration, and it
// is the reason the house's witness machine is not tamper-evident today.

import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize } from '../ref/jcs.mjs';
import { append, verify, signHead, verifyHead, leafHash, chainHash, GENESIS, LEAF_PREFIX, NODE_PREFIX } from '../ref/chain.mjs';
import { createHash } from 'node:crypto';

const KEY = Buffer.from('a-key-the-log-writer-does-not-hold');
const log = [
  { sid: 's1', seq: 1, rel: 'BIND', refs: ['a'] },
  { sid: 's2', seq: 2, rel: 'LINK', refs: ['b'] },
  { sid: 's3', seq: 3, rel: 'EFFECT', refs: ['c'] },
];

function build(records) {
  let st = { prev: GENESIS, records: [] };
  for (const r of records) st = append(st, r);
  return st;
}

test('an untampered chain verifies and its head signs', () => {
  const st = build(log);
  assert.equal(verify(st).ok, true);
  const sig = signHead(st.head, KEY);
  assert.equal(verifyHead(st.head, sig, KEY), true);
});

test('WITHOUT AN ANCHOR, a rewritten log is INDISTINGUISHABLE from the original', () => {
  // The defect, demonstrated. The attacker edits a record and re-chains.
  const edited = log.map((r) => (r.sid === 's2' ? { ...r, rel: 'BIND' } : r));
  const st = build(edited);
  // The chain verifies perfectly. Nothing is wrong, as far as the log can
  // tell -- because the attacker recomputed it.
  assert.equal(verify(st).ok, true, 'a re-chained rewrite still verifies');
});

test('WITH A SIGNED HEAD, the same rewrite is DETECTED', () => {
  const original = build(log);
  const sig = signHead(original.head, KEY);
  const edited = build(log.map((r) => (r.sid === 's2' ? { ...r, rel: 'BIND' } : r)));
  assert.equal(verify(edited).ok, true, 'the chain itself still verifies');
  assert.equal(verifyHead(edited.head, sig, KEY), false, 'but the SIGNED HEAD does not match');
});

test('the house\'s un-anchored chain has no tamper-evidence at all', () => {
  // The house's rule: hash = fnv1a64(canon({prev, ...envelope})). There is
  // no second object to check against, so a rewrite cannot be detected.
  // Assert the STRUCTURAL fact: the house's chain state has no signature
  // and no external anchor, while the new one has a signable head.
  const st = build(log);
  assert.equal('signature' in st, false, 'a bare chain has no signature');
  assert.equal(typeof st.head, 'string', 'but it does have a head, which is what gets signed');
});

test('domain separation: the PREFIXES differ, and the implementation uses them', () => {
  // RFC 6962 2.1. A leaf hashes with a 0x00 prefix, a node with 0x01.
  //
  // The PREVIOUS version of this test compared leafHash(body) with
  // chainHash(GENESIS, leaf) and asserted they differ. That test COULD NOT
  // FAIL: the two calls have different inputs, so they differ whatever the
  // prefixes are. A mutation test caught it -- changing LEAF_PREFIX to 0x01
  // (so leaf and node would COLLIDE) broke nothing in the suite.
  //
  // The test below asserts the PREFIXES and, more importantly, asserts the
  // implementation's OUTPUT against an independently-computed hash. If the
  // prefix changes, this fails.
  assert.notEqual(LEAF_PREFIX.toString('hex'), NODE_PREFIX.toString('hex'),
    'the leaf and node prefixes must differ');
  assert.equal(LEAF_PREFIX[0], 0x00, 'RFC 6962 2.1: leaf prefix is 0x00');
  assert.equal(NODE_PREFIX[0], 0x01, 'RFC 6962 2.1: node prefix is 0x01');

  const body = { a: 1 };
  const canon = canonicalize(body);
  const expectedLeaf = '0x' + createHash('sha256')
    .update(Buffer.from([0x00])).update(canon, 'utf8').digest('hex');
  assert.equal(leafHash(body), expectedLeaf,
    'leafHash must be SHA256(0x00 || JCS(body))');

  const prev = GENESIS, leaf = expectedLeaf;
  const expectedNode = '0x' + createHash('sha256')
    .update(Buffer.from([0x01])).update(prev, 'utf8').update(leaf, 'utf8').digest('hex');
  assert.equal(chainHash(prev, leaf), expectedNode,
    'chainHash must be SHA256(0x01 || prev || leaf)');
});

test('JCS is byte-identical to the ECMAScript reference for these vectors', () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalize({ x: 1.0 }), '{"x":1}');           // 1.0 -> 1
  assert.equal(canonicalize({ z: -0 }), '{"z":0}');             // -0 -> 0
  assert.equal(canonicalize({ s: 'é' }), '{"s":"é"}');         // not  escaped
  assert.equal(canonicalize({ '\u{10000}': 1, '\uE000': 2 }), '{"\u{10000}":1,"\uE000":2}');
});
