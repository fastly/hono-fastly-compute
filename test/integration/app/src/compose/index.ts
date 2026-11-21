/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

/// <reference types="@fastly/js-compute" />

// The Compose app of the integration tests.

import { Hono } from 'hono';
import { compose } from '@fastly/hono-fastly-compute/compose';
import { host } from './host.js';
// The plugins of hono-compose/. scripts/prebuild.mjs writes this file.
import { plugins } from '../hono-compose.generated.js';

export { plugins };

export const composeApp = new Hono();
compose(composeApp, plugins, { host, pluginOptions: { api: { greeting: 'hello' } } });
