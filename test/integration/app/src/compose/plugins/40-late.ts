/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { definePlugin } from '@fastly/hono-fastly-compute/compose';

// The afterFilesRoutes phase: these routes answer only when no file does.
export default definePlugin({
  afterFilesRoutes: (app) => {
    app.get('/files/hello', (c) => c.text('late:hello'));
    app.get('/old', (c) => c.text('late:old'));
  },
});
