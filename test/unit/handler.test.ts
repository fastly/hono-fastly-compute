/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

import { handle, type BindingsDefs, type BindingsWithClientInfo } from '../../src/index.js';
import { createFetchEvent } from './helpers/fetch-event.js';
import { callsFor, provision, registry, resetRegistry } from './fakes/registry.js';

// Note: @fastly/compute-js-context memoizes resource lookups by name for the
// lifetime of the process, so each test uses its own resource names.

function newApp<D extends BindingsDefs = {}>(_defs?: D) {
  return new Hono<{ Bindings: BindingsWithClientInfo<D> }>();
}

// For reading arbitrary binding keys in assertions
function anyEnv(env: unknown) {
  return env as Record<string, any>;
}

async function respond(handler: (evt: FetchEvent) => void, request: Request | string = 'http://example.com/') {
  const event = createFetchEvent(request);
  handler(event);
  return event.response();
}

describe('handle()', () => {
  beforeEach(() => {
    resetRegistry();
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it('responds to the FetchEvent with the app response', async () => {
    const app = newApp();
    app.get('/hello', (c) => c.text('hi', 201, { 'x-test': '1' }));

    const res = await respond(handle(app, {}), 'http://example.com/hello');
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('x-test'), '1');
    assert.equal(await res.text(), 'hi');
  });

  it('passes the request (method, URL, headers, body) to the app', async () => {
    const app = newApp();
    app.post('/echo/:id', async (c) => c.json({
      id: c.req.param('id'),
      query: c.req.query('q'),
      header: c.req.header('x-in'),
      body: await c.req.text(),
    }));

    const request = new Request('http://example.com/echo/42?q=abc', {
      method: 'POST',
      headers: { 'x-in': 'yes' },
      body: 'payload',
    });
    const res = await respond(handle(app, {}), request);
    assert.deepEqual(await res.json(), { id: '42', query: 'abc', header: 'yes', body: 'payload' });
  });

  it('sets clientInfo and serverInfo on c.env from the event', async () => {
    const app = newApp();
    let seen: unknown[] = [];
    app.get('/', (c) => {
      seen = [c.env.clientInfo, c.env.serverInfo];
      return c.text('ok');
    });

    const event = createFetchEvent('http://example.com/');
    handle(app, {})(event);
    await event.response();
    assert.equal(seen[0], event.client);
    assert.equal(seen[1], event.server);
  });

  it('resolves bindings to Fastly resources on c.env', async () => {
    provision('KVStore', 'handler-kv');
    provision('ConfigStore', 'handler_config');
    provision('SecretStore', 'handler-secrets');
    provision('Backend', 'handler-origin');
    provision('Logger', 'handler-logger');
    provision('Acl', 'handler-acl');
    registry.env.set('HANDLER_VAR', 'value');

    const defs = {
      kv: 'KVStore:handler-kv',
      config: 'ConfigStore:handler_config',
      secrets: 'SecretStore:handler-secrets',
      origin: 'Backend:handler-origin',
      logger: 'Logger:handler-logger',
      acl: 'Acl:handler-acl',
      variable: 'env:HANDLER_VAR',
    } as const;
    const app = newApp(defs);
    app.get('/', (c) => {
      const env = anyEnv(c.env);
      return c.json(Object.fromEntries(
        Object.keys(defs).map((key) => [key, [env[key]?.constructor.name, env[key]?.name ?? env[key]]]),
      ));
    });

    const res = await respond(handle(app, defs));
    assert.deepEqual(await res.json(), {
      kv: ['KVStore', 'handler-kv'],
      config: ['ConfigStore', 'handler_config'],
      secrets: ['SecretStore', 'handler-secrets'],
      origin: ['Backend', 'handler-origin'],
      logger: ['Logger', 'handler-logger'],
      acl: ['Acl', 'handler-acl'],
      variable: ['String', 'value'],
    });
  });

  it('uses the binding key as the resource name when no name is given', async () => {
    provision('KVStore', 'handlerDefaultName');
    const defs = { handlerDefaultName: 'KVStore' } as const;
    const app = newApp(defs);
    app.get('/', (c) => c.text(anyEnv(c.env).handlerDefaultName.name));

    const res = await respond(handle(app, defs));
    assert.equal(await res.text(), 'handlerDefaultName');
  });

  it('leaves bindings to non-provisioned resources undefined', async () => {
    const defs = { missing: 'KVStore:handler-not-provisioned' } as const;
    const app = newApp(defs);
    app.get('/', (c) => c.json({
      isUndefined: c.env.missing === undefined,
      inEnv: 'missing' in c.env,
      clientInfoInEnv: 'clientInfo' in c.env,
    }));

    const res = await respond(handle(app, defs));
    assert.deepEqual(await res.json(), { isUndefined: true, inEnv: false, clientInfoInEnv: true });
  });

  it('does not look up resources for bindings that are not accessed', async () => {
    provision('KVStore', 'handler-lazy');
    registry.env.set('HANDLER_LAZY_VAR', 'value');
    const defs = { kv: 'KVStore:handler-lazy', variable: 'env:HANDLER_LAZY_VAR' } as const;
    const app = newApp(defs);
    app.get('/', (c) => c.text(c.env.clientInfo.address));

    const res = await respond(handle(app, defs));
    assert.equal(res.status, 200);
    assert.equal(callsFor('KVStore', 'handler-lazy').length, 0);
    assert.equal(callsFor('env', 'HANDLER_LAZY_VAR').length, 0);
  });

  it('looks up each resource once, across accesses and requests', async () => {
    provision('KVStore', 'handler-cached');
    const defs = { kv: 'KVStore:handler-cached' } as const;
    const seen: unknown[] = [];
    const app = newApp(defs);
    app.get('/', (c) => {
      seen.push(c.env.kv, c.env.kv);
      return c.text('ok');
    });

    const handler = handle(app, defs);
    await respond(handler);
    await respond(handler);
    assert.equal(callsFor('KVStore', 'handler-cached').length, 1);
    assert.equal(new Set(seen).size, 1);
  });

  it('builds a fresh env for each request', async () => {
    const envs: unknown[] = [];
    const app = newApp();
    app.get('/', (c) => {
      envs.push(c.env);
      return c.text('ok');
    });

    const handler = handle(app, {});
    await respond(handler);
    await respond(handler);
    assert.equal(envs.length, 2);
    assert.notEqual(envs[0], envs[1]);
  });

  describe('executionCtx', () => {
    it('is the FetchEvent, also exposed as c.event', async () => {
      const app = newApp();
      let ctx: unknown;
      let evt: unknown;
      app.get('/', (c) => {
        ctx = c.executionCtx;
        evt = c.event;
        return c.text('ok');
      });

      const event = createFetchEvent('http://example.com/');
      handle(app, {})(event);
      await event.response();
      assert.equal(ctx, event);
      assert.equal(evt, event);
    });

    it('forwards waitUntil() to the FetchEvent', async () => {
      const app = newApp();
      const pending = Promise.resolve('done');
      app.get('/', (c) => {
        c.executionCtx.waitUntil(pending);
        return c.text('ok');
      });

      const event = createFetchEvent('http://example.com/');
      handle(app, {})(event);
      await event.response();
      assert.deepEqual(event.waitUntilPromises, [pending]);
    });

    it('passThroughOnException() throws "Not implemented"', async () => {
      const app = newApp();
      app.get('/', (c) => {
        assert.throws(() => c.executionCtx.passThroughOnException(), { message: 'Not implemented' });
        return c.text('ok');
      });

      const res = await respond(handle(app, {}));
      assert.equal(res.status, 200);
    });

    it('has empty props', async () => {
      const app = newApp();
      app.get('/', (c) => c.json(c.executionCtx.props));

      const res = await respond(handle(app, {}));
      assert.deepEqual(await res.json(), {});
    });
  });

  describe('fetch fallback', () => {
    it('defaults to globalThis.fetch, called with globalThis as `this`, for a 404', async () => {
      const calls: { thisArg: unknown, request: Request }[] = [];
      mock.method(globalThis, 'fetch', function (this: unknown, request: Request) {
        calls.push({ thisArg: this, request });
        return Promise.resolve(new Response('from fetch'));
      });
      const app = newApp();

      const request = new Request('http://example.com/unmatched');
      const res = await respond(handle(app, {}), request);
      assert.equal(await res.text(), 'from fetch');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].thisArg, globalThis);
      assert.equal(calls[0].request, request);
    });

    it('uses opts.fetch for a 404', async () => {
      const fetch = mock.fn((_input: RequestInfo | URL) => Promise.resolve(new Response('fallback', { status: 202 })));
      const app = newApp();

      const request = new Request('http://example.com/unmatched');
      const res = await respond(handle(app, {}, { fetch }), request);
      assert.equal(res.status, 202);
      assert.equal(await res.text(), 'fallback');
      assert.equal(fetch.mock.callCount(), 1);
      assert.equal(fetch.mock.calls[0].arguments[0], request);
    });

    it('also replaces a 404 returned by a matched route', async () => {
      const fetch = mock.fn(() => Promise.resolve(new Response('fallback')));
      const app = newApp();
      app.get('/', (c) => c.text('not here', 404));

      const res = await respond(handle(app, {}, { fetch }));
      assert.equal(await res.text(), 'fallback');
    });

    it('does not call opts.fetch for non-404 responses', async () => {
      const fetch = mock.fn(() => Promise.resolve(new Response('fallback')));
      const app = newApp();
      app.get('/ok', (c) => c.text('ok'));
      app.get('/error', () => {
        throw new Error('boom');
      });
      app.onError((_err, c) => c.text('error', 500));

      const ok = await respond(handle(app, {}, { fetch }), 'http://example.com/ok');
      assert.equal(await ok.text(), 'ok');
      const error = await respond(handle(app, {}, { fetch }), 'http://example.com/error');
      assert.equal(error.status, 500);
      assert.equal(fetch.mock.callCount(), 0);
    });

    it('returns the 404 when opts.fetch is undefined', async () => {
      const app = newApp();

      const res = await respond(handle(app, {}, { fetch: undefined }), 'http://example.com/unmatched');
      assert.equal(res.status, 404);
    });
  });
});
