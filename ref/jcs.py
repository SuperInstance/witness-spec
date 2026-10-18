"""RFC 8785 JSON Canonicalization Scheme -- the Python reference.

The only line that is genuinely hard is the KEY SORT, and it is where the
house's convention would have bitten us:

    JCS sorts object keys by UTF-16 CODE UNITS. Python's sorted() sorts by
    CODE POINT. They disagree for any key above U+FFFF.

    "\U00010000"  ->  code point 0x10000
    "\ue000"      ->  code point 0xE000
    Python sorted():  "\ue000" first   (0xE000 < 0x10000)
    UTF-16 units:     "\U00010000" first (0xD800 < 0xE000)

So a chain hashed in Python and a chain hashed in JavaScript would DISAGREE
on any object with both kinds of key -- silently, and only on the keys that
matter least. That is precisely the class of bug a canonical form exists to
prevent.
"""
import json
import math
import struct


def _utf16_key(s: str) -> bytes:
    """Sort key: the key's UTF-16 code units, as bytes."""
    return s.encode("utf-16-be", "surrogatepass")


def canonicalize(value) -> str:
    return _serialize(value)


def _serialize(v) -> str:
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, str):
        return _serialize_string(v)
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return _number(v)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(_serialize(x) for x in v) + "]"
    if isinstance(v, dict):
        keys = [k for k in v if v[k] is not None or True]
        keys = sorted(keys, key=_utf16_key)
        return "{" + ",".join(_serialize_string(k) + ":" + _serialize(v[k]) for k in keys) + "}"
    raise TypeError("JCS: unsupported type " + type(v).__name__)


_ESCAPES = {
    "\b": "\\b", "\t": "\\t", "\n": "\\n", "\f": "\\f", "\r": "\\r",
    '"': '\\"', "\\": "\\\\",
}


def _serialize_string(s: str) -> str:
    out = ['"']
    for ch in s:
        if ch in _ESCAPES:
            out.append(_ESCAPES[ch])
        elif ord(ch) < 0x20:
            out.append("\\u%04x" % ord(ch))
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def _number(v: float) -> str:
    """ECMAScript Number::toString for the subset JSON can hold."""
    if not math.isfinite(v):
        raise ValueError("JCS: non-finite number")
    if v == 0:
        return "0"
    if v == int(v) and abs(v) < 1e21:
        return str(int(v))
    r = repr(v)
    # Python prints 1e+21 where JS prints 1e+21 too, but 1e-7 -> 1e-07.
    if "e" in r:
        m, e = r.split("e")
        sign = "+" if not e.startswith("-") else "-"
        exp = e.lstrip("+-")
        if len(exp) < 2:
            exp = "0" + exp
        r = m + "e" + sign + exp
    return r
