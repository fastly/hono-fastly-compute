/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { definePlugin } from '@fastly/hono-fastly-compute/compose';

// A plugin with its own binding. compose's mergeBindings() adds it to the
// bindings of the app.
export default definePlugin({ bindings: { pluginConfig: 'ConfigStore:my_config' } }, {
  routes: (app) => {
    app.get('/plugin-config', (c) => c.json({ value: c.env.pluginConfig?.get('greeting') ?? null }));
  },
});
