// THE ANTI-TRUNCATION TEST.
//
// This repo shipped a conformance suite that listed 15 of RFC 8785's 24
// Appendix B number samples -- and the three it happened to drop were
// EXACTLY the three the Python implementation failed. A green badge over
// a truncated test set: the fleet's own defect class, reproduced in the
// file whose entire job is to be the standard.
//
// So the suite now carries the RFC's COMPLETE list, and this test asserts
// it: by COUNT, by the RFC's own hex representations, and by a DIGEST of
// the list. Drop a sample and the build breaks.
//
// If the RFC ever changes, the digest changes with it, and the failure
// tells you to re-derive the list from the RFC rather than to edit the
// count.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonicalize } from '../ref/jcs.mjs';

const V = JSON.parse(readFileSync(new URL('../conformance/rfc8785-vectors.json', import.meta.url), 'utf8'));
const R = V.rfc8785;

test('the vector file carries the COMPLETE RFC 8785 Appendix B, not a selection', () => {
  assert.equal(R.numbers.length, 24, 'Appendix B has 24 numeric samples');
  assert.equal(R.appendix_b_count, 24);
  // the RFC's own hex representations, so a missing one is visible
  const hexes = R.numbers.map((n) => n.hex);
  assert.equal(new Set(hexes).size, 24, 'every sample is distinct');
  for (const h of ['444b1ae4d6e2ef50', '3eb0c6f7a0b5ed8c', '43143ff3c1cb0959', 'becbf647612f3696']) {
    assert.ok(hexes.includes(h), 'the RFC sample ' + h + ' must be present');
  }
});

test('the list has not been silently truncated (digest)', () => {
  const blob = JSON.stringify(R.numbers.map((n) => n.hex), Object.keys(R.numbers[0]).sort());
  // recompute the same way the file computed it
  const h = createHash('sha256').update(JSON.stringify(R.numbers.map((n) => n.hex))).digest('hex');
  assert.equal(h, R.numbers_digest, 'the list was changed -- re-derive it from the RFC, do not edit the digest');
});

test('every Appendix B number canonicalises exactly as the RFC says', () => {
  for (const s of R.numbers) {
    assert.equal(canonicalize(s.value), s.canonical, `RFC 8785 Appendix B: ${s.hex} (${s.comment})`);
  }
});

test('the samples that the first version DROPPED are the ones that caught the bug', () => {
  // If someone re-truncates the list, these must still be here.
  const hexes = R.numbers.map((n) => n.hex);
  // the six that broke Python's repr-based formatter
  for (const h of ['4430000000000000', '444b1ae4d6e2ef4e', '444b1ae4d6e2ef4f',
                   '3eb0c6f7a0b5ed8c', '3eb0c6f7a0b5ed8d', 'becbf647612f3696']) {
    assert.ok(hexes.includes(h), 'the sample that exposed the Python bug must be present: ' + h);
  }
});
