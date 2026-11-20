/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

// Compile-time tests for the types of ./compose, checked by `npm run typecheck`.
// Never executed. No host is registered in this compilation, so a plugin has
// the phases 'middleware' and 'routes', and no helpers. The integration app
// registers a host, and tests the types with it.

import type { KVStore } from 'fastly:kv-store';
import type { SecretStore } from 'fastly:secret-store';
import { Hono } from 'hono';

import {
  CORE_PHASES,
  compose,
  defineComposeHost,
  definePlugin,
  mergeBindings,
  type ComposeHost,
  type PhaseName,
  type PhasesOf,
  type Plugin,
  type PluginBindings,
  type PluginEntry,
  type PluginHelpers,
} from '../../src/compose/index.js';

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function assertType<T extends true>() {}

// --- No registered host

assertType<Equals<PhaseName, 'middleware' | 'routes'>>();
assertType<Equals<PluginHelpers, {}>>();

definePlugin((app) => { app.use('*', async (_c, next) => next()); });
definePlugin({ middleware: () => {}, routes: () => {} });
// @ts-expect-error -- not a phase without a host
definePlugin({ afterFilesRoutes: () => {} });
// @ts-expect-error -- a typo in a phase name
definePlugin({ route: () => {} });

// --- The bindings of a plugin are on c.env, with | undefined

definePlugin({ bindings: { kv: 'KVStore', secrets: 'SecretStore:oauth' } }, {
  routes: (app) => {
    app.get('/', async (c) => {
      assertType<Equals<typeof c.env.kv, KVStore | undefined>>();
      assertType<Equals<typeof c.env.secrets, SecretStore | undefined>>();
      assertType<Equals<typeof c.env.clientInfo, ClientInfo>>();
      return c.text('');
    });
  },
});
// @ts-expect-error -- not a resource type
definePlugin({ bindings: { kv: 'NotAResource' } }, () => {});

// --- The options of a plugin

definePlugin<{ realm: string }>((_app, options) => {
  assertType<Equals<typeof options, { realm: string } | undefined>>();
});

// --- The phases of a host come from its list

const fn = (_app: Hono<any, any, any>) => {};
// As in an app, the helpers are a value that the app made before.
const helpers = { serve: (): string => 'x' };
const host = defineComposeHost({
  steps: [ CORE_PHASES, [ 'files', fn ], 'afterFilesRoutes', [ 'fallback', fn ] ],
  helpers,
});
assertType<Equals<typeof host.phases[number], 'middleware' | 'routes' | 'afterFilesRoutes'>>();
assertType<Equals<typeof host.helpers, { serve: () => string }>>();
const asHost: ComposeHost<'middleware' | 'routes' | 'afterFilesRoutes', { serve: () => string }> = host;
void asHost;
assertType<Equals<PhasesOf<readonly [ typeof CORE_PHASES, 'a' ]>, 'middleware' | 'routes' | 'a'>>();
assertType<Equals<PhasesOf<readonly [ 'a' ]>, 'a'>>();

defineComposeHost({
  steps: [ CORE_PHASES, [ 'files', (_app, helpers) => { assertType<Equals<typeof helpers, { n: number }>>(); } ] ],
  helpers: { n: 1 },
});

// --- compose() and mergeBindings()

const plugins: PluginEntry[] = [ { name: 'a', file: 'hono-compose/a.ts', plugin: definePlugin(() => {}) } ];
compose(new Hono(), plugins);
compose(new Hono(), plugins, { host, pluginOptions: { a: { realm: 'x' } } });
// @ts-expect-error -- host must be a ComposeHost
compose(new Hono(), plugins, { host: { steps: [] } });

const merged: PluginBindings = mergeBindings({ kv: 'KVStore' }, plugins, { appBindingsSource: 'x' });
void merged;
const p: Plugin = definePlugin(() => {});
void p;
