/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { definePlugin } from '@fastly/hono-fastly-compute/compose';

// The order of the middleware: the code before next() adds 'a' to the trace,
// and the code after next() adds 'a' to the header x-out.
export default definePlugin((app) => {
  app.use('*', async (c, next) => {
    c.set('trace', [ ...(c.get('trace') ?? []), 'a' ]);
    await next();
    c.res.headers.append('x-out', 'a');
  });
});
