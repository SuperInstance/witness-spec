"""The witness chain, in Python. The twin of ref/chain.mjs.

The point of this file is that it is NOT a port of the JS by hand -- it is
a port of the SPEC, and the conformance vectors are what prove the two
agree byte-for-byte. That is the difference between "we say it is
portable" and "here are the bytes, check them".

SPEC (the chain rule):
    leaf(i) = SHA256(0x00 || JCS(record_i))
    hash(0) = GENESIS
    hash(i) = SHA256(0x01 || hash(i-1) || leaf(i))
    head    = hash(n)

Domain separation: 0x00 for a leaf, 0x01 for an interior node (RFC 6962
2.1). A signed tree head is the EXTERNAL ANCHOR that makes the log
tamper-evident; without one, a re-chained rewrite is indistinguishable from
the original.
"""
import hashlib
import hmac
import json

from jcs import canonicalize

GENESIS = "0x" + "0" * 16
LEAF_PREFIX = b"\x00"
NODE_PREFIX = b"\x01"


def leaf_hash(record) -> str:
    return "0x" + hashlib.sha256(LEAF_PREFIX + canonicalize(record).encode("utf-8")).hexdigest()


def chain_hash(prev: str, leaf: str) -> str:
    return "0x" + hashlib.sha256(NODE_PREFIX + prev.encode("utf-8") + leaf.encode("utf-8")).hexdigest()


def append(state, record):
    leaf = leaf_hash(record)
    h = chain_hash(state["prev"], leaf)
    rec = dict(record)
    rec["hash"] = h
    return {"prev": h, "records": state["records"] + [rec], "head": h}


def verify(state):
    prev = GENESIS
    for rec in state["records"]:
        body = {k: v for k, v in rec.items() if k != "hash"}
        leaf = leaf_hash(body)
        expect = chain_hash(prev, leaf)
        if expect != rec.get("hash"):
            return {"ok": False, "reason": "chain break"}
        prev = rec["hash"]
    return {"ok": True, "head": prev}


def sign_head(head: str, key: bytes) -> str:
    return "0x" + hmac.new(key, b"\x03" + head.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_head(head: str, signature: str, key: bytes) -> bool:
    return hmac.compare_digest(sign_head(head, key), signature)
