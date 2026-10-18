// RFC 8785 JSON Canonicalization Scheme -- the reference implementation.
//
// WHY THIS EXISTS. The fleet's witness chain canonicalises with
// json.dumps(obj, sort_keys=True, separators=(",", ":")). That is a HOUSE
// CONVENTION, not a standard, and every port reimplements it by hand. The
// cutting-edge survey found that RFC 8785 is a MUST in A2A v1.0 8.4.1, and
// that an FNV-1a-64 chain with no domain separation and no signature has NO
// tamper-evidence at all.
//
// JCS differs from the house convention in ways that matter:
//   * KEYS SORT BY UTF-16 CODE UNITS, not by code point. Python's sorted()
//     sorts by code point, so for a key above U+FFFF the two DISAGREE.
//     That is not academic: it is a silent cross-language byte divergence.
//   * NUMBERS use the ECMAScript Number::toString algorithm (shortest
//     round-trip), not Python's repr. 1.0 serialises as "1" in JCS and
//     "1.0" in Python.
//   * STRINGS escape exactly RFC 8259 requires and nothing more.
//
// The whole point of a canonical form is that two implementations produce
// the same bytes. A hand-rolled convention cannot promise that across
// languages it was never specified for.

export function canonicalize(value) {
  return serialize(value);
}

function serialize(v) {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(v)) throw new TypeError('JCS: non-finite number');
    if (v === 0) return '0';                    // -0 canonicalises to 0
    return numberToString(v);
  }
  if (t === 'string') return serializeString(v);
  if (Array.isArray(v)) return '[' + v.map((x) => serialize(x === undefined ? null : x)).join(',') + ']';
  if (t === 'object') {
    // JCS sorts by UTF-16 CODE UNITS. JS's default string comparison is
    // already code-unit order, so Array.prototype.sort() is correct here.
    const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
    return '{' + keys.map((k) => serializeString(k) + ':' + serialize(v[k])).join(',') + '}';
  }
  throw new TypeError('JCS: unsupported type ' + t);
}

// ECMAScript Number::toString. JS already does this, but going through
// String() makes the intent explicit and keeps the number path identical
// in every port.
function numberToString(v) { return String(v); }

const ESCAPES = { '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r', '"': '\\"', '\\': '\\\\' };

function serializeString(s) {
  let out = '"';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (ESCAPES[ch]) out += ESCAPES[ch];
    else if (code < 0x20) out += '\\u' + code.toString(16).padStart(4, '0');
    else out += ch;                            // everything else is literal
  }
  return out + '"';
}
