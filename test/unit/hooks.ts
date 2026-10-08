/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

// Module resolution hooks for the unit tests, loaded with `node --import`.
//
// - `fastly:*` modules only exist inside the Compute runtime, so they resolve to
//   the in-memory fakes in ./fakes/.
// - Sources import each other as `./foo.js`; when only `./foo.ts` exists, resolve
//   to that so Node's type stripping can run the sources directly.

import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const fakesDir = new URL('./fakes/', import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const fastlyModule = /^fastly:(.+)$/.exec(specifier);
    if (fastlyModule != null) {
      return { url: new URL(`${fastlyModule[1]}.ts`, fakesDir).href, shortCircuit: true };
    }

    if (context.parentURL?.endsWith('.ts') && /^\.\.?\/.*\.js$/.test(specifier)) {
      const tsURL = new URL(specifier.replace(/\.js$/, '.ts'), context.parentURL);
      if (existsSync(fileURLToPath(tsURL))) {
        return { url: tsURL.href, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
});
