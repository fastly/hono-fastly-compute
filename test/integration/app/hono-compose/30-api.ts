/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { definePlugin } from '@fastly/hono-fastly-compute/compose';

type ApiOptions = { greeting: string };

// The routes phase: these routes win over the files. The options come from
// pluginOptions, and the helpers from the host.
export default definePlugin<ApiOptions>({
  routes: (app, options, helpers) => {
    app.get('/shadowed', (c) => c.text('route:shadowed'));
    app.get('/info', (c) => c.json({ greeting: options?.greeting ?? null, helpers: helpers.tag }));
  },
});
