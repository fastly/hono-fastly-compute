import type { Schema } from 'hono';
import type { HonoBase } from 'hono/hono-base';
import {
  type EnvBindingsDefs,
  createContext,
  buildEnvironment,
  BuildBindings,
} from '@h7/fastly-compute-js-context';

type Handler = (evt: FetchEvent) => void;
export type HandleOptions = {
  fetch?: typeof fetch,
};

// D may be empty, in which case Bindings is not required
export type MaybeBindings<D extends EnvBindingsDefs> = keyof D extends never
  ? {}
  : { Bindings: BuildBindings<D> };

/**
 * Adapter for Fastly Compute
 */
export const handle = <
  D extends EnvBindingsDefs,
  V extends { Variables?: object },
  S extends Schema,
  BasePath extends string
>(
  app: HonoBase<MaybeBindings<D> & V, S, BasePath>,
  envBindingsDefs: D,
  opts: HandleOptions = {
    // To use `fetch` on a Service Worker correctly, bind it to `globalThis`.
    fetch: globalThis.fetch.bind(globalThis),
  }
): Handler => {
  return (evt) => {
    evt.respondWith(
      (async () => {
        const context = createContext();
        const env = buildEnvironment(context, envBindingsDefs);
        const res = await app.fetch(evt.request, env, {
          waitUntil: evt.waitUntil.bind(evt),
          passThroughOnException() {
            throw new Error('Not implemented');
          },
          props: undefined,
        });
        if (opts.fetch && res.status === 404) {
          return await opts.fetch(evt.request);
        }
        return res;
      })()
    );
  };
};
