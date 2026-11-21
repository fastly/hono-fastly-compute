/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { after, before, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as esbuild from 'esbuild';

import {
  DEFAULT_PLUGINS_DIR,
  PLUGINS_MANIFEST,
  bundlePlugins,
  checkProvidedVersions,
  listPlugins,
  pluginsDir,
  pluginsExternals,
  watchPlugins,
  writePluginsStub,
} from '../../src/compose/build/index.js';

// The build writes its messages with console.log() and console.warn(). The
// test runner reads the stdout of this file as its own messages, and some text
// there can stop the runner with 'Unable to deserialize cloned data'. Thus the
// messages are caught for all the tests of this file.
const warnings: string[] = [];
before(() => {
  mock.method(console, 'log', () => {});
  mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args.join(' ')); });
});
after(() => {
  mock.restoreAll();
});

const tempDirs: string[] = [];
function makeDir(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hfc-compose-build-'));
  tempDirs.push(dir);
  for (const [ file, content ] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.resolve(dir, file)), { recursive: true });
    fs.writeFileSync(path.resolve(dir, file), content);
  }
  return dir;
}
after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// An app dir with the given dependencies.
function makeApp(dependencies: Record<string, string>, extra: Record<string, string> = {}): string {
  return makeDir({
    'package.json': JSON.stringify({ name: 'app', dependencies, devDependencies: { esbuild: '0' } }),
    ...extra,
  });
}

const read = (appDir: string, file = PLUGINS_MANIFEST) => fs.readFileSync(path.resolve(appDir, file), 'utf-8');

describe('listPlugins()', () => {
  it('the files directly in the folder, in file-name order', () => {
    const dir = makeDir({
      '20-grip.ts': '',
      '10-auth.js': '',
      'stream.mts': '',
      '_shared.ts': '',
      '.hidden.js': '',
      'types.d.ts': '',
      'notes.md': '',
      'package.json': '{}',
      'lib/helper.ts': '',
      'middleware/old.ts': '',
    });
    assert.deepEqual(listPlugins(dir), [
      { name: 'auth', file: '10-auth.js' },
      { name: 'grip', file: '20-grip.ts' },
      { name: 'stream', file: 'stream.mts' },
    ]);
  });

  it('no folder, or no files: no plugins', () => {
    assert.deepEqual(listPlugins(makeDir()), []);
    assert.deepEqual(listPlugins(path.resolve(makeDir(), 'missing')), []);
  });

  it('two plugins with the same name are an error', () => {
    const dir = makeDir({ '10-grip.js': '', '20-grip.ts': '' });
    assert.throws(() => listPlugins(dir), /10-grip\.js and 20-grip\.ts have the same plugin name 'grip'/);
  });

  it('index is a reserved name', () => {
    for (const file of [ 'index.ts', 'index.js', 'index.mjs', 'index.mts' ]) {
      const root = makeDir({ [`hono-compose/${file}`]: '' });
      assert.throws(() => listPlugins(path.resolve(root, 'hono-compose')),
        new RegExp(`^Error: hono-compose/${file.replace('.', '\\.')}: 'index' is a reserved name in this folder\\. Rename the file, for example to 10-${file.replace('.', '\\.')}\\.$`));
    }
    // With an order prefix, or as a helper, it is not the reserved name.
    assert.deepEqual(listPlugins(makeDir({ '10-index.ts': '', '_index.ts': '', 'lib/index.ts': '', 'index.d.ts': '' })),
      [ { name: 'index', file: '10-index.ts' } ]);
  });
});

describe('pluginsExternals()', () => {
  it('the dependencies of the app and this package, with subpaths, and fastly:*', () => {
    const appDir = makeApp({ hono: '^4', '@fastly/js-compute': '^4' });
    assert.deepEqual(pluginsExternals(appDir), [
      '@fastly/hono-fastly-compute', '@fastly/hono-fastly-compute/*',
      '@fastly/js-compute', '@fastly/js-compute/*',
      'hono', 'hono/*',
      'fastly:*',
    ]);
  });
});

describe('pluginsDir()', () => {
  it('relative to the app directory, with a default', () => {
    assert.equal(DEFAULT_PLUGINS_DIR, './hono-compose');
    assert.equal(pluginsDir({ appDir: '/app' }), path.resolve('/app/hono-compose'));
    assert.equal(pluginsDir({ appDir: '/app', dir: '../plugins' }), path.resolve('/plugins'));
  });
});

