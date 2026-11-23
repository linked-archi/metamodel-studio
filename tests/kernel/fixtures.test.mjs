// The committed fixtures are the kernel's copies of the published documents, byte for byte (SD-6). When the kernel
// refreshes its assets, this fails until `npm run fixtures` and `npm run templates` follow.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FIXTURES } from '../../scripts/sync-fixtures.mjs';

describe('fixtures', () => {
  for (const rel of FIXTURES) {
    it(`fixtures/${rel} is the kernel's copy`, () => {
      const fixture = readFileSync(new URL(`../../fixtures/${rel}`, import.meta.url));
      const kernel = readFileSync(new URL(`../../node_modules/@linked-archi/kernel/assets/${rel}`, import.meta.url));
      expect(Buffer.compare(fixture, kernel)).toBe(0);
    });
  }
});
