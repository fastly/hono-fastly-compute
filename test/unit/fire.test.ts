/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

import { buildFire, fire } from '../../src/index.js';
import { captureFetchListeners } from './helpers/fetch-event.js';
import { provision, resetRegistry } from './fakes/registry.js';

describe('buildFire()', () => {
  let capture: ReturnType<typeof captureFetchListeners>;

  beforeEach(() => {
    resetRegistry();
    capture = captureFetchListeners();
  });

  afterEach(() => {
    capture.restore();
    mock.restoreAll();
  });

  it('returns a fire function that keeps the bindings defs', () => {
    const defs = { kv: 'KVStore' } as const;
    const fireFn = buildFire(defs);
    assert.equal(typeof fireFn, 'function');
    assert.equal(fireFn._defs, defs);
  });

  it('registers a single fetch event listener that serves the app', async () => {
    const app = new Hono();
    app.get('/', (c) => c.text('hello'));

    buildFire({})(app);
    assert.equal(capture.listeners.length, 1);

    const res = await capture.dispatch('http://example.com/');
    assert.equal(await res.text(), 'hello');
  });

  it('applies the bindings defs to c.env', async () => {
    provision('KVStore', 'fire-kv');
    const fireFn = buildFire({ kv: 'KVStore:fire-kv' });
    const app = new Hono<{ Bindings: typeof fireFn.Bindings }>();
    app.get('/', (c) => c.json({
      kv: (c.env.kv as unknown as { name: string }).name,
      clientAddress: c.env.clientInfo.address,
    }));

    fireFn(app);
    const res = await capture.dispatch('http://example.com/');
    assert.deepEqual(await res.json(), { kv: 'fire-kv', clientAddress: '192.0.2.1' });
  });

  it('warms the router before registering the listener', () => {
    const app = new Hono();
    app.get('/', (c) => c.text('hello'));
    const match = mock.method(app.router, 'match');

    buildFire({})(app);
    assert.equal(match.mock.callCount(), 1);
    assert.deepEqual(match.mock.calls[0].arguments, ['', '']);
  });

  it('does not fall through to fetch on a 404 by default', async () => {
    const fetch = mock.method(globalThis, 'fetch', () => Promise.resolve(new Response('from fetch')));
    const app = new Hono();

    buildFire({})(app);
    const res = await capture.dispatch('http://example.com/unmatched');
    assert.equal(res.status, 404);
    assert.equal(fetch.mock.callCount(), 0);
  });

  it('falls through to options.fetch on a 404', async () => {
    const app = new Hono();

    buildFire({})(app, { fetch: () => Promise.resolve(new Response('fallback')) });
    const res = await capture.dispatch('http://example.com/unmatched');
    assert.equal(await res.text(), 'fallback');
  });
});

describe('fire()', () => {
  let capture: ReturnType<typeof captureFetchListeners>;

  beforeEach(() => {
    resetRegistry();
    capture = captureFetchListeners();
  });

  afterEach(() => {
    capture.restore();
  });

  it('serves the app with only clientInfo and serverInfo on c.env', async () => {
    const app = new Hono<{ Bindings: typeof fire.Bindings }>();
    app.get('/', (c) => c.json({
      clientAddress: c.env.clientInfo.address,
      serverAddress: c.env.serverInfo.address,
    }));

    fire(app);
    const res = await capture.dispatch('http://example.com/');
    assert.deepEqual(await res.json(), { clientAddress: '192.0.2.1', serverAddress: '198.51.100.1' });
    assert.deepEqual(fire._defs, {});
  });
});
