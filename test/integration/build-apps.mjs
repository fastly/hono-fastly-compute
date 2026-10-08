/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

// Builds the integration test app once per @fastly/js-compute version in
// sdk-versions.mjs. Expects the library to already be built into ./build.
//
// The library is packed with `npm pack` and installed from the tarball, the way
// users get it, so this also covers the published `files` and `exports`. For
// each SDK version, a copy of ./app is installed with that exact SDK version,
// type-checked against that SDK's types (including app/src/type-assertions.ts),
// and compiled with that SDK's js-compute to bin/main.wasm.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SDK_VERSIONS, WORK_DIR, sdkWorkDir } from './sdk-versions.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const appDir = join(root, 'test/integration/app');

function run(cmd, args, cwd) {
  try {
    execFileSync(cmd, args, { cwd, stdio: 'inherit' });
  } catch (err) {
    // The command's own output, printed above, has the details
    console.error(`\nFailed: ${cmd} ${args.join(' ')} (in ${cwd})`);
    process.exit(err.status ?? 1);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

mkdirSync(WORK_DIR, { recursive: true });
// stdout is captured only here, for the JSON; other commands print their output (and errors) directly
const packOutput = execFileSync('npm', ['pack', '--json', '--pack-destination', WORK_DIR], {
  cwd: root,
  encoding: 'utf-8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const [packed] = JSON.parse(packOutput);
const tarball = join(WORK_DIR, packed.filename);

// The app uses the same hono version as this repo's devDependency
const honoVersion = readJson(join(root, 'node_modules/hono/package.json')).version;

for (const version of SDK_VERSIONS) {
  const dir = sdkWorkDir(version);
  console.log(`Building integration app with @fastly/js-compute@${version} in ${dir}`);

  cpSync(appDir, dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
    dependencies: {
      '@fastly/hono-fastly-compute': `file:${tarball}`,
      '@fastly/js-compute': version,
      'hono': honoVersion,
    },
  }, null, 2));
  run('npm', ['install', '--no-audit', '--no-fund'], dir);

  const installed = readJson(join(dir, 'node_modules/@fastly/js-compute/package.json')).version;
  console.log(`  installed @fastly/js-compute@${installed}`);

  run(join(root, 'node_modules/.bin/tsc'), ['-p', '.'], dir);
  run(join(dir, 'node_modules/.bin/js-compute'), ['src/index.ts', 'bin/main.wasm'], dir);
}
