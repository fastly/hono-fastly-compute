/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

/// <reference types="@fastly/js-compute" />

// The Compose host of the integration app: a step that serves "files" between
// the core phases and afterFilesRoutes, as the host of a static site does, and
// a fallback step. The app mounts this app at /compose.

import type { Hono } from 'hono';
import { CORE_PHASES, defineComposeHost } from '@fastly/hono-fastly-compute/compose';

// The "files" of the test: a request for one of these paths gets the text.
const FILES: Record<string, string> = {
  '/compose/files/hello': 'file:hello',
  '/compose/shadowed': 'file:shadowed',
};

export const helpers = {
  tag: 'integration-helpers',
};

export const host = defineComposeHost({
  steps: [
    CORE_PHASES,
    [ 'files', (app: Hono<any, any, any>) => app.use('*', async (c, next) => {
      const file = FILES[c.req.path];
      return file != null ? c.text(file) : next();
    }) ],
    'afterFilesRoutes',
    // A route, not app.notFound(): the notFound handler of a mounted app does
    // not run. The status is 200, because the app sends each 404 response on
    // to the origin backend (see fire() in ../index.ts).
    [ 'fallback', (app: Hono<any, any, any>) => app.all('*', (c) => c.text('fallback')) ],
  ],
  helpers,
});

declare module '@fastly/hono-fastly-compute/compose' {
  interface ComposeHostRegistry {
    host: typeof host;
  }
}
