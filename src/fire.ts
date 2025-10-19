/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import type { Schema } from 'hono';
import type { HonoBase } from 'hono/hono-base';
import type { BindingsDefs, ContextProxy } from '@fastly/compute-js-context';

import { handle, type BindingsWithClientInfo, type HandleOptions } from './handler.js';

/**
 * Registers a Hono app to handle fetch events in Fastly Compute.
 *
 * This sets up `addEventListener('fetch', handle(app, envBindingsDefs, options))`
 * using the bindings you passed to `buildFire()`.
 *
 * @param app - The Hono application instance to serve
 * @param options - Options for handling requests (fetch defaults to undefined)
 *
 * @example
 * const fire = buildFire({ foo: "KVStore" });
 *
 * type Env = {
 *   Variables: Variables;
 *   Bindings: typeof fire.Bindings;
 * };
 *
 * const app = new Hono<Env>();
 * fire(app);
 */
type FireFn<D extends BindingsDefs> = {
  <
    V extends { Variables?: object },
    S extends Schema,
    BasePath extends string,
  >(
    app: HonoBase<(keyof D extends never ? {} : never) & V, S, BasePath>,
    options?: HandleOptions
  ): void;
  <
    V extends { Variables?: object },
    S extends Schema,
    BasePath extends string,
  >(
    app: HonoBase<{Bindings:BindingsWithClientInfo<D>} & V, S, BasePath>,
    options?: HandleOptions
  ): void;

  /**
   * The inferred bindings type, derived from the defs passed to `buildFire()`.
   * Use this in your Env definition: `{ Bindings: typeof fire.Bindings }`.
   */
  Bindings: BindingsWithClientInfo<D>;

  /** For debugging: the raw defs object you passed to buildFire */
  _defs: D;
};

/**
 * Creates a `fire` function bound to a specific set of environment bindings.
 *
 * Call `buildFire()` with the shape of your bindings. The returned `fire` function
 * registers your Hono app to handle fetch events in Fastly Compute, and also exposes
 * a `.Bindings` type you can use when defining your `Env`.
 *
 * ### Example: With bindings
 * ```ts
 * const fire = buildFire({ grip: "ConfigStore", foo: "KVStore" });
 *
 * type Env = {
 *   Variables: Variables,
 *   Bindings: typeof fire.Bindings, // infer binding types automatically
 * };
 *
 * const app = new Hono<Env>();
 * fire(app);
 * ```
 *
 * ### Example: No bindings
 * ```ts
 * const fire = buildFire({});
 *
 * const app = new Hono();
 * fire(app);
 * ```
 *
 * @param bindingsDefs - A mapping of binding names to binding types
 *                          (e.g. `{ foo: "KVStore", bar: "ConfigStore" }`).
 * @returns A `fire` function that:
 *  - Registers your Hono app to handle fetch events
 *  - Applies `bindingsDefs` to `c.env`
 *  - Exposes a `.Bindings` type inferred from the given defs
 */
export function buildFire<D extends BindingsDefs>(bindingsDefs: D) {

  const fireFn = ((app: any, options: any = { fetch: undefined, } ) => {
    // Run a dummy match() against the router.
    // This forces the router (for example, RegExpRouter) to build any caches in the pre-wizer step.
    app.router.match('', '');
    addEventListener('fetch', handle(app, bindingsDefs, options));
  }) as FireFn<D>;
  fireFn._defs = bindingsDefs;

  return fireFn;
}

/**
 * Registers your Hono app to handle fetch events. No user-defined bindings are
 * applied to `c.env`.
 * `fire.Bindings` is a type you can use when defining your `Env`,
 * providing access to platform-defined bindings such as `clientInfo` and
 * `serverInfo`.
 */
export const fire = buildFire({});

/**
 * Default bindings which can be used when no user-defined bindings are present.
 * Alias of `fire.Bindings`.
 */
export type Bindings = typeof fire.Bindings;
