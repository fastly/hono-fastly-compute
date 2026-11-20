/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

import {
  CORE_PHASES,
  DEFAULT_HOST,
  compose,
  defineComposeHost,
  definePlugin,
  mergeBindings,
  type PluginEntry,
} from '../../src/compose/index.js';

const entry = (file: string, plugin: unknown): PluginEntry => ({
  name: file.replace(/^(\d+-)?/, '').replace(/\.\w+$/, ''),
  file: `hono-compose/${file}`,
  plugin: plugin as PluginEntry['plugin'],
});

// A host with a step between two phases, as the host of a static site.
const filesHost = (log: string[]) => defineComposeHost({
  steps: [
    CORE_PHASES,
    // As a real files step: a file answers, or the request goes on with next().
    [ 'files', (app) => app.use('*', async (c, next) => { log.push('files'); return c.req.path === '/file' ? c.text('file') : next(); }) ],
    'afterFilesRoutes',
    [ 'fallback', (app) => app.notFound((c) => { log.push('fallback'); return c.text('fallback', 404); }) ],
  ],
  helpers: { tag: 'helpers' },
});

describe('definePlugin()', () => {
  it('a function is the middleware phase', () => {
    const fn = () => {};
    assert.deepEqual(definePlugin(fn), { kind: 'plugin', bindings: {}, phases: { middleware: fn } });
    assert.deepEqual(definePlugin({ bindings: { grip: 'SecretStore:grip' } }, fn),
      { kind: 'plugin', bindings: { grip: 'SecretStore:grip' }, phases: { middleware: fn } });
  });

  it('an object has a function for each phase', () => {
    const a = () => {};
    const b = () => {};
    assert.deepEqual(definePlugin({ middleware: a, routes: b }), { kind: 'plugin', bindings: {}, phases: { middleware: a, routes: b } });
    assert.deepEqual(definePlugin({ bindings: { kv: 'KVStore' } }, { routes: a }),
      { kind: 'plugin', bindings: { kv: 'KVStore' }, phases: { routes: a } });
  });
});

describe('defineComposeHost()', () => {
  it('CORE_PHASES is the phases middleware and routes', () => {
    assert.deepEqual(DEFAULT_HOST.phases, [ 'middleware', 'routes' ]);
    assert.deepEqual(DEFAULT_HOST.steps, [ { kind: 'phase', name: 'middleware' }, { kind: 'phase', name: 'routes' } ]);
    assert.deepEqual(DEFAULT_HOST.helpers, {});
  });

  it('keeps the order of the list, with phases and host steps', () => {
    const fn = () => {};
    const host = defineComposeHost({ steps: [ [ 'before', fn ], CORE_PHASES, [ 'files', fn ], 'afterFilesRoutes' ], helpers: { a: 1 } });
    assert.deepEqual(host.steps.map(step => `${step.kind}:${step.name}`),
      [ 'step:before', 'phase:middleware', 'phase:routes', 'step:files', 'phase:afterFilesRoutes' ]);
    assert.deepEqual(host.phases, [ 'middleware', 'routes', 'afterFilesRoutes' ]);
    assert.deepEqual(host.helpers, { a: 1 });
  });

  it('CORE_PHASES must be in the list exactly once', () => {
    assert.throws(() => defineComposeHost({ steps: [ 'routes2' ] }), /must have CORE_PHASES exactly once, but have it 0 times\./);
    assert.throws(() => defineComposeHost({ steps: [ CORE_PHASES, CORE_PHASES ] }), /but have it 2 times\./);
  });

  it('each name is once in the list', () => {
    assert.throws(() => defineComposeHost({ steps: [ CORE_PHASES, 'routes' ] }), /the name 'routes' is in the steps more than once\./);
    assert.throws(() => defineComposeHost({ steps: [ CORE_PHASES, [ 'a', () => {} ], 'a' ] }), /the name 'a' is in the steps more than once\./);
  });

  it('an entry that is not correct is an error', () => {
    assert.throws(() => defineComposeHost({ steps: [ CORE_PHASES, '' ] }), /the name of a step must not be empty\./);
    assert.throws(() => defineComposeHost({ steps: [ CORE_PHASES, [ 'files' ] ] as any }), /steps\[1\] must be CORE_PHASES, the name of a phase, or \[ name, fn \]\./);
    assert.throws(() => defineComposeHost({ steps: [ CORE_PHASES, 42 ] as any }), /steps\[1\]/);
    assert.throws(() => defineComposeHost({ steps: 'x' } as any), /steps must be an array\./);
  });
});

