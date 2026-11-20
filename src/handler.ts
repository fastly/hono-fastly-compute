/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import type { Schema } from 'hono';
import type { HonoBase } from 'hono/hono-base';
import {
  type BindingsDefs,
  type BindingsString,
  buildContextProxyOn,
  type ResourceInstance,
} from '@fastly/compute-js-context';

/**
 * The type on `c.env` of one binding: the resource, or `undefined` if the
 * resource does not exist or is not linked to the service.
 */
export type BindingResource<R extends BindingsString> = ResourceInstance<R> | undefined;

/**
 * The user bindings on `c.env`, from the bindings definitions.
 */
export type BindingsResources<D extends BindingsDefs> = keyof D extends never ?
  Record<string, never> :
  { [K in keyof D]: BindingResource<D[K]> };

export type BindingsWithClientInfo<D extends BindingsDefs> = BindingsResources<D> & {
  clientInfo: ClientInfo,
  serverInfo: ServerInfo,
};

type Handler = (evt: FetchEvent) => void;
export type HandleOptions = {
  fetch?: typeof fetch,
};

type HandleFn = {
  // An app that declares no Bindings, when there are no user bindings
  // (as with `fire`)
  <
    D extends BindingsDefs,
    V extends { Variables?: object },
    S extends Schema,
    BasePath extends string
  >(
    app: HonoBase<(keyof D extends never ? {} : never) & V, S, BasePath>,
    envBindingsDefs: D,
    opts?: HandleOptions): Handler;
  <
    D extends BindingsDefs,
    V extends { Variables?: object },
    S extends Schema,
    BasePath extends string
  >(
    app: HonoBase<{Bindings:BindingsWithClientInfo<D>} & V, S, BasePath>,
    envBindingsDefs: D,
    opts?: HandleOptions): Handler;
};

/**
 * Adapter for Fastly Compute
 */
export const handle: HandleFn = (
  app: any,
  envBindingsDefs: any,
  opts: HandleOptions = {
    // To use `fetch` on a Service Worker correctly, bind it to `globalThis`.
    fetch: globalThis.fetch.bind(globalThis),
  }
) => {
  return (evt) => {
    evt.respondWith(
      (async () => {
        const envBase = {
          clientInfo: evt.client,
          serverInfo: evt.server,
        };
        const env = buildContextProxyOn(envBase, envBindingsDefs);
        const executionCtx = Object.assign(evt, {
          passThroughOnException() {
            throw new Error('Not implemented');
          },
          props: {},
        });
        const res = await app.fetch(evt.request, env, executionCtx);
        if (opts.fetch && res.status === 404) {
          return await opts.fetch(evt.request);
        }
        return res;
      })()
    );
  };
};
