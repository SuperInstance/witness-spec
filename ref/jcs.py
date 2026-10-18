"""RFC 8785 JSON Canonicalization Scheme -- the Python reference.

WHAT THIS FILE HAD WRONG, AND WHY IT MATTERED.

The first version formatted numbers with Python's `repr()`, patched for the
exponent. That is NOT ECMAScript's Number::toString, and it failed 6 of the
**complete** 24 samples in RFC 8785 Appendix B -- including three that had
been dropped from this repo's own vectors file.

A conformance suite that omits the cases it fails is not a conformance
suite. This is the fleet's own defect class, reproduced in the file whose
whole job is to be the standard.

THE ALGORITHM (ECMA-262 6.1.6.1.20, Number::toString).

Let s, k and n be integers such that

    k >= 1,  10^(k-1) <= s < 10^k,  s * 10^(n-k) = m

and k is AS SMALL AS POSSIBLE (the shortest round-trip digits); where there
are several candidates with that k, s is the one closest to m (ties to the
larger). Then:

    k <= n <= 21    -> the digits of s, then n-k zeros
    0 <  n <= 21    -> the digits of s with a decimal point after n digits
    -6 <  n <= 0    -> "0." + (-n zeros) + the digits of s
    otherwise       -> scientific: s[0] ("." + s[1:] if k > 1)
                      + "e" + sign + the digits of |n-1|

The three things Python's repr gets wrong, each visible in Appendix B:

  * the SHORTEST round-trip digits of a large integer are NOT the exact
    integer value. 295147905179352830000 is a double whose exact value is
    295147905179352825856; ECMAScript prints the former, repr the latter.
  * the plain-decimal band is -6 < n <= 21, so 1e-6 prints as
    "0.000001", not "1e-06".
  * an exponent has NO leading zero: "9.999999999999997e-7", not "e-07".

The shortest round-trip digits themselves are taken from Python's `repr`,
which is also shortest-and-closest -- the two agree on the digits, and
differ only in how those digits are LAID OUT.
"""
import math


def _utf16_key(s: str) -> bytes:
    """Sort key: the key's UTF-16 code units, as bytes.

    JCS sorts object keys by UTF-16 CODE UNITS. Python's sorted() sorts by
    CODE POINT. They disagree for any key above U+FFFF against one below:

        "\\U00010000"  code point 0x10000, UTF-16 lead unit 0xD800
        "\\ue000"      code point 0xE000,  UTF-16 unit      0xE000

    Python's sorted() puts \\ue000 first (0xE000 < 0x10000). UTF-16 puts
    \\U00010000 first (0xD800 < 0xE000). So a chain hashed in Python and a
    chain hashed in JavaScript would diverge on any object carrying both
    kinds of key -- silently, and only on the keys that matter least.
    """
    return s.encode("utf-16-be", "surrogatepass")


_JCS_ESCAPES = {
    "\b": "\\b", "\t": "\\t", "\n": "\\n", "\f": "\\f", "\r": "\\r",
    '"': '\\"', "\\": "\\\\",
}


def _jcs_string(s: str) -> str:
    out = ['"']
    for ch in s:
        if ch in _JCS_ESCAPES:
            out.append(_JCS_ESCAPES[ch])
        elif ord(ch) < 0x20:
            out.append("\\u%04x" % ord(ch))
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def _shortest_digits(v: float):
    """The shortest round-trip digits of a positive finite double.

    Returns (s, k, n) with value == s * 10**(n-k), 10**(k-1) <= s < 10**k,
    and k as small as possible.
    """
    r = repr(v)                       # shortest round-trip, Python's layout
    if "e" in r or "E" in r:
        mant, _, exp = r.replace("E", "e").partition("e")
        exp = int(exp)
    else:
        mant, exp = r, 0
    if "." in mant:
        ip, fp = mant.split(".")
    else:
        ip, fp = mant, ""
    digits = ip + fp
    n = len(ip) + exp                  # the decimal point sits after n digits
    stripped = digits.lstrip("0")
    n -= (len(digits) - len(stripped))
    digits = stripped.rstrip("0")
    if not digits:
        return ("0", 1, 1)
    # trailing zeros were removed; n is unchanged (the value is unchanged
    # because s * 10**(n-k) is invariant when k shrinks by the same count)
    return (digits, len(digits), n)


def _jcs_number(v: float) -> str:
    """ECMAScript Number::toString, exactly as RFC 8785 Appendix B wants."""
    if v != v or v in (float("inf"), float("-inf")):
        raise ValueError("JCS: non-finite number")
    if v == 0:
        return "0"                      # -0 canonicalises to 0
    sign = "-" if v < 0 else ""
    s, k, n = _shortest_digits(abs(v))
    if k <= n <= 21:
        return sign + s + ("0" * (n - k))
    if 0 < n <= 21:
        return sign + s[:n] + "." + s[n:]
    if -6 < n <= 0:
        return sign + "0." + ("0" * (-n)) + s
    e = n - 1
    esign = "+" if e >= 0 else "-"
    head = s[0] if k == 1 else s[0] + "." + s[1:]
    return sign + head + "e" + esign + str(abs(e))


def _jcs(v) -> str:
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, str):
        return _jcs_string(v)
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return _jcs_number(v)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(_jcs(x) for x in v) + "]"
    if isinstance(v, dict):
        keys = sorted(v.keys(), key=_utf16_key)
        return "{" + ",".join(_jcs_string(k) + ":" + _jcs(v[k]) for k in keys) + "}"
    raise TypeError("JCS: unsupported type " + type(v).__name__)


def canonicalize(value) -> str:
    return _jcs(value)
