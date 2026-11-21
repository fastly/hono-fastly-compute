/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

// The examples of examples/compose/: puts each one into a copy of the base app
// (examples/compose/app: compute-js/ and hono-compose/), as the README of an
// example shows, with this package from `npm pack`. Then it builds the app,
// type-checks the app and the plugins, runs the app with `fastly compute
// serve`, and sends it requests. Needs the Fastly CLI and
// network access for `npm install`. The GRIP test also needs Pushpin on the
// PATH. These tests need no credentials.
//
// The last test deploys both examples to a real service, and needs the
// variables in the README ("Example tests"). THE TEST REPLACES THE ACTIVE
// VERSION OF THE SERVICE.
//
// Use `npm run test:examples`, which builds the package first.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { type ChildProcess, execFileSync, spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXAMPLES_DIR = path.resolve(ROOT, 'examples/compose');
const WORK_DIR = path.resolve(ROOT, 'test/examples/.work');
const fastlyCli = process.env.FASTLY_CLI ?? 'fastly';

function run(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(`Failed: ${cmd} ${args.join(' ')} (in ${cwd})\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function skipUnlessFastlyCli(): string | false {
  const result = spawnSync(fastlyCli, [ 'version' ], { stdio: 'ignore' });
  return result.error != null || result.status !== 0 ? 'the Fastly CLI is not on the PATH (or set FASTLY_CLI)' : false;
}

function skipUnlessPushpin(): string | false {
  const result = spawnSync('pushpin', [ '--version' ], { stdio: 'ignore' });
  return result.error != null || result.status !== 0 ? 'Pushpin (pushpin) is not on the PATH' : skipUnlessFastlyCli();
}

function skipUnlessEnv(...names: string[]): string | false {
  const missing = names.filter(name => !process.env[name]);
  return missing.length > 0 ? `not set: ${missing.join(', ')}` : false;
}

// The package from `npm pack`, once for all tests. Expects ./build.
let tarball: string | undefined;
function packedPackage(): string {
  if (tarball == null) {
    fs.mkdirSync(WORK_DIR, { recursive: true });
    const output = execFileSync('npm', [ 'pack', '--json', '--pack-destination', WORK_DIR ], {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: [ 'ignore', 'pipe', 'inherit' ],
    });
    tarball = path.resolve(WORK_DIR, JSON.parse(output)[0].filename);
  }
  return tarball;
}

// A plugin of the tests, in place of the pages of a site: /docs/… (also with
// a preview prefix) is the page Docs, and all other paths are the page Home.
// Its name sorts after the names of the examples, so that their routes win.
const TEST_PAGES = `import { definePlugin } from '@fastly/hono-fastly-compute/compose';

export default definePlugin({
  routes: (app) => {
    app.get('*', (c) => {
      const path = c.req.path.replace(/^\\/_preview\\/[^/]+(?=\\/|$)/, '');
      return c.html(path === '/docs' || path.startsWith('/docs/') ? '<h1>Docs</h1>' : '<h1>Home</h1>');
    });
  },
});
`;

type ExampleAppOptions = {
  // The options of the plugins, for src/plugin-options.js.
  pluginOptions: Record<string, unknown>,
  // TOML that the test adds to fastly.toml, for example local_server settings.
  fastlyToml?: string,
};

// Makes an app from the base app (compute-js/ and hono-compose/ next to it)
// with the examples in hono-compose/, as the README of an example shows:
// - one example: replaces hono-compose/ with the hono-compose/ folder of the
//   example;
// - more than one: copies the plugins of each example into hono-compose/, and
//   adds the dependencies of each example to its package.json.
// Then it installs the packages in both directories, builds the app, and
// type-checks both. Returns the directory of the app (compute-js/).
function makeExampleApp(caseName: string, names: string[], options: ExampleAppOptions): string {
  const root = path.resolve(WORK_DIR, caseName);
  fs.rmSync(root, { recursive: true, force: true });
  fs.cpSync(path.resolve(EXAMPLES_DIR, 'app'), root, {
    recursive: true,
    filter: (src) => !src.split(path.sep).includes('node_modules'),
  });
  const appDir = path.resolve(root, 'compute-js');
  const pluginsDir = path.resolve(root, 'hono-compose');
  const exampleDir = (name: string) => path.resolve(EXAMPLES_DIR, name, 'hono-compose');

  const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf-8'));
  const writeJson = (file: string, value: unknown) => fs.writeFileSync(file, JSON.stringify(value, null, 2));

  if (names.length === 1) {
    fs.rmSync(pluginsDir, { recursive: true });
    fs.cpSync(exampleDir(names[0]!), pluginsDir, { recursive: true });
  } else {
    fs.rmSync(path.resolve(pluginsDir, 'hello.ts'));
    const pluginsPackageJson = readJson(path.resolve(pluginsDir, 'package.json'));
    for (const name of names) {
      for (const entry of fs.readdirSync(exampleDir(name))) {
        if (![ 'package.json', 'tsconfig.json', '.gitignore' ].includes(entry)) {
          fs.cpSync(path.resolve(exampleDir(name), entry), path.resolve(pluginsDir, entry), { recursive: true });
        }
      }
      pluginsPackageJson.dependencies = { ...pluginsPackageJson.dependencies, ...readJson(path.resolve(exampleDir(name), 'package.json')).dependencies };
    }
    writeJson(path.resolve(pluginsDir, 'package.json'), pluginsPackageJson);
  }
  fs.writeFileSync(path.resolve(pluginsDir, 'zz-test-pages.ts'), TEST_PAGES);
  fs.writeFileSync(path.resolve(appDir, 'src/plugin-options.js'), `export const pluginOptions = ${JSON.stringify(options.pluginOptions, null, 2)};\n`);
  if (options.fastlyToml != null) {
    fs.appendFileSync(path.resolve(appDir, 'fastly.toml'), `\n${options.fastlyToml}`);
  }

  // This package from `npm pack`, in place of the version on npm (0.5.0 is not
  // on npm yet). In hono-compose/, it is a peer dependency, which npm installs
  // from the registry. Thus the test moves it to devDependencies, with the
  // tarball.
  const appPackageJson = readJson(path.resolve(appDir, 'package.json'));
  appPackageJson.dependencies['@fastly/hono-fastly-compute'] = `file:${packedPackage()}`;
  writeJson(path.resolve(appDir, 'package.json'), appPackageJson);
  const pluginsPackageJson = readJson(path.resolve(pluginsDir, 'package.json'));
  delete pluginsPackageJson.peerDependencies['@fastly/hono-fastly-compute'];
  pluginsPackageJson.devDependencies = { ...pluginsPackageJson.devDependencies, '@fastly/hono-fastly-compute': `file:${packedPackage()}` };
  writeJson(path.resolve(pluginsDir, 'package.json'), pluginsPackageJson);

  run('npm', [ 'install', '--no-audit', '--no-fund' ], appDir);
  run('npm', [ 'install', '--no-audit', '--no-fund' ], pluginsDir);
  // npm runs the prebuild script before the build.
  run('npm', [ 'run', 'build' ], appDir);
  const tsc = path.resolve(ROOT, 'node_modules/.bin/tsc');
  run(tsc, [ '-p', '.' ], appDir);
  run(tsc, [ '-p', '.' ], pluginsDir);
  return appDir;
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

type Server = { baseUrl: string, stop: () => Promise<void>, output: () => string };

// Runs `fastly compute serve` for an app that is built. fastlyToml(addr) can
// add settings that need the address of the server.
async function startServe(dir: string, env: NodeJS.ProcessEnv, fastlyToml?: (addr: string) => string): Promise<Server> {
  const port = await getFreePort();
  const addr = `127.0.0.1:${port}`;
  if (fastlyToml != null) {
    fs.appendFileSync(path.resolve(dir, 'fastly.toml'), `\n${fastlyToml(addr)}`);
  }
  let output = '';
  // Its own process group, so that the CLI and the processes that it starts
  // (Viceroy, Pushpin) stop together.
  const child: ChildProcess = spawn(fastlyCli, [ 'compute', 'serve', '--skip-build', '--file', 'bin/main.wasm', '--addr', addr ], {
    cwd: dir,
    env: { ...process.env, ...env },
    detached: true,
    stdio: [ 'ignore', 'pipe', 'pipe' ],
  });
  child.stdout!.on('data', (chunk) => { output += chunk; });
  child.stderr!.on('data', (chunk) => { output += chunk; });
  const baseUrl = `http://${addr}`;
  const end = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode != null) {
      throw new Error(`fastly compute serve exited (${child.exitCode}):\n${output}`);
    }
    try {
      await fetch(`${baseUrl}/`, { redirect: 'manual' });
      break;
    } catch {
      if (Date.now() > end) {
        throw new Error(`fastly compute serve did not start:\n${output}`);
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  return {
    baseUrl,
    output: () => output,
    stop: async () => {
      fs.writeFileSync(path.resolve(dir, 'serve.log'), output);
      if (child.pid != null && child.exitCode == null) {
        process.kill(-child.pid, 'SIGTERM');
        await new Promise(resolve => child.once('exit', resolve));
      }
    },
  };
}

// A request without following a redirect.
async function request(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers, redirect: 'manual' });
  return { status: res.status, headers: res.headers, setCookie: res.headers.getSetCookie(), body: await res.text() };
}

