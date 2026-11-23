#!/usr/bin/env node
/*
 * Refreshes fixtures/ — byte-identical copies of published Linked.Archi documents — from the installed
 * @linked-archi/kernel package, whose assets/ are byte-identical to meta.linked.archi (SD-6).
 *
 *   npm run fixtures              copy what differs
 *   npm run fixtures -- --check   compare only; exit 1 when a copy differs or is missing
 *
 * The fixtures are committed, so the tests, CI and `npm run templates` need neither the kernel nor the network.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'node_modules', '@linked-archi', 'kernel', 'assets');

/** The documents copied, at the paths they have under the kernel's assets/ and under meta.linked.archi. */
export const FIXTURES = [
  'core/core-onto.ttl',
  'core/core-vis-onto.ttl',
  'archimate4/archimate4-onto.ttl',
  'archimate4/archimate4-tax.ttl',
  'archimate4/archimate4-viewpoints.ttl',
  'archimate4/archimate4-notation.ttl',
  'archimate4/archimate4-metamodel.ttl',
  'archimate4/archimate4-relationship-shapes.ttl',
  'archimate4/archimate4-relationship-tables.ttl',
];

function main() {
  const check = process.argv.includes('--check');
  if (!existsSync(ASSETS)) {
    console.error('@linked-archi/kernel is not installed: run npm install.');
    return 2;
  }
  let differing = 0;
  for (const rel of FIXTURES) {
    const source = readFileSync(join(ASSETS, rel));
    const target = join(ROOT, 'fixtures', rel);
    if (existsSync(target) && Buffer.compare(readFileSync(target), source) === 0) continue;
    differing++;
    if (check) {
      console.log(`differs: fixtures/${rel}`);
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, source);
      console.log(`copied: fixtures/${rel}`);
    }
  }
  if (check) {
    console.log(differing ? `${differing} fixture(s) differ from the kernel's assets: run npm run fixtures.` : "The fixtures match the kernel's assets.");
    return differing ? 1 : 0;
  }
  if (!differing) console.log("The fixtures already match the kernel's assets.");
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main();
