/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

/// <reference types="@fastly/js-compute" />

// Test application served by Viceroy in the integration tests.
// It is type-checked and compiled against each @fastly/js-compute version under test.

import { Hono } from 'hono';
import {
  buildFire,
  getConnInfo,
  logFastlyServiceVersion,
} from '@fastly/hono-fastly-compute';

const fire = buildFire({
  assets: 'KVStore',
  config: 'ConfigStore:my_config',
  secrets: 'SecretStore:my_secrets',
  origin: 'Backend',
  hostname: 'env:FASTLY_HOSTNAME',
  missing: 'KVStore:not-provisioned',
  acl: 'Acl:my_acl',
  logger: 'Logger:my_logger',
});

const app = new Hono<{ Bindings: typeof fire.Bindings }>();

// The resource of a binding. Each route below needs its resource, so a missing
// resource is an error in the setup of the test.
function required<T>(resource: T | undefined, name: string): T {
  if (resource === undefined) {
    throw new Error(`The binding '${name}' has no resource.`);
  }
  return resource;
}

app.get('/', (c) => c.text('ok'));

app.get('/client-info', (c) => {
  return c.json({
    clientAddress: c.env.clientInfo.address,
    serverAddress: c.env.serverInfo.address,
  });
});

app.get('/conninfo', (c) => c.json(getConnInfo(c)));

app.get('/kv', async (c) => {
  const entry = await required(c.env.assets, 'assets').get('hello');
  return c.json({ value: await entry?.text() });
});

app.get('/config', (c) => {
  return c.json({ value: required(c.env.config, 'config').get('greeting') });
});

app.get('/secret', async (c) => {
  const secret = await required(c.env.secrets, 'secrets').get('token');
  // Dummy fixture value from fastly.toml, not a real secret
  return c.json({ value: secret?.plaintext() });
});

app.get('/env', (c) => {
  return c.json({ type: typeof c.env.hostname, value: c.env.hostname });
});

app.get('/missing', (c) => {
  return c.json({
    isUndefined: c.env.missing === undefined,
    inEnv: 'missing' in c.env,
  });
});

app.get('/acl', async (c) => {
  const acl = required(c.env.acl, 'acl');
  const blocked = await acl.lookup('192.0.2.1');
  const unlisted = await acl.lookup('198.51.100.1');
  return c.json({ blocked: blocked?.action ?? null, unlisted: unlisted?.action ?? null });
});

app.get('/logger', (c) => {
  required(c.env.logger, 'logger').log('integration test log line');
  return c.json({ logged: true });
});

app.get('/backend', async (c) => {
  const res = await fetch('http://origin/via-backend', { backend: required(c.env.origin, 'origin') });
  return c.json({ status: res.status, body: await res.text() });
});

app.get('/event', (c) => {
  let passThroughError: string | undefined;
  try {
    c.executionCtx.passThroughOnException();
  } catch (err) {
    passThroughError = String(err);
  }
  return c.json({
    eventClientAddress: c.event.client.address,
    hasWaitUntil: typeof c.executionCtx.waitUntil === 'function',
    passThroughError,
  });
});

app.post('/echo', async (c) => c.text(await c.req.text()));

app.get('/log', logFastlyServiceVersion(), (c) => c.text('logged'));

// Unmatched routes fall through to the origin backend.
fire(app, {
  fetch: (input, init) => fetch(input, { ...init, backend: 'origin' }),
});
