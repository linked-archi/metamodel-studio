// The kernel checks (SReq 9, SD-7): `npm install`, then `npm run test:kernel`. The kernel is a TypeScript source
// package, so Vitest compiles it (its README, *Use*).
import { fileURLToPath } from 'node:url';

export default {
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    include: ['tests/kernel/**/*.test.mjs'],
    environment: 'node',
    testTimeout: 120_000,
    server: { deps: { inline: ['@linked-archi/kernel'] } },
  },
};
