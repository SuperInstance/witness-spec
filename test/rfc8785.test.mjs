// The RFC 8785 vectors, PUBLISHED BY THE RFC.
//
// A conformance suite that only tests itself against its own author is not
// a conformance suite. These vectors come from the specification itself:
// section 3.2.2 (primitive serialization), section 3.2.3 (the sort-order
// test data) and Appendix B (the number serialization samples).
//
// Every implementation that claims to be JCS must agree with the RFC on
// these, and the two we wrote (JavaScript and Python) are checked against
// them by CI.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalize } from '../ref/jcs.mjs';

const V = JSON.parse(readFileSync(new URL('../conformance/rfc8785-vectors.json', import.meta.url), 'utf8'));

test('RFC 8785 3.2.3 -- the sort-order test data', () => {
  const got = Object.keys(V.rfc8785.sort_test_data).sort().map((k) => V.rfc8785.sort_test_data[k]);
  assert.deepEqual(got, V.rfc8785.sort_expected_order);
});

test('RFC 8785 3.2.3 -- and the CANONICAL output is exactly this string', () => {
  // Build the expected canonical form by hand from the RFC's expected order.
  // Comparing the WHOLE STRING is unambiguous -- no regex, no JSON.parse
  // (which hoists integer-like keys such as "1" to the front, and would
  // hide the very ordering under test).
  const exp = V.rfc8785.sort_expected_order;
  const byValue = {};
  for (const [k, v] of Object.entries(V.rfc8785.sort_test_data)) byValue[v] = k;
  const expected = '{' + exp.map((v) => JSON.stringify(byValue[v]) + ':' + JSON.stringify(v)).join(',') + '}';
  assert.equal(canonicalize(V.rfc8785.sort_test_data), expected);
});

test('RFC 8785 Appendix B -- the number serialization samples', () => {
  for (const { value, canonical } of V.rfc8785.numbers) {
    assert.equal(canonicalize(value), canonical, `number ${value}`);
  }
});

test('RFC 8785 3.2.2 -- string escaping matches JSON.stringify', () => {
  // JCS differs from JSON.stringify in KEY ORDER and NUMBER FORMATTING.
  // It does NOT differ in string escaping -- and notably it does not escape
  // the forward slash, which JSON.stringify also leaves alone.
  const s = V.rfc8785.string_test.input;
  assert.equal(canonicalize({ s }), JSON.stringify({ s }));
});

test('the UTF-16 vs code-point distinction is real, and we are on the right side', () => {
  // U+10000 encodes as the surrogate pair D800 DC00; U+E000 is a single
  // unit E000. UTF-16 order puts U+10000 FIRST. Code-point order puts
  // U+E000 first. JCS says UTF-16.
  const o = { '\u{10000}': 'A', '\uE000': 'B' };
  const keys = [...canonicalize(o).matchAll(/"((?:[^"\\\\]|\\\\.)*)":/g)].map((m) => JSON.parse('"' + m[1] + '"'));
  assert.deepEqual(keys, ['\u{10000}', '\uE000'], 'UTF-16 order puts the astral key first');

  // And the test is NOT vacuous: a CODE-POINT sort gives the opposite answer.
  // (Note: JavaScript's own Array.prototype.sort compares by UTF-16 code
  // unit, which is exactly JCS's rule -- so the naive `Object.keys().sort()`
  // is right BY CONSTRUCTION in JS and would not catch a wrong comparator.
  // This explicit comparator is what makes the distinction testable.)
  const byCodePoint = (a, b) => {
    const A = [...a].map((c) => c.codePointAt(0)), B = [...b].map((c) => c.codePointAt(0));
    for (let i = 0; i < Math.min(A.length, B.length); i++) if (A[i] !== B[i]) return A[i] - B[i];
    return A.length - B.length;
  };
  assert.deepEqual(Object.keys(o).sort(byCodePoint), ['\uE000', '\u{10000}'],
    'code-point order is the OPPOSITE -- so the assertion above can fail');
});
