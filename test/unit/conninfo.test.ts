/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import type { ConnInfo } from 'hono/conninfo';

import { getConnInfo } from '../../src/index.js';

async function connInfoFor(env: object): Promise<ConnInfo> {
  const app = new Hono();
  app.get('/', (c) => c.json(getConnInfo(c)));
  const res = await app.request('/', {}, env);
  assert.equal(res.status, 200);
  return res.json();
}

describe('getConnInfo()', () => {
  for (const address of ['127.0.0.1', '0.0.0.0', '192.0.2.1', '255.255.255.255']) {
    it(`reports ${address} as IPv4`, async () => {
      assert.deepEqual(await connInfoFor({ clientInfo: { address } }), {
        remote: { address, addressType: 'IPv4' },
      });
    });
  }

  for (const address of [
    '::1',
    '::',
    '2001:db8::1',
    '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
    'fe80::1%eth0',
    '::ffff:192.0.2.1',
  ]) {
    it(`reports ${address} as IPv6`, async () => {
      assert.deepEqual(await connInfoFor({ clientInfo: { address } }), {
        remote: { address, addressType: 'IPv6' },
      });
    });
  }

  for (const address of ['', 'not-an-ip', '256.0.0.1', '1.2.3', '2001:db8::g', null, undefined]) {
    it(`reports no address for ${JSON.stringify(address)}`, async () => {
      // JSON drops the undefined properties
      assert.deepEqual(await connInfoFor({ clientInfo: { address } }), { remote: {} });
    });
  }

  it('throws a TypeError when env has no clientInfo', async () => {
    const app = new Hono();
    let error: unknown;
    app.get('/', (c) => {
      try {
        getConnInfo(c);
      } catch (err) {
        error = err;
      }
      return c.text('ok');
    });
    await app.request('/', {}, {});
    assert.ok(error instanceof TypeError);
    assert.equal(error.message, 'env has to include clientInfo.');
  });
});
