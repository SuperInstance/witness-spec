#!/usr/bin/env node
// Enumerate the test directory and pass explicit paths. `node --test
// "test/*.test.mjs"` works on node 21+ and FAILS on node 20, where node
// treats the quoted glob as a literal path.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(HERE).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => join(HERE, f));
if (!files.length) { console.error('no test files'); process.exit(1); }
console.log(`running ${files.length} test file(s)`);
process.exit(spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' }).status ?? 1);
