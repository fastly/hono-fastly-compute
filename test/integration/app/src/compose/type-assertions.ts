/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

/// <reference types="@fastly/js-compute" />

// Compile-time only; never imported by index.ts. The types of
// @fastly/hono-fastly-compute/compose with the host of ./host.ts registered.

import type { ConfigStore } from 'fastly:config-store';
import {
  definePlugin,
  type PhaseName,
  type PluginHelpers,
} from '@fastly/hono-fastly-compute/compose';
import type { helpers } from './host.js';

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function assertType<T extends true>() {}

assertType<Equals<PhaseName, 'middleware' | 'routes' | 'afterFilesRoutes'>>();
assertType<Equals<PluginHelpers, typeof helpers>>();

definePlugin({
  afterFilesRoutes: (_app, _options, h) => {
    assertType<Equals<typeof h, typeof helpers>>();
  },
});
// @ts-expect-error -- a phase that the host does not have
definePlugin({ beforeFilesRoutes: () => {} });
// @ts-expect-error -- the name of a host step is not a phase
definePlugin({ files: () => {} });

definePlugin({ bindings: { c: 'ConfigStore:my_config' } }, (app) => {
  app.get('/', (c) => {
    assertType<Equals<typeof c.env.c, ConfigStore | undefined>>();
    return c.text('');
  });
});
