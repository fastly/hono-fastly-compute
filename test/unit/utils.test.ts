/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

import { logFastlyServiceVersion } from '../../src/index.js';
import { registry, resetRegistry } from './fakes/registry.js';

describe('logFastlyServiceVersion()', () => {
  afterEach(() => {
    resetRegistry();
    mock.restoreAll();
  });

  it('logs FASTLY_SERVICE_VERSION, then runs the next handler', async () => {
    registry.env.set('FASTLY_SERVICE_VERSION', '42');
    const log = mock.method(console, 'log', () => {});
    const app = new Hono();
    app.use('*', logFastlyServiceVersion());
    app.get('/', (c) => c.text('next ran'));

    const res = await app.request('/');
    assert.equal(await res.text(), 'next ran');
    assert.equal(log.mock.callCount(), 1);
    assert.deepEqual(log.mock.calls[0].arguments, ['FASTLY_SERVICE_VERSION', '42']);
  });

  it('logs undefined when the variable is unset', async () => {
    const log = mock.method(console, 'log', () => {});
    const app = new Hono();
    app.use('*', logFastlyServiceVersion());
    app.get('/', (c) => c.text('ok'));

    const res = await app.request('/');
    assert.equal(res.status, 200);
    assert.deepEqual(log.mock.calls[0].arguments, ['FASTLY_SERVICE_VERSION', undefined]);
  });
});