describe('mergeBindings()', () => {
  const auth = definePlugin({ bindings: { secrets: 'SecretStore:auth', config: 'ConfigStore:site' } }, () => {});
  const stream = definePlugin({ bindings: { config: 'ConfigStore:site' } }, { routes: () => {} });

  it('merges the bindings of the app and of the plugins', () => {
    assert.deepEqual(
      mergeBindings({ kv: 'KVStore' }, [ entry('10-auth.ts', auth), entry('stream.ts', stream) ]),
      { kv: 'KVStore', secrets: 'SecretStore:auth', config: 'ConfigStore:site' },
    );
    assert.deepEqual(mergeBindings(undefined, []), {});
  });

  it('one name with two resources is an error that names both sources', () => {
    assert.throws(
      () => mergeBindings({ config: 'ConfigStore:other' }, [ entry('10-auth.ts', auth) ]),
      /The binding 'config' is 'ConfigStore:other' in the bindings of the app, but 'ConfigStore:site' in hono-compose\/10-auth\.ts\./,
    );
    assert.throws(
      () => mergeBindings({ config: 'ConfigStore:other' }, [ entry('10-auth.ts', auth) ], { appBindingsSource: 'templateOptions.hono.bindings' }),
      /is 'ConfigStore:other' in templateOptions\.hono\.bindings, but/,
    );
  });

  it('a binding name of Object.prototype is an ordinary name', () => {
    const odd = definePlugin({ bindings: { toString: 'KVStore:a', constructor: 'ConfigStore:b' } }, () => {});
    assert.deepEqual(mergeBindings({}, [ entry('odd.ts', odd) ]), { toString: 'KVStore:a', constructor: 'ConfigStore:b' });
    assert.throws(
      () => mergeBindings({ toString: 'KVStore:other' as const }, [ entry('odd.ts', odd) ]),
      /The binding 'toString' is 'KVStore:other' in the bindings of the app, but 'KVStore:a' in hono-compose\/odd\.ts\./,
    );
  });

  it('a file must default-export definePlugin()', () => {
    assert.throws(() => mergeBindings({}, [ entry('x.ts', async () => {}) ]),
      /hono-compose\/x\.ts: the default export must be definePlugin\(…\)\./);
    assert.throws(() => mergeBindings({}, [ entry('z.ts', undefined) ]), /definePlugin/);
  });
});

