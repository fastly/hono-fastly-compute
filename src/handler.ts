/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import type { Schema } from 'hono';
import type { HonoBase } from 'hono/hono-base';
import {
  type BindingsDefs,
  buildContextProxyOn,
  type ContextProxy,
} from '@fastly/compute-js-context';

export type BindingsWithClientInfo<D extends BindingsDefs> = ContextProxy<D> & {
  clientInfo: ClientInfo,
  serverInfo: ServerInfo,
};

type Handler = (evt: FetchEvent) => void;
export type HandleOptions = {
  fetch?: typeof fetch,
};

type HandleFn = {
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