describe('checkProvidedVersions()', () => {
  it('a range that does not include the version of the app is a warning', () => {
    const appDir = makeApp({ hono: '^4' }, { 'node_modules/hono/package.json': JSON.stringify({ version: '4.13.14' }) });
    const cases: [ string, boolean ][] = [
      [ '^4.6.0', false ], [ '^4.14.0', true ], [ '~4.13.0', false ], [ '4.13', false ],
      [ '4.12', true ], [ '>=5', true ], [ '*', false ], [ 'workspace:*', false ],
    ];
    for (const [ range, warns ] of cases) {
      const root = makeDir({ 'hono-compose/package.json': JSON.stringify({ peerDependencies: { hono: range } }) });
      const result = checkProvidedVersions(appDir, path.resolve(root, 'hono-compose'));
      assert.equal(result.length, warns ? 1 : 0, range);
      if (warns) {
        assert.match(result[0]!, new RegExp(`^hono-compose/package\\.json expects hono ${range.replace(/[.^*+?]/g, '\\$&')}, but the app provides 4\\.13\\.14\\. The build uses the app's hono\\.$`));
      }
    }
  });

  it('a hint ends each warning', () => {
    const appDir = makeApp({ hono: '^4' }, { 'node_modules/hono/package.json': JSON.stringify({ version: '4.13.14' }) });
    const dir = makeDir({ 'package.json': JSON.stringify({ dependencies: { hono: '^5' } }) });
    assert.match(checkProvidedVersions(appDir, dir, { hint: 'Run: npx tool init' })[0]!, /The build uses the app's hono\. Run: npx tool init$/);
  });

  it('packages that the app does not provide are not checked', () => {
    const appDir = makeApp({ hono: '^4' });
    const dir = makeDir({ 'package.json': JSON.stringify({ dependencies: { '@fanoutio/serve-grip': '^1' } }) });
    assert.deepEqual(checkProvidedVersions(appDir, dir), []);
  });

  it('a prerelease is before its release', () => {
    const appDir = makeApp({ hono: '^4' }, { 'node_modules/hono/package.json': JSON.stringify({ version: '4.14.0-rc.1' }) });
    const dir = makeDir({ 'package.json': JSON.stringify({ dependencies: { hono: '>=4.14.0' } }) });
    assert.equal(checkProvidedVersions(appDir, dir).length, 1);
  });
});

describe('bundlePlugins()', () => {
  it('without the folder: the manifest with no plugins, and its types', async () => {
    const appDir = makeApp({ hono: '^4' });
    assert.equal(await bundlePlugins({ appDir, esbuild }), true);
    assert.match(read(appDir), /^export const plugins = \[\];$/m);
    const types = read(appDir, 'src/hono-compose.generated.d.ts');
    assert.match(types, /^import type \{ PluginEntry \} from '@fastly\/hono-fastly-compute\/compose';$/m);
    assert.match(types, /^export declare const plugins: PluginEntry\[\];$/m);
  });

  it('bundles the plugins, and leaves the packages of the app as imports', async () => {
    const root = makeDir();
    const appDir = path.resolve(root, 'app');
    fs.mkdirSync(appDir);
    fs.writeFileSync(path.resolve(appDir, 'package.json'), JSON.stringify({ dependencies: { hono: '^4' } }));
    for (const [ file, content ] of Object.entries({
      '10-header.ts': `import { createMiddleware } from 'hono/factory';\nimport { tag } from './lib/tag';\nconst x: string = tag;\nexport default { kind: 'plugin', bindings: {}, phases: { middleware: (app) => app.use('*', createMiddleware(async (c, next) => { await next(); c.header('x', x); })) } };\n`,
      'hello.ts': `import { env } from 'fastly:env';\nimport { definePlugin } from '@fastly/hono-fastly-compute/compose';\nexport default definePlugin({ routes: (app) => app.get('/hello', (c) => c.text(env('X'))) });\n`,
      'lib/tag.ts': `export const tag = 'from-lib';\n`,
    })) {
      fs.mkdirSync(path.dirname(path.resolve(root, 'plugins', file)), { recursive: true });
      fs.writeFileSync(path.resolve(root, 'plugins', file), content);
    }

    await bundlePlugins({ appDir, esbuild, dir: '../plugins' });
    const text = read(appDir);
    assert.match(text, /^\/\/ Generated by @fastly\/hono-fastly-compute/);
    assert.match(text, /from "hono\/factory"/, 'hono stays an import');
    assert.match(text, /from "fastly:env"/, 'fastly:* stays an import');
    assert.match(text, /from "@fastly\/hono-fastly-compute\/compose"/, 'this package stays an import');
    assert.match(text, /from-lib/, 'a helper of the folder is bundled');
    assert.doesNotMatch(text, /: string/, 'the types are removed');
    assert.match(text, /name: "header", file: "plugins\/10-header\.ts", plugin: /);
    assert.match(text, /name: "hello", file: "plugins\/hello\.ts", plugin: /);
  });

  it('another manifest', async () => {
    const appDir = makeApp({ hono: '^4' }, { 'hono-compose/a.js': `export default { kind: 'plugin', bindings: {}, phases: { middleware: () => {} } };\n` });
    await bundlePlugins({ appDir, esbuild, manifest: 'gen/plugins.js' });
    assert.match(read(appDir, 'gen/plugins.js'), /name: "a", file: "hono-compose\/a\.js"/);
    assert.match(read(appDir, 'gen/plugins.d.ts'), /export declare const plugins: PluginEntry\[\];/);
  });

  it('warns about options for a plugin that the folder does not have', async () => {
    const appDir = makeApp({ hono: '^4' }, { 'hono-compose/auth.js': `export default { kind: 'plugin', bindings: {}, phases: { middleware: () => {} } };\n` });
    warnings.length = 0;
    await bundlePlugins({ appDir, esbuild, pluginOptions: { auth: {}, grip: {} } });
    assert.deepEqual(warnings, [ `⚠️ pluginOptions.grip: there is no plugin 'grip' in hono-compose/.` ]);
    warnings.length = 0;
    await bundlePlugins({ appDir, esbuild, pluginOptions: { grip: {} }, pluginOptionsSource: 'templateOptions.hono.compose.plugins' });
    assert.deepEqual(warnings, [ `⚠️ templateOptions.hono.compose.plugins.grip: there is no plugin 'grip' in hono-compose/.` ]);
  });

  it('a second bundle with the same plugins does not write the file', async () => {
    const appDir = makeApp({ hono: '^4' }, {
      'hono-compose/hello.js': `export default { kind: 'plugin', bindings: {}, phases: { middleware: () => {} } };\n`,
    });
    assert.equal(await bundlePlugins({ appDir, esbuild }), true);
    const file = path.resolve(appDir, PLUGINS_MANIFEST);
    const mtime = fs.statSync(file).mtimeMs;
    assert.equal(await bundlePlugins({ appDir, esbuild }), false);
    assert.equal(fs.statSync(file).mtimeMs, mtime);
  });
});

// Waits until check() is true, or fails after the timeout.
async function waitFor(check: () => boolean, message: string) {
  const end = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > end) {
      assert.fail(message);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

describe('watchPlugins()', () => {
  const ROUTE = `export default { kind: 'plugin', bindings: {}, phases: { middleware: () => 'ROUTE_MARK' } };\n`;

  it('without the folder: the stub, then the plugins when the folder is made, then the stub when it is removed', async () => {
    const appDir = makeApp({ hono: '^4' });
    const watcher = await watchPlugins({ appDir, esbuild });
    try {
      assert.match(read(appDir), /^export const plugins = \[\];$/m);
      fs.mkdirSync(path.resolve(appDir, 'hono-compose'), { recursive: true });
      fs.writeFileSync(path.resolve(appDir, 'hono-compose/hello.js'), ROUTE);
      await waitFor(() => read(appDir).includes('ROUTE_MARK'), 'the new folder is bundled');
      fs.rmSync(path.resolve(appDir, 'hono-compose'), { recursive: true });
      await waitFor(() => !read(appDir).includes('ROUTE_MARK'), 'the stub after the folder is removed');
    } finally {
      watcher.close();
    }
  });

  it('a new plugin, a changed helper, and a bundle error', async () => {
    const appDir = makeApp({ hono: '^4' }, {
      'hono-compose/hello.js': `import { mark } from './lib/mark.js';\nexport default { kind: 'plugin', bindings: {}, phases: { middleware: () => mark } };\n`,
      'hono-compose/lib/mark.js': `export const mark = 'MARK_ONE';\n`,
    });
    const errors: string[] = [];
    const consoleError = console.error;
    console.error = (...args: unknown[]) => { errors.push(args.join(' ')); };
    const watcher = await watchPlugins({ appDir, esbuild });
    try {
      assert.match(read(appDir), /MARK_ONE/);
      fs.writeFileSync(path.resolve(appDir, 'hono-compose/lib/mark.js'), `export const mark = 'MARK_TWO';\n`);
      await waitFor(() => read(appDir).includes('MARK_TWO'), 'a changed helper is bundled');
      fs.writeFileSync(path.resolve(appDir, 'hono-compose/other.js'), ROUTE);
      await waitFor(() => read(appDir).includes('ROUTE_MARK'), 'a new plugin is bundled');
      fs.writeFileSync(path.resolve(appDir, 'hono-compose/other.js'), 'export default {');
      await waitFor(() => errors.some(e => /Could not bundle the plugins/.test(e)), 'the error is shown');
      assert.match(read(appDir), /ROUTE_MARK/, 'the manifest of the app stays');
    } finally {
      watcher.close();
      console.error = consoleError;
    }
  });
});

describe('writePluginsStub()', () => {
  it('writes the manifest with no plugins, and its types', () => {
    const appDir = makeDir();
    assert.equal(writePluginsStub({ appDir }), true);
    assert.match(read(appDir), /^export const plugins = \[\];$/m);
    assert.ok(fs.existsSync(path.resolve(appDir, 'src/hono-compose.generated.d.ts')));
    assert.equal(writePluginsStub({ appDir }), false);
  });
});
