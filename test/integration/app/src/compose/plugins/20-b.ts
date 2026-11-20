/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { definePlugin } from '@fastly/hono-fastly-compute/compose';

// As 10-a, with 'b'. Also a route that shows the trace.
export default definePlugin({
  middleware: (app) => {
    app.use('*', async (c, next) => {
      c.set('trace', [ ...(c.get('trace') ?? []), 'b' ]);
      await next();
      c.res.headers.append('x-out', 'b');
    });
  },
  routes: (app) => {
    app.get('/trace', (c) => c.json({ trace: c.get('trace') }));
  },
});
