/// <reference types="@fastly/js-compute" />

import { Hono } from 'hono';
import { buildFire, logFastlyServiceVersion } from '@fastly/hono-fastly-compute';
import { compose, mergeBindings } from '@fastly/hono-fastly-compute/compose';
// The plugins of ../hono-compose/. scripts/prebuild.mjs writes this file
// before each build.
import { plugins } from './hono-compose.generated.js';
import { pluginOptions } from './plugin-options.js';

// The bindings of the app on c.env, for example { config: 'ConfigStore:site_config' },
// and the bindings of the plugins.
const appBindings = {};
const fire = buildFire(mergeBindings(appBindings, plugins));

const app = new Hono<{ Bindings: typeof fire.Bindings }>();

app.use('*', logFastlyServiceVersion());

// The plugins: first the middleware phase of all plugins, then their routes
// phase, in file-name order.
compose(app, plugins, { pluginOptions });

// Add your own routes here, for example:
// app.get('/api/hello', (c) => c.json({ hello: 'world' }));

fire(app);
