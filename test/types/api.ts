/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

// Compile-time tests for the public types, checked by `npm run typecheck`.
// Never executed.

import type { Acl } from 'fastly:acl';
import type { Backend } from 'fastly:backend';
import type { ConfigStore } from 'fastly:config-store';
import type { KVStore } from 'fastly:kv-store';
import type { Logger } from 'fastly:logger';
import type { SecretStore } from 'fastly:secret-store';
import { Hono } from 'hono';
import type { GetConnInfo } from 'hono/conninfo';
import type { MiddlewareHandler } from 'hono';

import {
  buildFire,
  fire,
  getConnInfo,
  handle,
  logFastlyServiceVersion,
  type Bindings,
  type BindingsDefs,
  type BindingsWithClientInfo,
  type HandleOptions,
  type ResourceType,
} from '../../src/index.js';

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function assertType<T extends true>() {}

// --- buildFire() bindings inference

const typedFire = buildFire({
  acl: 'Acl',
  backend: 'Backend',
  config: 'ConfigStore',
  env: 'env',
  kv: 'KVStore',
  logger: 'Logger',
  secrets: 'SecretStore',
  renamedKv: 'KVStore:my-kv-store',
  renamedEnv: 'env:FASTLY_HOSTNAME',
});
type B = typeof typedFire.Bindings;

assertType<Equals<B['acl'], Acl>>();
assertType<Equals<B['backend'], Backend>>();
assertType<Equals<B['config'], ConfigStore>>();
assertType<Equals<B['env'], string>>();
assertType<Equals<B['kv'], KVStore>>();
assertType<Equals<B['logger'], Logger>>();
assertType<Equals<B['secrets'], SecretStore>>();
assertType<Equals<B['renamedKv'], KVStore>>();
assertType<Equals<B['renamedEnv'], string>>();
assertType<Equals<B['clientInfo'], ClientInfo>>();
assertType<Equals<B['serverInfo'], ServerInfo>>();
assertType<Equals<B, BindingsWithClientInfo<typeof typedFire._defs>>>();

// @ts-expect-error -- not a resource type
buildFire({ foo: 'NotAResource' });
// @ts-expect-error -- not a resource type, even with a name
buildFire({ foo: 'NotAResource:name' });

assertType<Equals<ResourceType, 'Acl' | 'Backend' | 'ConfigStore' | 'env' | 'KVStore' | 'Logger' | 'SecretStore'>>();

// --- default fire / Bindings

assertType<Equals<Bindings, typeof fire.Bindings>>();
assertType<Equals<Bindings['clientInfo'], ClientInfo>>();
assertType<Equals<Bindings['serverInfo'], ServerInfo>>();

// --- fire() accepts apps whose Bindings match

fire(new Hono());
fire(new Hono<{ Bindings: Bindings }>());
fire(new Hono<{ Bindings: Bindings, Variables: { user: string } }>());
fire(new Hono<{ Bindings: Bindings }>().basePath('/api'));
typedFire(new Hono<{ Bindings: B }>());
typedFire(new Hono<{ Bindings: B, Variables: { user: string } }>());
typedFire(new Hono<{ Bindings: B }>(), { fetch: (input, init) => fetch(input, init) });

// @ts-expect-error -- app's Bindings must match those produced by buildFire
typedFire(new Hono<{ Bindings: { other: string } }>());
// @ts-expect-error -- missing a binding
typedFire(new Hono<{ Bindings: Omit<B, 'kv'> & { kv?: KVStore } }>());
// @ts-expect-error -- fetch must be fetch-compatible
typedFire(new Hono<{ Bindings: B }>(), { fetch: 'nope' });

// --- handle()

const handler = handle(new Hono<{ Bindings: B }>(), typedFire._defs);
assertType<Equals<typeof handler, (evt: FetchEvent) => void>>();
addEventListener('fetch', handler);
handle(new Hono<{ Bindings: B }>(), typedFire._defs, { fetch: undefined });
assertType<Equals<HandleOptions, { fetch?: typeof fetch }>>();

// @ts-expect-error -- defs don't match the app's Bindings
handle(new Hono<{ Bindings: B }>(), { kv: 'KVStore' });

const defs = { kv: 'KVStore' } satisfies BindingsDefs;
handle(new Hono<{ Bindings: BindingsWithClientInfo<typeof defs> }>(), defs);

// With no bindings defs, an app that declares no Bindings is accepted (as with fire)
handle(new Hono(), {});
handle(new Hono<{ Variables: { user: string } }>(), {});
handle(new Hono<{ Bindings: Bindings }>(), {});
// @ts-expect-error -- with bindings defs, the app must declare the Bindings
handle(new Hono(), { kv: 'KVStore' });

// --- context typing inside handlers

new Hono<{ Bindings: B }>().get('/', (c) => {
  assertType<Equals<typeof c.env.kv, KVStore>>();
  // FetchEventLike augmentation exposes Fastly's client/server info on c.event
  assertType<Equals<typeof c.event.client, ClientInfo>>();
  assertType<Equals<typeof c.event.server, ServerInfo>>();
  return c.text('');
});

// --- helpers

assertType<Equals<typeof getConnInfo, GetConnInfo>>();
const middleware: MiddlewareHandler = logFastlyServiceVersion();
void middleware;
