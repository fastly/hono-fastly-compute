/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

/// <reference types="@fastly/js-compute" />

// Compile-time only; never imported by index.ts.
// Type-checked against each @fastly/js-compute version under test, to catch
// the package's published types degrading (e.g. to `any`) under that SDK.

import type { Acl } from 'fastly:acl';
import type { Backend } from 'fastly:backend';
import type { ConfigStore } from 'fastly:config-store';
import type { KVStore } from 'fastly:kv-store';
import type { Logger } from 'fastly:logger';
import type { SecretStore } from 'fastly:secret-store';
import { Hono } from 'hono';
import { buildFire, fire, type Bindings } from '@fastly/hono-fastly-compute';

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function assertType<T extends true>() {}

const typedFire = buildFire({
  acl: 'Acl',
  backend: 'Backend:my-backend',
  config: 'ConfigStore',
  env: 'env:FASTLY_HOSTNAME',
  kv: 'KVStore',
  logger: 'Logger',
  secrets: 'SecretStore',
});
type B = typeof typedFire.Bindings;

assertType<Equals<B['acl'], Acl>>();
assertType<Equals<B['backend'], Backend>>();
assertType<Equals<B['config'], ConfigStore>>();
assertType<Equals<B['env'], string>>();
assertType<Equals<B['kv'], KVStore>>();
assertType<Equals<B['logger'], Logger>>();
assertType<Equals<B['secrets'], SecretStore>>();
assertType<Equals<B['clientInfo'], ClientInfo>>();
assertType<Equals<B['serverInfo'], ServerInfo>>();
assertType<Equals<Bindings['clientInfo'], ClientInfo>>();
assertType<Equals<Bindings['serverInfo'], ServerInfo>>();

// `c.event` exposes Fastly's client/server info via the FetchEventLike augmentation
new Hono<{ Bindings: B }>().get('/', (c) => {
  assertType<Equals<typeof c.event.client, ClientInfo>>();
  assertType<Equals<typeof c.event.server, ServerInfo>>();
  return c.text('');
});

fire(new Hono());
fire(new Hono<{ Bindings: Bindings }>());
typedFire(new Hono<{ Bindings: B }>());
// @ts-expect-error -- app's Bindings must match those produced by buildFire
typedFire(new Hono<{ Bindings: { other: string } }>());
