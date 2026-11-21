// Runs before each build (npm runs "prebuild" before "build"): bundles the
// plugins of ../hono-compose/ into src/hono-compose.generated.js, which
// src/index.ts imports.
import * as esbuild from 'esbuild';
import { bundlePlugins } from '@fastly/hono-fastly-compute/compose/build';
import { pluginOptions } from '../src/plugin-options.js';

await bundlePlugins({ appDir: process.cwd(), esbuild, dir: '../hono-compose', pluginOptions });