// Opens a streaming GET request, and keeps the body that arrives.
function openStream(url: string) {
  let body = '';
  let response: http.IncomingMessage | undefined;
  const client = new URL(url).protocol === 'https:' ? https : http;
  const req = client.get(url, (res) => {
    response = res;
    res.setEncoding('utf-8');
    res.on('data', (chunk) => { body += chunk; });
  });
  req.on('error', () => {});
  return {
    status: () => response?.statusCode,
    headers: () => response?.headers,
    body: () => body,
    close: () => req.destroy(),
  };
}

async function waitFor(check: () => boolean, message: string, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > end) {
      assert.fail(message);
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

// A session cookie of the OAuth example, signed as setSignedCookie() of
// hono/cookie does.
function makeSessionCookie(id: string, { key, exp = Math.floor(Date.now() / 1000) + 600, accountId = 'github-id:1' }: { key: string, exp?: number, accountId?: string }) {
  const value = JSON.stringify({ id, accountId, name: 'E2E', exp });
  const signature = crypto.createHmac('sha256', key).update(value).digest('base64');
  return `session=${encodeURIComponent(`${value}.${signature}`)}`;
}

describe('the GRIP example, with Pushpin', { skip: skipUnlessPushpin() }, () => {
  const PUBLISH_KEY = 'e2e-publish-key';
  let server: Server | undefined;

  before(async () => {
    const dir = makeExampleApp('grip', [ 'grip' ], {
      pluginOptions: {},
      fastlyToml: [
        '[local_server.pushpin]',
        'enable = true',
        '',
        '[local_server.secret_stores]',
        'grip = [',
        '  { key = "GRIP_URL", env = "GRIP_URL" },',
        '  { key = "GRIP_VERIFY_KEY", env = "GRIP_VERIFY_KEY" },',
        '  { key = "PUBLISH_KEY", env = "PUBLISH_KEY" },',
        ']',
        '',
      ].join('\n'),
    });
    server = await startServe(dir, {
      GRIP_URL: 'http://localhost:5561/?verify-iss=viceroy',
      GRIP_VERIFY_KEY: 'viceroy_dev_signing_key_dont_use_in_production',
      PUBLISH_KEY,
    }, (addr) => [
      // The backend 'self' is the address of the local server.
      '[local_server.backends.self]',
      `url = "http://${addr}/"`,
      `override_host = "${addr}"`,
      '',
    ].join('\n'));
  }, { timeout: 600_000 });

  after(async () => {
    await server?.stop();
  });

  const publish = (channel: string, body: string, key: string | null = PUBLISH_KEY) => fetch(`${server!.baseUrl}/publish/${channel}`, {
    method: 'POST',
    headers: key != null ? { authorization: `Bearer ${key}` } : {},
    body,
  });

  it('the other paths of the app do not go through Fanout', async () => {
    const res = await request(`${server!.baseUrl}/`);
    assert.equal(res.status, 200);
    assert.match(res.body, /<h1>Home<\/h1>/);
  });

  it('a stream and an SSE connection get a published message', async () => {
    const stream = openStream(`${server!.baseUrl}/events/stream/e2e`);
    const sse = openStream(`${server!.baseUrl}/events/sse/e2e`);
    try {
      await waitFor(() => stream.body().includes('[stream open]') && sse.body().includes(':open'), 'the streams did not open');
      assert.equal(stream.status(), 200);
      assert.match(String(sse.headers()?.['content-type']), /^text\/event-stream/);
      const res = await publish('e2e', 'hello\nworld');
      assert.equal(res.status, 200, await res.text());
      await waitFor(() => stream.body().includes('world\n') && sse.body().includes('data: world\n'), 'the message did not arrive');
      assert.equal(stream.body(), '[stream open]\nhello\nworld\n');
      assert.equal(sse.body(), ':open\n\ndata: hello\ndata: world\n\n');
    } finally {
      stream.close();
      sse.close();
    }
  });

  it('publish without the key, or with a wrong key, is 401', async () => {
    assert.equal((await publish('e2e', 'x', null)).status, 401);
    assert.equal((await publish('e2e', 'x', 'wrong-key')).status, 401);
  });

  it('a request that did not come through Fanout is refused', async () => {
    const res = await request(`${server!.baseUrl}/events/stream/e2e`, { 'grip-sig': 'not-a-signature' });
    assert.equal(res.status, 400);
  });
});

describe('the OAuth example', { skip: skipUnlessFastlyCli() }, () => {
  const SESSION_KEY = 'e2e-session-key-0123456789';
  let server: Server | undefined;

  before(async () => {
    const dir = makeExampleApp('oauth', [ 'oauth' ], {
      pluginOptions: {
        oauth: {
          // The login path is also protected, so the login check must let it through.
          protect: [ '/docs/*', '/signin' ],
          login: '/signin',
          allowedUsers: [ 'github:octocat', 'github-id:42' ],
          github: { clientId: 'e2e-github-client' },
          google: { clientId: 'e2e-google-client' },
        },
      },
      fastlyToml: [
        '[local_server.secret_stores]',
        'oauth = [',
        '  { key = "SESSION_KEY", env = "SESSION_KEY" },',
        '  { key = "GITHUB_CLIENT_SECRET", env = "GITHUB_CLIENT_SECRET" },',
        '  { key = "GOOGLE_CLIENT_SECRET", env = "GOOGLE_CLIENT_SECRET" },',
        ']',
        '',
      ].join('\n'),
    });
    server = await startServe(dir, { SESSION_KEY, GITHUB_CLIENT_SECRET: 'not-a-real-secret', GOOGLE_CLIENT_SECRET: 'not-a-real-secret' });
  }, { timeout: 600_000 });

  after(async () => {
    await server?.stop();
  });

  const sessionCookie = (id: string, options: { key?: string, exp?: number, accountId?: string } = {}) =>
    makeSessionCookie(id, { key: SESSION_KEY, ...options });
  const get = (pathname: string, headers: Record<string, string> = {}) => request(server!.baseUrl + pathname, headers);

  it('a path that is not protected needs no login', async () => {
    assert.equal((await get('/')).status, 200);
  });

  it('a protected path without a session goes to the login, and keeps the path', async () => {
    const res = await get('/docs/');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/signin');
    assert.ok(res.setCookie.some(x => x.startsWith('oauth_return_to=%2Fdocs%2F;')));
  });

  it('protect is a path prefix', async () => {
    assert.equal((await get('/docs')).status, 302);
    assert.notEqual((await get('/docsx')).status, 302);
  });

  it('the login path is not checked, also when protect has it', async () => {
    assert.notEqual((await get('/signin')).status, 302);
  });

  it('a path with the preview prefix needs the same login (PREVIEW_PREFIX)', async () => {
    const res = await get('/_preview/live/docs/');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/signin');
    const allowed = await get('/_preview/live/docs/', { cookie: sessionCookie('github:octocat') });
    assert.equal(allowed.status, 200);
    assert.match(allowed.body, /<h1>Docs<\/h1>/);
  });

  it('the login routes go to GitHub and Google with the client ID', async () => {
    const github = await get('/auth/github');
    assert.equal(github.status, 302);
    assert.match(String(github.headers.get('location')), /^https:\/\/github\.com\/login\/oauth\/authorize\?client_id=e2e-github-client&/);
    const google = await get('/auth/google');
    assert.equal(google.status, 302);
    assert.match(String(google.headers.get('location')), /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?.*client_id=e2e-google-client/);
  });

  it('a callback with a state that does not match is 401', async () => {
    const res = await get('/auth/github?code=fake&state=one', { cookie: 'state=two' });
    assert.equal(res.status, 401);
  });

  it('a session of an allowed user gets the page, with Cache-Control: private', async () => {
    const res = await get('/docs/', { cookie: sessionCookie('github:octocat') });
    assert.equal(res.status, 200);
    assert.match(res.body, /<h1>Docs<\/h1>/);
    assert.equal(res.headers.get('cache-control'), 'private');
  });

  it('another user gets 403', async () => {
    assert.equal((await get('/docs/', { cookie: sessionCookie('github:someone-else') })).status, 403);
  });

  it('allowedUsers can have the account ID, which does not change with the name', async () => {
    assert.equal((await get('/docs/', { cookie: sessionCookie('github:new-name', { accountId: 'github-id:42' }) })).status, 200);
  });

  it('a session with a wrong signature, or an expired one, goes to the login', async () => {
    assert.equal((await get('/docs/', { cookie: sessionCookie('github:octocat', { key: 'wrong-key' }) })).status, 302);
    assert.equal((await get('/docs/', { cookie: sessionCookie('github:octocat', { exp: 1 }) })).status, 302);
  });

  it('logout deletes the session cookie', async () => {
    const res = await get('/auth/logout');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/');
    assert.ok(res.setCookie.some(x => /^session=; Max-Age=0;/.test(x)));
  });
});

// Both examples in one app on a real service, with Fastly Fanout. The service
// must have:
// - Fanout turned on, and the backend 'self' to its own domain;
// - one Secret Store, linked with the names 'grip' and 'oauth', with the
//   entries PUBLISH_KEY (= HFC_TEST_GRIP_PUBLISH_KEY), FANOUT_API_TOKEN (an
//   API token that can publish to Fanout for the service), SESSION_KEY (=
//   HFC_TEST_OAUTH_SESSION_KEY), and GITHUB_CLIENT_SECRET (any value).
describe('the GRIP and OAuth examples, deployed', {
  skip: skipUnlessEnv(
    'FASTLY_API_TOKEN', 'HFC_TEST_DEPLOY_SERVICE_ID', 'HFC_TEST_DEPLOY_URL',
    'HFC_TEST_GRIP_PUBLISH_KEY', 'HFC_TEST_OAUTH_SESSION_KEY',
  ) || skipUnlessFastlyCli(),
}, () => {
  const baseUrl = process.env.HFC_TEST_DEPLOY_URL?.replace(/\/+$/, '') ?? '';
  const channel = `e2e-${Date.now().toString(36)}`;

  before(async () => {
    const dir = makeExampleApp('deployed', [ 'grip', 'oauth' ], {
      pluginOptions: { oauth: { protect: '/docs/*', allowedUsers: [ 'github:octocat' ], github: { clientId: 'e2e-github-client' } } },
    });
    // The package for the deploy (pkg/), with the build script of fastly.toml.
    run(fastlyCli, [ 'compute', 'build', '--non-interactive' ], dir);
    run(fastlyCli, [
      'compute', 'deploy', '--non-interactive',
      '--service-id', process.env.HFC_TEST_DEPLOY_SERVICE_ID!,
      '--package', 'pkg/hono-compose-app.tar.gz',
      '--comment', `hono-fastly-compute example test ${channel}`,
    ], dir);

    // Wait until the new version of the app answers.
    const end = Date.now() + 300_000;
    while ((await request(`${baseUrl}/auth/logout`)).status !== 302) {
      assert.ok(Date.now() < end, 'the app did not start to answer');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }, { timeout: 900_000 });

  it('GRIP: a stream and an SSE connection get a message through Fanout', async () => {
    const stream = openStream(`${baseUrl}/events/stream/${channel}`);
    const sse = openStream(`${baseUrl}/events/sse/${channel}`);
    try {
      await waitFor(() => stream.body().includes('[stream open]') && sse.body().includes(':open'), 'the streams did not open');
      const publish = (key: string) => fetch(`${baseUrl}/publish/${channel}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
        body: 'hello\nworld',
      });
      assert.equal((await publish('wrong-key')).status, 401);
      const res = await publish(process.env.HFC_TEST_GRIP_PUBLISH_KEY!);
      assert.equal(res.status, 200, await res.text());
      await waitFor(() => stream.body().includes('world\n') && sse.body().includes('data: world\n'), 'the message did not arrive');
      assert.equal(stream.body(), '[stream open]\nhello\nworld\n');
      assert.equal(sse.body(), ':open\n\ndata: hello\ndata: world\n\n');
    } finally {
      stream.close();
      sse.close();
    }
  });

  it('OAuth: a callback with a fake code gets an error from GitHub', async () => {
    const start = await request(`${baseUrl}/auth/github`);
    assert.equal(start.status, 302);
    const state = new URL(String(start.headers.get('location'))).searchParams.get('state') ?? '';
    const cookie = start.setCookie.map(x => x.split(';')[0]).join('; ');
    const res = await request(`${baseUrl}/auth/github?code=fake&state=${encodeURIComponent(state)}`, { cookie });
    // 400 comes from the answer of GitHub. Thus the app could call GitHub.
    assert.equal(res.status, 400, res.body);
  });

  it('OAuth: the session of an allowed user goes through the login check', async () => {
    const key = process.env.HFC_TEST_OAUTH_SESSION_KEY!;
    assert.equal((await request(`${baseUrl}/docs/`)).status, 302);
    assert.equal((await request(`${baseUrl}/docs/`, { cookie: makeSessionCookie('github:someone-else', { key }) })).status, 403);
    const res = await request(`${baseUrl}/docs/`, { cookie: makeSessionCookie('github:octocat', { key }) });
    assert.equal(res.status, 200);
    assert.match(res.body, /<h1>Docs<\/h1>/);
    assert.equal(res.headers.get('cache-control'), 'private');
  });
});
