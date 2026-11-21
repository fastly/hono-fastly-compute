/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

// Runs before the build of the integration app (see build-apps.mjs), as the
// prebuild script of an app does: bundles the plugins of hono-compose/ into
// src/hono-compose.generated.js.

import * as esbuild from 'esbuild';
import { bundlePlugins } from '@fastly/hono-fastly-compute/compose/build';

await bundlePlugins({
  appDir: process.cwd(),
  esbuild,
  pluginOptions: { api: { greeting: 'hello' } },
});