describe('compose()', () => {
  it('runs the phases and the host steps in the order of the list', async () => {
    const log: string[] = [];
    const app = new Hono();
    // No host is registered for the types of the unit tests, so the object of
    // phases has a cast for afterFilesRoutes.
    const trace = (name: string) => definePlugin({
      middleware: (app: Hono) => app.use('*', async (_c, next) => { log.push(`${name}:in`); await next(); log.push(`${name}:out`); }),
      routes: (app: Hono) => app.get(`/${name}`, (c) => { log.push(`${name}:route`); return c.text(name); }),
      afterFilesRoutes: (app: Hono) => app.get('/late', (c) => { log.push(`${name}:late`); return c.text(`late ${name}`); }),
    } as any);
    compose(app, [ entry('10-a.ts', trace('a')), entry('20-b.ts', trace('b')) ], { host: filesHost(log) });

    // The middleware of each plugin wraps the routes of all plugins, and runs
    // after next() in the reverse order.
    assert.equal(await (await app.request('/b')).text(), 'b');
    assert.deepEqual(log, [ 'a:in', 'b:in', 'b:route', 'b:out', 'a:out' ]);

    // A file wins over afterFilesRoutes.
    log.length = 0;
    assert.equal(await (await app.request('/file')).text(), 'file');
    assert.deepEqual(log, [ 'a:in', 'b:in', 'files', 'b:out', 'a:out' ]);

    // afterFilesRoutes: when no file matches. The first route that answers wins.
    log.length = 0;
    assert.equal(await (await app.request('/late')).text(), 'late a');
    assert.deepEqual(log, [ 'a:in', 'b:in', 'files', 'a:late', 'b:out', 'a:out' ]);

    // Nothing answers: the fallback step of the host.
    log.length = 0;
    const res = await app.request('/nothing');
    assert.equal(res.status, 404);
    assert.equal(await res.text(), 'fallback');
  });

  it('gives each phase function the options of its plugin and the helpers of the host', () => {
    const calls: unknown[] = [];
    const plugin = definePlugin((_app, options, helpers) => { calls.push({ options, helpers }); });
    compose(new Hono(), [ entry('10-auth.ts', plugin), entry('stream.ts', plugin) ], {
      host: filesHost([]),
      pluginOptions: { auth: { realm: 'x' } },
    });
    assert.deepEqual(calls, [
      { options: { realm: 'x' }, helpers: { tag: 'helpers' } },
      { options: undefined, helpers: { tag: 'helpers' } },
    ]);
  });

  it('a name of Object.prototype has no options', () => {
    let seen: unknown = 'not called';
    compose(new Hono(), [ entry('toString.ts', definePlugin((_app, options) => { seen = options; })) ], { pluginOptions: {} });
    assert.equal(seen, undefined);
  });

  it('without a host: middleware and routes', async () => {
    const app = new Hono();
    compose(app, [ entry('a.ts', definePlugin({ routes: (app) => app.get('/', (c) => c.text('ok')) })) ]);
    assert.equal(await (await app.request('/')).text(), 'ok');
  });

  it('a phase that the host does not have is an error that names the file', () => {
    const late = definePlugin({ afterFilesRoutes: () => {} } as any);
    assert.throws(() => compose(new Hono(), [ entry('b.ts', late) ]),
      /hono-compose\/b\.ts: definePlugin\(\) needs a function, or an object with a function for one or more of the phases middleware, routes\. 'afterFilesRoutes' is not a phase of this app\.$/);
    assert.throws(() => compose(new Hono(), [ entry('d.ts', definePlugin({ before: () => {}, after: () => {} } as any)) ]),
      /'before', 'after' are not phases of this app\.$/);
    assert.throws(() => compose(new Hono(), [ entry('e.ts', definePlugin({ toString: () => {} } as any)) ]),
      /'toString' is not a phase of this app\.$/);
  });

  it('phases that are not correct are an error', () => {
    assert.throws(() => compose(new Hono(), [ entry('a.ts', definePlugin({})) ]),
      /hono-compose\/a\.ts: definePlugin\(\) needs a function, or an object with a function for one or more of the phases middleware, routes\.$/);
    assert.throws(() => compose(new Hono(), [ entry('c.ts', definePlugin({ bindings: {} }, { routes: 'x' } as any)) ]),
      /hono-compose\/c\.ts: the phase routes must be a function\./);
    assert.throws(() => compose(new Hono(), [ entry('x.ts', async () => {}) ]), /the default export must be definePlugin/);
  });

  it('a host must be the value of defineComposeHost()', () => {
    assert.throws(() => compose(new Hono(), [], { host: { steps: [] } as any }), /host must be the value of defineComposeHost\(\)\./);
  });

  it('checks all plugins before it adds anything to the app', () => {
    const app = new Hono();
    let added = false;
    const good = definePlugin(() => { added = true; });
    assert.throws(() => compose(app, [ entry('a.ts', good), entry('b.ts', definePlugin({ nope: () => {} } as any)) ]));
    assert.equal(added, false);
  });
});
