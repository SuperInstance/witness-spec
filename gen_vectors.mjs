import { canonicalize } from './ref/jcs.mjs';
import { append, leafHash, chainHash, signHead, GENESIS } from './ref/chain.mjs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const KEY = Buffer.from('a-key-the-log-writer-does-not-hold');
const RECORDS = [
  { sid: 's1', seq: 1, ts: '2026-10-18T00:00:00Z', rel: 'BIND', refs: ['a'], meta: { n: 1, f: 1.0, neg: -0 } },
  { sid: 's2', seq: 2, ts: '2026-10-18T00:00:01Z', rel: 'LINK', refs: ['b', 'c'], text: 'quote" back\\ tab\t ctrl\u0001 slash/ é' },
  { sid: 's3', seq: 3, ts: '2026-10-18T00:00:02Z', rel: 'EFFECT', refs: [], uni: { '\u{10000}': 1, '\uE000': 2 } },
  { sid: 's4', seq: 4, ts: '2026-10-18T00:00:03Z', rel: 'PROOF', refs: ['d'], arr: [1, 'two', null, true, { k: 'v' }] },
];
let st = { prev: GENESIS, records: [] };
const chain = [];
for (const r of RECORDS) { st = append(st, r); chain.push({ record: r, leaf: leafHash(r), hash: st.head }); }
writeFileSync(new URL('./conformance/vectors.json', import.meta.url), JSON.stringify({
  at: new Date().toISOString(),
  spec: 'witness-chain/1 -- JCS (RFC 8785) canonicalisation, RFC 6962 domain separation, SHA-256 chain, HMAC-SHA256 signed head',
  genesis: GENESIS,
  key: KEY.toString('hex'),
  vectors: chain.map((c) => ({ record: c.record, canonical: canonicalize(c.record), leaf: c.leaf, hash: c.hash })),
  head: st.head,
  headSignature: signHead(st.head, KEY),
}, null, 2));
console.log('  vectors written:', chain.length, '| head', st.head.slice(0, 18));
