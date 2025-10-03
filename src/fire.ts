import type { Schema } from 'hono';
import type { HonoBase } from 'hono/hono-base';
import type { BuildBindings, EnvBindingsDefs } from '@h7/fastly-compute-js-context';

import { handle, type HandleOptions } from './handler.js';

type FireFn<D extends EnvBindingsDefs> = {
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
  <V extends { Variables?: object }, S extends Schema, BasePath extends string>(
    app: HonoBase<(keyof D extends never ? {} : { Bindings: BuildBindings<D> }) & V, S, BasePath>,
    options?: HandleOptions
  ): void;

  /**
   * The inferred bindings type, derived from the defs passed to `buildFire()`.
   * Use this in your Env definition: `{ Bindings: typeof fire.Bindings }`.
   */
  Bindings: BuildBindings<D>;

  /** For debugging: the raw defs object you passed to buildFire */
  defs: D;
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
 *   Variables: Variables;
 *   Bindings: typeof fire.Bindings; // infer binding types automatically
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
 * @param envBindingsDefs - A mapping of binding names to binding types
 *                          (e.g. `{ foo: "KVStore", bar: "ConfigStore" }`).
 * @returns A `fire` function that:
 *  - Registers your Hono app to handle fetch events
 *  - Exposes a `.Bindings` type inferred from the given defs
 */
export function buildFire<D extends EnvBindingsDefs>(envBindingsDefs: D) {

  const fireFn = (<
    V extends { Variables?: object },
    S extends Schema,
    BasePath extends string
  >(
    app: HonoBase<(keyof D extends never ? {} : { Bindings: BuildBindings<D> }) & V, S, BasePath>,
    options: HandleOptions = {
      fetch: undefined,
    },
  ) => {
    addEventListener('fetch', handle(app, envBindingsDefs, options))
  }) as FireFn<D>;

  fireFn.defs = envBindingsDefs;

  return fireFn;

}
