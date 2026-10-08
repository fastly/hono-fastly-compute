/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

// Runs the integration app (built once per SDK version by build-apps.mjs) under the
// Fastly CLI's local server (Viceroy), with a local Node server as the origin
// backend, and sends it requests.
//
// Requires the Fastly CLI. Use `npm run test:integration` to build and run.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SDK_VERSIONS, sdkWorkDir } from './sdk-versions.mjs';

const appDir = join(dirname(fileURLToPath(import.meta.url)), 'app');
const fastlyCli = process.env.FASTLY_CLI ?? 'fastly';

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(check: () => Promise<boolean> | boolean, timeoutMs: number, what: string) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

for (const version of SDK_VERSIONS) {
  describe(`integration with @fastly/js-compute@${version}`, () => {
    const dir = sdkWorkDir(version);
    const wasm = join(dir, 'bin', 'main.wasm');
    let origin: Server;
    let serve: ChildProcess | undefined;
    let serveOutput = '';
    let baseUrl: string;

    const get = (path: string, init?: RequestInit) => fetch(`${baseUrl}${path}`, init);
    const getJson = async (path: string) => {
      const res = await get(path);
      assert.equal(res.status, 200, `GET ${path} -> ${res.status}: ${await res.clone().text()}`);
      return res.json();
    };

    before(async () => {
      if (!existsSync(wasm)) {
        throw new Error(`${wasm} not found. Run "npm run test:integration" to build it first.`);
      }

      origin = createServer((req, res) => {
        res.setHeader('x-origin', '1');
        res.end(`origin:${req.method} ${req.url}`);
      });
      const originPort = await listen(origin);
      // Written from the template on each run, as the origin port changes between runs
      const manifest = readFileSync(join(appDir, 'fastly.toml'), 'utf-8');
      writeFileSync(join(dir, 'fastly.toml'), manifest.replaceAll('__ORIGIN_PORT__', String(originPort)));

      const port = await getFreePort();
      baseUrl = `http://127.0.0.1:${port}`;
      // Own process group, so the CLI and the Viceroy process it spawns can be stopped together.
      serve = spawn(fastlyCli, ['compute', 'serve', '--skip-build', '--file', wasm, '--addr', `127.0.0.1:${port}`], {
        cwd: dir,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      serve.stdout!.on('data', (chunk) => { serveOutput += chunk; });
      serve.stderr!.on('data', (chunk) => { serveOutput += chunk; });

      await waitFor(async () => {
        if (serve!.exitCode != null) {
          throw new Error(`fastly compute serve exited (${serve!.exitCode}):\n${serveOutput}`);
        }
        try {
          return (await get('/')).ok;
        } catch {
          return false;
        }
      }, 60_000, 'local server');
    }, { timeout: 90_000 });

    after(async () => {
      // Kept for debugging failures
      writeFileSync(join(dir, 'serve.log'), serveOutput);
      if (serve?.pid != null && serve.exitCode == null) {
        process.kill(-serve.pid, 'SIGTERM');
      }
      if (origin?.listening) {
        await new Promise((resolve) => origin.close(resolve));
      }
    });

    it('serves a Hono route', async () => {
      const res = await get('/');
      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'ok');
    });

    it('passes the request through to the app', async () => {
      const res = await get('/echo', { method: 'POST', body: 'hello body' });
      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'hello body');
    });

    it('provides clientInfo and serverInfo on c.env', async () => {
      assert.deepEqual(await getJson('/client-info'), {
        clientAddress: '127.0.0.1',
        serverAddress: '127.0.0.1',
      });
    });

    it('getConnInfo() reports the client address', async () => {
      assert.deepEqual(await getJson('/conninfo'), {
        remote: { address: '127.0.0.1', addressType: 'IPv4' },
      });
    });

    it('binds a KV Store', async () => {
      assert.deepEqual(await getJson('/kv'), { value: 'world' });
    });

    it('binds a Config Store by a different resource name', async () => {
      assert.deepEqual(await getJson('/config'), { value: 'hi' });
    });

    it('binds a Secret Store by a different resource name', async () => {
      assert.deepEqual(await getJson('/secret'), { value: 'dummy-fixture-value' });
    });

    it('binds an environment variable', async () => {
      assert.deepEqual(await getJson('/env'), { type: 'string', value: 'localhost' });
    });

    it('leaves a binding to a non-provisioned resource undefined', async () => {
      assert.deepEqual(await getJson('/missing'), { isUndefined: true, inEnv: false });
    });

    it('binds an ACL', async () => {
      assert.deepEqual(await getJson('/acl'), { blocked: 'BLOCK', unlisted: null });
    });

    it('binds a Logger', async () => {
      assert.deepEqual(await getJson('/logger'), { logged: true });
      await waitFor(() => serveOutput.includes('integration test log line'), 5_000, 'logger output');
    });

    it('binds a Backend usable with fetch()', async () => {
      assert.deepEqual(await getJson('/backend'), { status: 200, body: 'origin:GET /via-backend' });
    });

    it('uses the FetchEvent as executionCtx and c.event', async () => {
      const body = await getJson('/event');
      assert.equal(body.eventClientAddress, '127.0.0.1');
      assert.equal(body.hasWaitUntil, true);
      assert.match(body.passThroughError, /Not implemented/);
    });

    it('falls through to options.fetch when no route matches', async () => {
      const res = await get('/not-a-route?x=1');
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-origin'), '1');
      assert.equal(await res.text(), 'origin:GET /not-a-route?x=1');
    });

    it('logFastlyServiceVersion() logs the service version', async () => {
      const res = await get('/log');
      assert.equal(await res.text(), 'logged');
      await waitFor(() => /FASTLY_SERVICE_VERSION \S+/.test(serveOutput), 5_000, 'log output');
    });
  });
}
