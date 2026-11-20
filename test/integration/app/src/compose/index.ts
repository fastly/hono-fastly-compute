/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

/// <reference types="@fastly/js-compute" />

// The Compose app of the integration tests.

import { Hono } from 'hono';
import { compose, type PluginEntry } from '@fastly/hono-fastly-compute/compose';
import { host } from './host.js';
import a from './plugins/10-a.js';
import b from './plugins/20-b.js';
import api from './plugins/30-api.js';
import late from './plugins/40-late.js';
import config from './plugins/50-config.js';

// The list of plugins, in file-name order.
export const plugins: PluginEntry[] = [
  { name: 'a', file: 'plugins/10-a.ts', plugin: a },
  { name: 'b', file: 'plugins/20-b.ts', plugin: b },
  { name: 'api', file: 'plugins/30-api.ts', plugin: api },
  { name: 'late', file: 'plugins/40-late.ts', plugin: late },
  { name: 'config', file: 'plugins/50-config.ts', plugin: config },
];

export const composeApp = new Hono();
compose(composeApp, plugins, { host, pluginOptions: { api: { greeting: 'hello' } } });
